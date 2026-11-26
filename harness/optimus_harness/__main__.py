"""Run the harness: `python -m optimus_harness` (reads .env)."""

import os

import uvicorn
from dotenv import load_dotenv

from .app import create_app
from .config import load_config


def main() -> None:
    load_dotenv()
    cfg = load_config()
    reload = os.environ.get("RELOAD") == "1"
    print(f"Optimus harness on http://{cfg.host}:{cfg.port} (provider={cfg.provider_label} at "
          f"{cfg.provider['base_url']}, model={cfg.model})")
    if reload:
        uvicorn.run("optimus_harness.app:create_app", factory=True, host=cfg.host, port=cfg.port, reload=True)
    else:
        uvicorn.run(create_app(cfg), host=cfg.host, port=cfg.port)


if __name__ == "__main__":
    main()
