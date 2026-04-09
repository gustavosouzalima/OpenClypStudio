"""Entrada de execução para ambiente local e produção."""

import os
import logging
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
from logging.handlers import RotatingFileHandler

import uvicorn

from env_loader import load_local_env


load_local_env()


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _open_browser(url: str):
    """Aguarda o servidor estar pronto antes de abrir o browser."""
    for _ in range(40):  # tenta por até 20s
        try:
            urllib.request.urlopen(f"{url}/api/health", timeout=1)
            break
        except Exception:
            time.sleep(0.5)
    webbrowser.open(url)


def _setup_logging(log_level: str) -> None:
    level = getattr(logging, log_level.upper(), logging.INFO)
    handlers: list[logging.Handler] = [logging.StreamHandler()]

    log_file = os.getenv("PIXEL_LOG_FILE", "").strip()
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        max_bytes = int(os.getenv("PIXEL_LOG_MAX_BYTES", "10485760"))
        backup_count = int(os.getenv("PIXEL_LOG_BACKUP_COUNT", "7"))
        handlers.append(
            RotatingFileHandler(
                log_path,
                maxBytes=max_bytes,
                backupCount=backup_count,
                encoding="utf-8",
            )
        )

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers=handlers,
        force=True,
    )


def main() -> None:
    host = os.getenv("PIXEL_HOST", "0.0.0.0")
    port = int(os.getenv("PIXEL_PORT", "8000"))
    log_level = os.getenv("PIXEL_LOG_LEVEL", "info")
    reload_enabled = _as_bool(os.getenv("PIXEL_RELOAD"), default=False)
    auto_open_browser = _as_bool(os.getenv("PIXEL_OPEN_BROWSER"), default=False)
    public_url = os.getenv("PIXEL_PUBLIC_URL", f"http://{host}:{port}")
    _setup_logging(log_level)

    print(f"OpenClyp Studio -> {public_url}")
    print("")
    print("[MODE] Backend API-only (não serve frontend/static)")
    print("[FRONTEND] Rode o frontend separadamente em http://localhost:3000")
    print("")
    print("Press Ctrl+C to stop.\n")

    if auto_open_browser:
        threading.Thread(target=_open_browser, args=(public_url,), daemon=True).start()

    uvicorn.run("server:app", host=host, port=port, reload=reload_enabled, log_level=log_level)


if __name__ == "__main__":
    main()
