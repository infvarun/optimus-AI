"""FastAPI app: session API with Server-Sent Events streaming."""

from __future__ import annotations

import asyncio
import hmac
import json
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from .config import HarnessConfig, load_config
from .sessions import HttpError, SessionManager


class MessageBody(BaseModel):
    prompt: str = Field(min_length=1, max_length=16_000)


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
            turn = sessions.send_turn(sid, body.prompt)
            try:
                while True:
                    try:
                        # Heartbeat every 15s keeps proxies from closing idle streams.
                        ev = await asyncio.wait_for(anext(turn), timeout=15)
                    except asyncio.TimeoutError:
                        if await request.is_disconnected():
                            break
                        yield ": ping\n\n"
                        continue
                    except StopAsyncIteration:
                        break
                    yield f"event: {ev['type']}\ndata: {json.dumps(ev, default=str)}\n\n"
            except HttpError as exc:
                yield f"event: error\ndata: {json.dumps({'type': 'error', 'message': exc.message})}\n\n"
                yield 'event: done\ndata: {"type": "done"}\n\n'
            except Exception as exc:  # noqa: BLE001
                yield f"event: error\ndata: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
                yield 'event: done\ndata: {"type": "done"}\n\n'
            finally:
                # Closing the generator aborts the agent if the turn didn't finish
                # (e.g. the client went away), so we stop spending tokens.
                await turn.aclose()

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
        )

    return app
