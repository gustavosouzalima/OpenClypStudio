"""Biblioteca local de intros/trilhas e sugestoes de fontes livres."""

from __future__ import annotations

import os
from pathlib import Path
import app_settings


SUPPORTED_VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm"}
SUPPORTED_AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}

FREE_MUSIC_SOURCES = [
    {
        "id": "pixabay_music",
        "label": "Pixabay Music",
        "site_url": "https://pixabay.com/music/",
        "license": "Gratis para uso comercial conforme a licenca da faixa.",
        "best_for": "shorts, reels e videos de ritmo acelerado",
    },
    {
        "id": "incompetech",
        "label": "Incompetech",
        "site_url": "https://incompetech.com/music/",
        "license": "Muitas faixas exigem atribuicao ao autor.",
        "best_for": "introducoes, trilhas de fundo e videos explicativos",
    },
    {
        "id": "free_music_archive",
        "label": "Free Music Archive",
        "site_url": "https://freemusicarchive.org/",
        "license": "Catalogo variado; confirme a licenca de cada faixa antes de publicar.",
        "best_for": "biblioteca ampla para nichos variados",
    },
    {
        "id": "openverse_audio",
        "label": "Openverse Audio",
        "site_url": "https://openverse.org/audio/",
        "license": "Busca em obras abertas e Creative Commons; verifique os termos da faixa.",
        "best_for": "descoberta de trilhas e efeitos livres",
    },
]


def _default_media_library_dir() -> Path:
    raw = (
        app_settings.get_setting("media_library_dir")
        or os.getenv("OPENCLYP_MEDIA_LIBRARY_DIR", "").strip()
        or os.getenv("PIXEL_MEDIA_LIBRARY_DIR", "").strip()
    )
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".transcritor" / "media_library"


def get_media_library_dir() -> Path:
    return _default_media_library_dir()


def get_intro_library_dir() -> Path:
    return get_media_library_dir() / "intros"


def get_music_library_dir() -> Path:
    return get_media_library_dir() / "music"


def ensure_media_library() -> None:
    get_intro_library_dir().mkdir(parents=True, exist_ok=True)
    get_music_library_dir().mkdir(parents=True, exist_ok=True)


def configure_media_library_dir(root_dir: str) -> dict:
    target = Path(root_dir).expanduser()
    target.mkdir(parents=True, exist_ok=True)
    probe = target / ".write_probe"
    probe.write_text("ok", encoding="utf-8")
    probe.unlink(missing_ok=True)
    app_settings.set_setting("media_library_dir", str(target.resolve()))
    return get_media_library_payload()


def _serialize_entry(path: Path) -> dict:
    stat = path.stat()
    return {
        "name": path.name,
        "path": str(path.resolve()),
        "size_bytes": stat.st_size,
        "modified_at": stat.st_mtime,
    }


def list_library_files(kind: str) -> list[dict]:
    ensure_media_library()
    if kind == "intro":
        directory = get_intro_library_dir()
        allowed_exts = SUPPORTED_VIDEO_EXTS
    elif kind == "music":
        directory = get_music_library_dir()
        allowed_exts = SUPPORTED_AUDIO_EXTS
    else:
        raise ValueError(f"Tipo de biblioteca invalido: {kind}")

    files = []
    for path in directory.iterdir():
        if path.is_file() and path.suffix.lower() in allowed_exts:
            files.append(_serialize_entry(path))
    files.sort(key=lambda item: item["modified_at"], reverse=True)
    return files


def get_media_library_payload() -> dict:
    ensure_media_library()
    root_dir = get_media_library_dir()
    intro_dir = get_intro_library_dir()
    music_dir = get_music_library_dir()
    return {
        "directories": {
            "root": str(root_dir.resolve()),
            "intro": str(intro_dir.resolve()),
            "music": str(music_dir.resolve()),
        },
        "intros": list_library_files("intro"),
        "music": list_library_files("music"),
        "free_sources": FREE_MUSIC_SOURCES,
    }
