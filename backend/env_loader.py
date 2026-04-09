"""Carregamento simples de arquivos .env locais sem dependencias externas."""

from __future__ import annotations

import os
from pathlib import Path


def load_local_env() -> None:
    """Carrega `.env.local` e `.env` da raiz do projeto, sem sobrescrever variaveis ja definidas."""
    base_dir = Path(__file__).resolve().parent
    for name in (".env.local", ".env"):
        env_path = base_dir / name
        if env_path.exists():
            _load_env_file(env_path)


def _load_env_file(path: Path) -> None:
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
