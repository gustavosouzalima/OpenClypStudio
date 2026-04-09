"""Sintese local de narracao em audio."""

from __future__ import annotations

import os
from pathlib import Path


def tts_available() -> bool:
    try:
        import pyttsx3  # noqa: F401
        return True
    except ImportError:
        return False


def synthesize_to_file(
    text: str,
    output_path: str,
    voice_hint: str = "",
    rate: int = 180,
    volume: float = 1.0,
    log_fn=None,
) -> str | None:
    if not text.strip():
        if log_fn:
            log_fn("Texto de narracao vazio.")
        return None
    try:
        import pyttsx3
    except ImportError:
        if log_fn:
            log_fn("pyttsx3 nao instalado.")
        return None

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    try:
        engine = pyttsx3.init()
        engine.setProperty("rate", int(rate))
        engine.setProperty("volume", max(0.0, min(1.0, float(volume))))
        if voice_hint:
            hint = voice_hint.lower()
            for voice in engine.getProperty("voices") or []:
                voice_blob = " ".join(
                    str(part).lower()
                    for part in [getattr(voice, "name", ""), getattr(voice, "id", ""), getattr(voice, "languages", "")]
                )
                if hint in voice_blob:
                    engine.setProperty("voice", voice.id)
                    break
        engine.save_to_file(text, str(out))
        engine.runAndWait()
        if out.exists() and out.stat().st_size > 0:
            return str(out.resolve())
        if log_fn:
            log_fn("TTS nao gerou arquivo de audio.")
        return None
    except Exception as e:  # pragma: no cover - depende do engine do sistema
        if log_fn:
            log_fn(f"Erro no TTS local: {e}")
        return None
