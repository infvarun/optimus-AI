"""FastAPI app: session API with Server-Sent Events streaming."""

from __future__ import annotations

import asyncio
import contextlib
import hmac
import json
from contextlib import asynccontextmanager
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from .config import HarnessConfig, load_config
from .sessions import HttpError, SessionManager


class MessageBody(BaseModel):
    prompt: str = Field(min_length=1, max_length=16_000)
    #: "auto": investigate until resolved (plans itself for complex work).
    #: "plan": write Plan.md and stop for approval; send a follow-up in "auto" to execute it.
    mode: Literal["auto", "plan"] = "auto"


def create_app(cfg: HarnessConfig | None = None) -> FastAPI:
    if cfg is None:
        # Local dev convenience. Real deployments should inject env vars from a
        # secret store (Key Vault, Vault, AWS Secrets Manager) instead.
        load_dotenv()
        cfg = load_config()

    sessions = SessionManager(cfg)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        await sessions.start()
        try:
            yield
        finally:
            await sessions.stop()

    app = FastAPI(title="Optimus harness", version="0.1.0", lifespan=lifespan)
    app.state.sessions = sessions
    app.state.cfg = cfg

    if cfg.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cfg.cors_origins,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.exception_handler(HttpError)
    async def _http_error(_req: Request, exc: HttpError):
        return JSONResponse({"error": exc.message}, status_code=exc.status)

    # --- Auth (placeholder) -------------------------------------------------
    # A shared bearer token is NOT enterprise auth. Swap for OIDC/SSO (Entra ID)
    # at a gateway or here before exposing beyond localhost.
    def require_token(authorization: str | None = Header(default=None)) -> None:
        if not cfg.api_token:
            return
        got = (authorization or "").removeprefix("Bearer ")
        if not hmac.compare_digest(got.encode(), cfg.api_token.encode()):
            raise HTTPException(status_code=401, detail="Unauthorized")

    @app.get("/healthz")
    async def healthz():
        return {"ok": True, "model": cfg.model, "provider": cfg.provider_label, "baseUrl": cfg.provider["base_url"]}

    api = [Depends(require_token)]

    @app.post("/api/sessions", status_code=201, dependencies=api)
    async def create_session():
        return {"id": await sessions.create()}

    @app.get("/api/sessions", dependencies=api)
    async def list_sessions():
        return {"sessions": sessions.list()}

    @app.get("/api/sessions/{sid}", dependencies=api)
    async def session_state(sid: str):
        """Current plan, last resolution and workspace files (for reconnecting UIs)."""
        return sessions.state(sid)

    @app.get("/api/sessions/{sid}/files", dependencies=api)
    async def list_files(sid: str):
        return {"files": sessions.files(sid)}

    @app.get("/api/sessions/{sid}/files/{name}", dependencies=api)
    async def read_file(sid: str, name: str):
        return PlainTextResponse(sessions.read_file(sid, name), media_type="text/markdown")

    @app.delete("/api/sessions/{sid}", dependencies=api)
    async def delete_session(sid: str):
        return Response(status_code=204 if await sessions.delete(sid) else 404)

    @app.post("/api/sessions/{sid}/abort", status_code=202, dependencies=api)
    async def abort_session(sid: str):
        await sessions.abort(sid)
        return {"aborted": True}

    @app.post("/api/sessions/{sid}/messages", dependencies=api)
    async def send_message(sid: str, body: MessageBody, request: Request):
        """Stream the reply as Server-Sent Events. Each `data:` line is a JSON
        event; the stream always ends with {"type": "done"}."""
        sessions.assert_ready(sid)  # 404 / 409 as JSON, before SSE headers

        async def stream():
            # The agent runs in its own task and feeds a queue, so a quiet period
            # (a local model thinking for a minute) never cancels it; we just send
            # SSE heartbeats meanwhile.
            q: asyncio.Queue[dict | None] = asyncio.Queue()

            async def produce() -> None:
                try:
                    async for ev in sessions.send_turn(sid, body.prompt, body.mode):
                        await q.put(ev)
                except HttpError as exc:
                    await q.put({"type": "error", "message": exc.message})
                    await q.put({"type": "done", "outcome": "error"})
                except Exception as exc:  # noqa: BLE001
                    await q.put({"type": "error", "message": str(exc) or type(exc).__name__})
                    await q.put({"type": "done", "outcome": "error"})
                finally:
                    await q.put(None)

            producer = asyncio.create_task(produce())
            try:
                while True:
                    try:
                        ev = await asyncio.wait_for(q.get(), timeout=15)
                    except asyncio.TimeoutError:
                        if await request.is_disconnected():
                            break
                        yield ": ping\n\n"  # keeps proxies from closing idle streams
                        continue
                    if ev is None:
                        break
                    yield f"event: {ev['type']}\ndata: {json.dumps(ev, default=str)}\n\n"
            finally:
                # If the client went away mid-run, cancelling the producer closes the
                # agent run, which aborts it so we stop spending tokens.
                if not producer.done():
                    producer.cancel()
                    with contextlib.suppress(asyncio.CancelledError, Exception):
                        await producer

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
        )

    return app
