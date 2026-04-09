"""Persisted app-wide settings for OpenClyp Studio."""

from __future__ import annotations

import json
import os
from pathlib import Path


def _resolve_data_dir() -> Path:
    candidates = [
        os.getenv("OPENCLYP_DATA_DIR", "").strip(),
        os.getenv("PIXEL_DATA_DIR", "").strip(),
        str(Path(__file__).parent / ".pixeltranscritor"),
        str(Path.home() / ".transcritor"),
    ]
    for raw in candidates:
        if not raw:
            continue
        candidate = Path(raw)
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            probe = candidate / ".write_test"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            return candidate
        except OSError:
            continue
    raise RuntimeError("Unable to resolve a writable data directory for app settings.")


SETTINGS_PATH = _resolve_data_dir() / "app_settings.json"


def load_settings() -> dict:
    if not SETTINGS_PATH.exists():
        return {}
    try:
        return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_settings(settings: dict) -> dict:
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(
        json.dumps(settings, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    return settings


def get_setting(key: str, default=None):
    return load_settings().get(key, default)


def set_setting(key: str, value):
    settings = load_settings()
    settings[key] = value
    save_settings(settings)
    return value
