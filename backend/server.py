"""FastAPI server — backend do Transcritor Local."""

from __future__ import annotations

import asyncio
import gc
import io
import json
import logging
import mimetypes
import os
import shutil
import sqlite3
import hmac
import subprocess
import threading
import time
import uuid
import zipfile
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Body, WebSocket, WebSocketDisconnect, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from env_loader import load_local_env

load_local_env()


def _resolve_data_dir() -> Path:
    repo_root_data_dir = Path(__file__).resolve().parent.parent / ".pixeltranscritor"
    candidates = [
        os.getenv("PIXEL_DATA_DIR", "").strip(),
        os.getenv("OPENCLYP_DATA_DIR", "").strip(),
        str(repo_root_data_dir),
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
            os.environ["PIXEL_DATA_DIR"] = str(candidate)
            os.environ.setdefault("OPENCLYP_DATA_DIR", str(candidate))
            return candidate
        except OSError:
            continue
    raise RuntimeError("Nao foi possivel determinar um diretorio gravavel para os dados do OpenClyp Studio.")

import importlib


class _LazyModule:
    """Adia o import de um módulo Python até o primeiro acesso a seus atributos."""

    def __init__(self, name: str) -> None:
        object.__setattr__(self, "_name", name)
        object.__setattr__(self, "_mod", None)

    def _load(self):
        mod = object.__getattribute__(self, "_mod")
        if mod is None:
            name = object.__getattribute__(self, "_name")
            mod = importlib.import_module(name)
            object.__setattr__(self, "_mod", mod)
        return mod

    def __getattr__(self, item):
        return getattr(self._load(), item)

    def __setattr__(self, item, value):
        setattr(self._load(), item, value)


import audio
import downloader as dl_module
import formatters
import history
import ai_providers
import compiler as comp_module
import projects as proj_module
import documents as doc_module
import music_catalog
import youtube_api
import tts as tts_module
import app_settings
import job_store
from templates_ia import TEMPLATES, get_system_prompt

# Módulos com imports pesados de ML — carregados apenas no primeiro uso
tr_module = _LazyModule("transcription")
diarization = _LazyModule("diarization")

def FASTER_WHISPER_AVAILABLE() -> bool:  # noqa: N802
    return tr_module.FASTER_WHISPER_AVAILABLE

logger = logging.getLogger(__name__)


def _rss_mb() -> str:
    """Return current process RSS in MB (best-effort)."""
    try:
        import resource
        rss_bytes = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
        return f"{rss_bytes / (1024 * 1024):.0f}MB"
    except Exception:
        pass
    try:
        import psutil
        return f"{psutil.Process().memory_info().rss / (1024 * 1024):.0f}MB"
    except Exception:
        pass
    return "?"

EDITOR_PRESETS = {
    "dynamic": {
        "label": "Dinâmico",
        "tracks": [1, 2, 1, 3],
        "transition": "dissolve",
        "overlay_style": "punch",
        "output_format": "portrait",
        "frame_fit_mode": "cover",
        "quality": "high",
        "overlap_seconds": 0.5,
    },
    "cinematic": {
        "label": "Cinematográfico",
        "tracks": [1, 1, 2],
        "transition": "fade",
        "overlay_style": "lower_third",
        "output_format": "landscape",
        "frame_fit_mode": "contain",
        "quality": "high",
        "overlap_seconds": 0.25,
    },
    "news": {
        "label": "Noticioso",
        "tracks": [1, 1, 1],
        "transition": "none",
        "overlay_style": "classic",
        "output_format": "landscape",
        "frame_fit_mode": "contain",
        "quality": "high",
        "overlap_seconds": 0.0,
    },
    "shorts_pro": {
        "label": "Shorts Pro",
        "tracks": [1, 2, 3, 2],
        "transition": "slideleft",
        "overlay_style": "punch",
        "output_format": "portrait",
        "frame_fit_mode": "cover",
        "quality": "high",
        "overlap_seconds": 0.7,
    },
}

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DATA_DIR = _resolve_data_dir()

UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

COMPILADOS_DIR = DATA_DIR / "compilados"
COMPILADOS_DIR.mkdir(parents=True, exist_ok=True)

TRANSCRIBE_CHUNK_SECONDS = max(0, int(os.getenv("PIXEL_TRANSCRIBE_CHUNK_SECONDS", "60")))
TRANSCRIBE_CHUNK_OVERLAP_SECONDS = max(0.0, float(os.getenv("PIXEL_TRANSCRIBE_CHUNK_OVERLAP_SECONDS", "1.0")))

logger.info(
    "Transcription config: chunk=%ds, overlap=%.1fs",
    TRANSCRIBE_CHUNK_SECONDS,
    TRANSCRIBE_CHUNK_OVERLAP_SECONDS,
)


def _is_path_within_dir(path: Path, parent_dir: Path) -> bool:
    try:
        path.resolve().relative_to(parent_dir.resolve())
        return True
    except ValueError:
        return False


def _env_int(name: str, default: int, *, min_value: int = 0) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError:
        value = default
    return max(min_value, value)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


DEFAULT_TRANSCRIBE_MODEL = os.getenv("PIXEL_DEFAULT_WHISPER_MODEL", "medium").strip() or "medium"
DEFAULT_TRANSCRIBE_BATCH_SIZE = _env_int("PIXEL_DEFAULT_BATCH_SIZE", 4, min_value=1)
TRANSCRIBE_MAX_BATCH_SIZE_CPU = _env_int("PIXEL_MAX_BATCH_SIZE_CPU", 4, min_value=1)
TRANSCRIBE_MAX_BATCH_SIZE_GPU = _env_int("PIXEL_MAX_BATCH_SIZE_GPU", 32, min_value=1)
TRANSCRIBE_FORCE_CPU_SAFE_MODEL = _env_bool("PIXEL_FORCE_CPU_SAFE_MODEL", True)
TRANSCRIBE_CPU_SAFE_MODEL = os.getenv("PIXEL_CPU_SAFE_MODEL", "medium").strip() or "medium"
CPU_HEAVY_WHISPER_MODELS = {"large", "large-v1", "large-v2", "large-v3", "large-v3-turbo"}
DEFAULT_BEAM_SIZE = _env_int("PIXEL_DEFAULT_BEAM_SIZE", 1, min_value=1)

logger.info(
    "Transcription defaults: model=%s, batch=%d, beam=%d, max_batch_cpu=%d, force_cpu_safe=%s, cpu_safe_model=%s",
    DEFAULT_TRANSCRIBE_MODEL,
    DEFAULT_TRANSCRIBE_BATCH_SIZE,
    DEFAULT_BEAM_SIZE,
    TRANSCRIBE_MAX_BATCH_SIZE_CPU,
    TRANSCRIBE_FORCE_CPU_SAFE_MODEL,
    TRANSCRIBE_CPU_SAFE_MODEL,
)


def _resolve_transcribe_runtime(
    model: str,
    batch_size: int,
    log_fn=None,
) -> tuple[str, int]:
    requested_model = (model or "").strip() or DEFAULT_TRANSCRIBE_MODEL
    requested_batch = max(1, int(batch_size))

    cuda_available = bool(getattr(tr_module, "CUDA_AVAILABLE", False))
    max_batch = TRANSCRIBE_MAX_BATCH_SIZE_GPU if cuda_available else TRANSCRIBE_MAX_BATCH_SIZE_CPU
    resolved_batch = min(requested_batch, max_batch)
    resolved_model = requested_model

    if (
        not cuda_available
        and TRANSCRIBE_FORCE_CPU_SAFE_MODEL
        and requested_model in CPU_HEAVY_WHISPER_MODELS
    ):
        resolved_model = TRANSCRIBE_CPU_SAFE_MODEL
        if log_fn:
            log_fn(
                f"⚙️ CPU mode: model '{requested_model}' adjusted to "
                f"'{resolved_model}' (configure PIXEL_CPU_SAFE_MODEL / PIXEL_FORCE_CPU_SAFE_MODEL)."
            )

    if resolved_batch != requested_batch and log_fn:
        log_fn(
            f"⚙️ Batch size adjusted from {requested_batch} to {resolved_batch} "
            f"for current runtime (max={max_batch})."
        )

    return resolved_model, resolved_batch


def _build_wav_chunks(
    audio_path: str,
    duration: float,
    chunk_seconds: int,
    overlap_seconds: float,
    log_fn=None,
) -> tuple[list[tuple[str, float]], list[str]]:
    chunk_dir = UPLOAD_DIR / "chunks"
    chunk_dir.mkdir(parents=True, exist_ok=True)

    chunks: list[tuple[str, float]] = []
    temp_files: list[str] = []
    start = 0.0
    index = 0

    while start < duration:
        chunk_duration = min(float(chunk_seconds) + overlap_seconds, duration - start)
        chunk_path = chunk_dir / f"{Path(audio_path).stem}_chunk_{uuid.uuid4().hex}_{index:04d}.wav"
        cmd = [
            "ffmpeg",
            "-threads",
            "0",
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{chunk_duration:.3f}",
            "-i",
            audio_path,
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            "-y",
            str(chunk_path),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=3600)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("FFmpeg timed out while splitting audio into chunks.") from exc
        except FileNotFoundError as exc:
            raise RuntimeError("FFmpeg not found while splitting audio into chunks.") from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or b"").decode(errors="ignore")[:240]
            raise RuntimeError(f"Failed to split audio chunk: {stderr}") from exc

        chunks.append((str(chunk_path), start))
        temp_files.append(str(chunk_path))
        start += float(chunk_seconds)
        index += 1

    if log_fn and len(chunks) > 1:
        log_fn(f"🔪 Chunking enabled: {len(chunks)} chunk(s) of ~{chunk_seconds}s")

    return chunks, temp_files


def _transcribe_single_chunk(
    batched,
    chunk_path: str,
    chunk_offset: float,
    chunk_index: int,
    language: str | None,
    beam_size: int,
    batch_size: int,
) -> tuple[list, str | None]:
    """Transcribe one audio chunk. Safe to call from a ThreadPoolExecutor."""
    segments_gen, info = batched.transcribe(
        chunk_path,
        language=language,
        beam_size=beam_size,
        batch_size=batch_size,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
        condition_on_previous_text=False,
    )
    detected = getattr(info, "language", None)
    segments = []
    for seg in segments_gen:
        segments.append(
            SimpleNamespace(
                text=seg.text,
                start=chunk_offset + float(seg.start),
                end=chunk_offset + float(seg.end),
            )
        )
    return segments, detected


def _transcribe_with_optional_chunking(
    *,
    batched,
    audio_path: str,
    duration: float,
    language: str | None,
    beam_size: int,
    batch_size: int,
    is_cancelled,
    progress_fn=None,
    progress_start: int = 0,
    progress_span: int = 100,
    log_fn=None,
) -> tuple[list, str | None, list[str]]:
    import resource_tuner
    from concurrent.futures import ThreadPoolExecutor, as_completed

    if duration <= 0:
        duration = 1.0

    chunk_seconds = TRANSCRIBE_CHUNK_SECONDS
    overlap_seconds = TRANSCRIBE_CHUNK_OVERLAP_SECONDS

    temp_chunk_files: list[str] = []
    if chunk_seconds > 0 and duration > float(chunk_seconds):
        chunks, temp_chunk_files = _build_wav_chunks(
            audio_path=audio_path,
            duration=duration,
            chunk_seconds=chunk_seconds,
            overlap_seconds=overlap_seconds,
            log_fn=log_fn,
        )
    else:
        chunks = [(audio_path, 0.0)]

    # ── Single chunk: fast path (no thread pool overhead) ──
    if len(chunks) == 1:
        if log_fn:
            log_fn(f"[mem] RSS before transcribe: {_rss_mb()}")
            log_fn(f"   Transcribing (beam={beam_size}, batch={batch_size})...")
        segs, detected = _transcribe_single_chunk(
            batched, chunks[0][0], chunks[0][1], 0,
            language, beam_size, batch_size,
        )
        if progress_fn:
            progress_fn(progress_start + progress_span)
        return segs, detected, temp_chunk_files

    # ── Multiple chunks: parallel transcription ──
    max_workers = resource_tuner.compute_parallel_chunks()
    if log_fn:
        log_fn(
            f"[adaptive] {len(chunks)} chunks, processing {max_workers} in parallel "
            f"(beam={beam_size}, batch={batch_size})"
        )
        log_fn(f"[mem] RSS before parallel transcribe: {_rss_mb()}")

    # Results keyed by chunk_index for ordered merge
    chunk_results: dict[int, tuple[list, str | None]] = {}
    detected_language: str | None = None
    completed_count = 0

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {}
        for chunk_index, (chunk_path, chunk_offset) in enumerate(chunks):
            if is_cancelled():
                break
            future = pool.submit(
                _transcribe_single_chunk,
                batched, chunk_path, chunk_offset, chunk_index,
                language, beam_size, batch_size,
            )
            futures[future] = chunk_index

        for future in as_completed(futures):
            if is_cancelled():
                # Cancel remaining futures
                for f in futures:
                    f.cancel()
                break

            chunk_idx = futures[future]
            try:
                segs, detected = future.result()
                chunk_results[chunk_idx] = (segs, detected)
            except Exception as exc:
                if log_fn:
                    log_fn(f"   Chunk {chunk_idx + 1} failed: {exc}")
                chunk_results[chunk_idx] = ([], None)

            completed_count += 1
            if log_fn:
                log_fn(f"   Chunk {chunk_idx + 1}/{len(chunks)} done ({len(chunk_results.get(chunk_idx, ([],))[0])} segs)")

            # Check memory pressure and log it
            if resource_tuner.check_memory_pressure() and log_fn:
                log_fn(f"[mem] WARNING: memory pressure detected (RSS={_rss_mb()})")

            # Emit progress based on completed fraction
            if progress_fn:
                frac = completed_count / len(chunks)
                pct = min(
                    progress_start + int(frac * max(progress_span, 1)),
                    progress_start + progress_span,
                )
                progress_fn(pct)

    # ── Merge results in chunk order with overlap dedup ──
    segments_list: list = []
    covered_until = 0.0

    for chunk_index in range(len(chunks)):
        result = chunk_results.get(chunk_index)
        if result is None:
            continue
        segs, detected = result
        if detected_language is None and detected:
            detected_language = detected

        _, chunk_offset = chunks[chunk_index]
        for seg in segs:
            # Deduplicate overlap region
            if chunk_index > 0 and seg.end <= covered_until + 0.01:
                continue
            segments_list.append(seg)

        if chunk_index < len(chunks) - 1:
            nominal_end = min(duration, chunk_offset + float(chunk_seconds) + overlap_seconds)
            covered_until = max(covered_until, nominal_end)

    gc.collect()
    if log_fn:
        log_fn(f"[mem] RSS after parallel transcribe: {_rss_mb()}")

    return segments_list, detected_language, temp_chunk_files

# ── Job Manager ──────────────────────────────────────────────────────────────
# _jobs is the in-memory hot cache; job_store provides SQLite persistence so
# jobs survive backend restarts.  On startup job_store.init() populates its
# internal cache; we keep _jobs as a *reference* to that cache so every
# existing read/write goes through the same object.
job_store.init(DATA_DIR)
_jobs: dict[str, dict] = job_store._cache  # shared reference
_ws_queues: dict[str, asyncio.Queue] = {}  # job_id → asyncio.Queue
_API_KEY = os.getenv("PIXEL_API_KEY", "").strip()


def _cors_origins() -> list[str]:
    raw = os.getenv("PIXEL_CORS_ORIGINS", "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


def _require_api_key(
    x_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> None:
    """Protege endpoints sensíveis com API key quando PIXEL_API_KEY está definido."""
    if not _API_KEY:
        return

    provided = (x_api_key or "").strip()
    if not provided and authorization:
        parts = authorization.split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            provided = parts[1].strip()

    if not provided or not hmac.compare_digest(provided, _API_KEY):
        raise HTTPException(status_code=401, detail="API key inválida ou ausente")


def _new_job() -> str:
    return job_store.new_job()


def _job_send(job_id: str, loop: asyncio.AbstractEventLoop, msg: dict) -> None:
    """Thread-safe: coloca mensagem na fila do WebSocket."""
    q = _ws_queues.get(job_id)
    if q:
        loop.call_soon_threadsafe(q.put_nowait, msg)


def _job_finish(job_id: str, *, status: str, result=None, error: str | None = None) -> None:
    """Mark a job as done/error in both cache and SQLite."""
    job = _jobs.get(job_id)
    if job is None:
        return
    job["status"] = status
    if status == "done":
        job["progress"] = 100
    if result is not None:
        job["result"] = result
    if error is not None:
        job["error"] = error
    job_store.finish(job_id, status=status, result=result, error=error)


# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="OpenClyp Studio", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ── Jobs ──────────────────────────────────────────────────────────────────────

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Retorna o status atual de um job para polling via HTTP."""
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return {**job, "job_id": job_id}


# ── Health ───────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    """Retorna o estado de saúde do backend API-only."""
    return {
        "status": "ok",
        "mode": "api-only",
        "service": "OpenClyp Studio Backend",
    }


@app.get("/api/system-info")
async def system_info():
    info = {"device": "cpu", "gpu_name": None, "vram_mb": None}
    if tr_module.CUDA_AVAILABLE:
        try:
            import torch
            props = torch.cuda.get_device_properties(0)
            info["device"] = "cuda"
            info["gpu_name"] = torch.cuda.get_device_name(0)
            info["vram_mb"] = props.total_memory // 1024 ** 2
        except Exception:
            pass
    return info


@app.get("/api/system/deps")
async def system_deps():
    ffmpeg_version = None
    ffmpeg_available = shutil.which("ffmpeg") is not None
    if ffmpeg_available:
        try:
            completed = subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                text=True,
                check=False,
            )
            first_line = (completed.stdout or "").splitlines()[0].strip()
            ffmpeg_version = first_line or None
        except Exception:
            ffmpeg_version = None

    deps = {
        "ffmpeg": {
            "available": ffmpeg_available,
            "version": ffmpeg_version,
        },
        "gpu": {
            "device": "cpu",
            "name": None,
            "vram_mb": None,
        },
    }

    if tr_module.CUDA_AVAILABLE:
        try:
            import torch

            props = torch.cuda.get_device_properties(0)
            deps["gpu"] = {
                "device": "cuda",
                "name": torch.cuda.get_device_name(0),
                "vram_mb": props.total_memory // 1024**2,
            }
        except Exception:
            pass

    return deps


@app.post("/api/upload")
async def upload_files(files: list[UploadFile] = File(...), _: None = Depends(_require_api_key)):
    """Recebe arquivos do browser e salva em disco. Retorna os paths."""
    saved_paths: list[str] = []
    for f in files:
        filename = Path(f.filename).name
        if not filename:
            raise HTTPException(status_code=422, detail="Nome de arquivo inválido")
        dest = UPLOAD_DIR / filename
        contents = await f.read()
        dest.write_bytes(contents)
        saved_paths.append(str(dest))
    return {"paths": saved_paths}


# ── AI Providers ─────────────────────────────────────────────────────────────

class AIRequest(BaseModel):
    text: str
    template: str
    model: str
    provider: str  # "lm_studio", "ollama", "zai"
    custom_prompt: str | None = None
    observation: str | None = None
    config: dict = Field(default_factory=dict)  # {base_url, api_key, etc.}
    max_tokens: int | None = None  # Limite de tokens da resposta


class UpdateMediaLibraryPathRequest(BaseModel):
    root_dir: str

class UpdateAiKeysRequest(BaseModel):
    gemini_api_key: str | None = None
    openai_api_key: str | None = None


def _resolve_ai_key(provider: str) -> tuple[str, str]:
    if provider == "gemini":
        env_key = os.getenv("GEMINI_API_KEY", "").strip()
        if env_key:
            return env_key, "env"
        setting_key = str(app_settings.get_setting("gemini_api_key", "") or "").strip()
        if setting_key:
            return setting_key, "settings"
        return "", "none"
    if provider == "openai":
        env_key = os.getenv("OPENAI_API_KEY", "").strip()
        if env_key:
            return env_key, "env"
        setting_key = str(app_settings.get_setting("openai_api_key", "") or "").strip()
        if setting_key:
            return setting_key, "settings"
        return "", "none"
    return "", "none"


@app.get("/api/ai/status")
async def ai_status(provider: str, config: str = "{}"):
    """Verifica status e lista modelos do provedor."""
    import json
    cfg = json.loads(config)
    connected = await ai_providers.is_connected(provider, cfg)
    models = await ai_providers.list_models(provider, cfg) if connected else []
    return {"connected": connected, "models": models}


@app.get("/api/ai/defaults")
async def ai_defaults():
    gemini_model = os.getenv("GEMINI_MODEL", "").strip()
    openai_model = os.getenv("OPENAI_MODEL", "").strip()
    gemini_key, gemini_key_source = _resolve_ai_key("gemini")
    openai_key, openai_key_source = _resolve_ai_key("openai")

    preferred_provider = "gemini"
    preferred_model = gemini_model
    source = ".env.local/.env"

    if gemini_key or gemini_model:
        preferred_provider = "gemini"
        preferred_model = gemini_model
    elif openai_key or openai_model:
        preferred_provider = "openai"
        preferred_model = openai_model

    if gemini_key_source == "settings" or openai_key_source == "settings":
        source = "settings"

    return {
        "preferred_provider": preferred_provider,
        "preferred_model": preferred_model,
        "source": source,
    }


@app.get("/api/settings/ai-keys")
async def get_ai_keys_settings():
    gemini_key, gemini_source = _resolve_ai_key("gemini")
    openai_key, openai_source = _resolve_ai_key("openai")
    return {
        "gemini": {
            "has_key": bool(gemini_key),
            "source": gemini_source,
        },
        "openai": {
            "has_key": bool(openai_key),
            "source": openai_source,
        },
    }


@app.post("/api/settings/ai-keys")
async def update_ai_keys_settings(
    req: UpdateAiKeysRequest = Body(...),
    _: None = Depends(_require_api_key),
):
    if req.gemini_api_key is not None:
        app_settings.set_setting("gemini_api_key", req.gemini_api_key.strip())
    if req.openai_api_key is not None:
        app_settings.set_setting("openai_api_key", req.openai_api_key.strip())
    return await get_ai_keys_settings()


@app.get("/api/media-library")
async def get_media_library():
    return music_catalog.get_media_library_payload()


@app.get("/api/settings/media-library")
async def get_media_library_settings():
    payload = music_catalog.get_media_library_payload()
    return {
        "root_dir": payload["directories"]["root"],
        "intro_dir": payload["directories"]["intro"],
        "music_dir": payload["directories"]["music"],
        "source": (
            "app_settings"
            if app_settings.get_setting("media_library_dir")
            else "OPENCLYP_MEDIA_LIBRARY_DIR"
            if os.getenv("OPENCLYP_MEDIA_LIBRARY_DIR", "").strip()
            else "PIXEL_MEDIA_LIBRARY_DIR"
            if os.getenv("PIXEL_MEDIA_LIBRARY_DIR", "").strip()
            else "default"
        ),
    }


@app.post("/api/settings/media-library")
async def update_media_library_settings(
    req: UpdateMediaLibraryPathRequest = Body(...),
    _: None = Depends(_require_api_key),
):
    if not req.root_dir.strip():
        raise HTTPException(status_code=422, detail="root_dir is required")
    try:
        payload = music_catalog.configure_media_library_dir(req.root_dir.strip())
    except OSError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to configure media library path: {exc}",
        ) from exc
    return {
        "root_dir": payload["directories"]["root"],
        "intro_dir": payload["directories"]["intro"],
        "music_dir": payload["directories"]["music"],
        "source": "app_settings",
        "library": payload,
    }


@app.post("/api/media-library/upload")
async def upload_media_library_file(
    kind: str = Form(...),
    file: UploadFile = File(...),
    _: None = Depends(_require_api_key),
):
    music_catalog.ensure_media_library()
    safe_name = Path(file.filename or "").name
    if not safe_name:
        raise HTTPException(status_code=422, detail="Nome de arquivo invalido")

    ext = Path(safe_name).suffix.lower()
    if kind == "intro":
        target_dir = music_catalog.get_intro_library_dir()
        allowed_exts = music_catalog.SUPPORTED_VIDEO_EXTS
    elif kind == "music":
        target_dir = music_catalog.get_music_library_dir()
        allowed_exts = music_catalog.SUPPORTED_AUDIO_EXTS
    else:
        raise HTTPException(status_code=422, detail="Tipo de biblioteca invalido")

    if ext not in allowed_exts:
        raise HTTPException(status_code=415, detail="Tipo de arquivo nao suportado para esta biblioteca")

    target_dir.mkdir(parents=True, exist_ok=True)
    destination = target_dir / safe_name
    contents = await file.read()
    destination.write_bytes(contents)
    return music_catalog.get_media_library_payload()


@app.get("/api/youtube/status")
async def get_youtube_status():
    try:
        return youtube_api.get_status()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/youtube/connect")
async def connect_youtube(_: None = Depends(_require_api_key)):
    try:
        return youtube_api.connect(open_browser=False)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/youtube/disconnect")
async def disconnect_youtube(_: None = Depends(_require_api_key)):
    youtube_api.disconnect()
    return {"connected": False}


@app.post("/api/youtube/credentials")
async def upload_youtube_credentials(
    file: UploadFile = File(...),
    _: None = Depends(_require_api_key),
):
    safe_name = Path(file.filename or "").name.lower()
    if not safe_name.endswith(".json"):
        raise HTTPException(status_code=415, detail="Envie um arquivo JSON de credenciais OAuth")
    contents = await file.read()
    saved_path = youtube_api.save_client_secrets(contents)
    return {"saved": True, "path": saved_path}


@app.post("/api/ai/process")
async def ai_process(req: AIRequest):
    try:
        system_prompt = get_system_prompt(req.template, req.custom_prompt)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if req.observation:
        system_prompt += f"\n\nObservação adicional do usuário: {req.observation}"

    try:
        result = await ai_providers.generate(
            text=req.text,
            system_prompt=system_prompt,
            model=req.model,
            provider=req.provider,
            config=req.config,
            max_tokens=req.max_tokens,
        )
        # Remove "Thinking Process" ou "reasoning" do resultado (modelos que expõe pensamento interno)
        result = _remove_thinking_process(result)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return {"result": result}


def _remove_thinking_process(text: str) -> str:
    """Remove pensamento interno exposto por alguns modelos antes de retornar ao usuário."""
    import re

    # Remove tudo até encontrar o primeiro markdown header (##) que indica o início real
    lines = text.split('\n')
    start_idx = 0

    for i, line in enumerate(lines):
        line_stripped = line.strip()
        # Procura por ## Header markdown (o início real da documentação)
        if re.match(r'^##\s+\w+', line_stripped):
            start_idx = i
            break
        # Procura por marcadores de fim do thinking process
        if re.search(r'\*Content Integration:\*|\*Let\'s finalize|\*Ready to generate', line_stripped, re.IGNORECASE):
            # Pula essa linha e começa na próxima
            start_idx = i + 1
            break

    if start_idx > 0:
        text = '\n'.join(lines[start_idx:])

    return text.strip()


class CreateDocumentProjectRequest(BaseModel):
    name: str
    description: str = ""


class SaveDocumentRequest(BaseModel):
    project_id: str
    title: str
    content: str
    template_key: str = ""
    provider: str = ""
    model: str = ""
    prompt_observation: str = ""
    source_history_ids: list[str] = Field(default_factory=list)
    source_files: list[dict] = Field(default_factory=list)


class UpdateDocumentRequest(BaseModel):
    title: str
    content: str
    template_key: str = ""
    provider: str = ""
    model: str = ""
    prompt_observation: str = ""
    source_history_ids: list[str] = Field(default_factory=list)
    source_files: list[dict] = Field(default_factory=list)


class GenerateBacklogRequest(BaseModel):
    model: str
    provider: str
    config: dict = Field(default_factory=dict)
    max_tokens: int | None = None


class SyncDocumentToCompilerRequest(BaseModel):
    compiler_project_id: str
    use_document_title: bool = True
    use_document_content_as_briefing: bool = True
    use_existing_script_meta: bool = True




# ── Templates ─────────────────────────────────────────────────────────────────
@app.get("/api/templates")
async def list_templates():
    return [
        {"key": k, "label": v["label"], "description": v["description"]}
        for k, v in TEMPLATES.items()
    ]


# ── Document Projects ────────────────────────────────────────────────────────
@app.post("/api/document-projects", status_code=201)
async def create_document_project(req: CreateDocumentProjectRequest, _: None = Depends(_require_api_key)):
    if not req.name.strip():
        raise HTTPException(status_code=422, detail="Nome do projeto documental nao pode ser vazio")
    return doc_module.create_project(req.name.strip(), req.description.strip())


@app.get("/api/document-projects")
async def list_document_projects():
    return doc_module.list_projects()


@app.get("/api/document-projects/{project_id}")
async def get_document_project(project_id: str):
    project = doc_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto documental nao encontrado")
    return project


@app.delete("/api/document-projects/{project_id}", status_code=204)
async def delete_document_project(project_id: str, _: None = Depends(_require_api_key)):
    doc_module.delete_project(project_id)


@app.post("/api/document-projects/{project_id}/documents", status_code=201)
async def save_document_in_project(project_id: str, req: SaveDocumentRequest, _: None = Depends(_require_api_key)):
    project = doc_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto documental nao encontrado")
    if req.project_id != project_id:
        raise HTTPException(status_code=422, detail="project_id inconsistente com a rota")
    if not req.title.strip():
        raise HTTPException(status_code=422, detail="Titulo do documento nao pode ser vazio")
    return doc_module.create_document(
        project_id=project_id,
        title=req.title.strip(),
        content=req.content,
        template_key=req.template_key,
        provider=req.provider,
        model=req.model,
        prompt_observation=req.prompt_observation,
        source_history_ids=req.source_history_ids,
        source_files=req.source_files,
    )


@app.get("/api/documents/{document_id}")
async def get_document(document_id: str):
    document = doc_module.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Documento nao encontrado")
    return document


@app.post("/api/documents/{document_id}/update")
async def update_document(document_id: str, req: UpdateDocumentRequest, _: None = Depends(_require_api_key)):
    document = doc_module.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Documento nao encontrado")
    return doc_module.update_document(
        document_id,
        title=req.title.strip(),
        content=req.content,
        template_key=req.template_key,
        provider=req.provider,
        model=req.model,
        prompt_observation=req.prompt_observation,
        source_history_ids=req.source_history_ids,
        source_files=req.source_files,
    )


@app.delete("/api/documents/{document_id}", status_code=204)
async def delete_document(document_id: str, _: None = Depends(_require_api_key)):
    doc_module.delete_document(document_id)


@app.get("/api/documents/{document_id}/export")
async def export_document(document_id: str):
    document = doc_module.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Documento nao encontrado")
    filename = f"{(document.get('title') or 'document').strip() or 'document'}.md"
    return StreamingResponse(
        io.BytesIO((document.get("content") or "").encode("utf-8")),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/document-projects/{project_id}/export")
async def export_document_project(project_id: str):
    project = doc_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto documental nao encontrado")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, document in enumerate(project.get("documents") or [], 1):
            name = (document.get("title") or f"document_{idx}").strip() or f"document_{idx}"
            zf.writestr(f"{name}.md", document.get("content") or "")
    buf.seek(0)
    filename = f"{(project.get('name') or 'document-project').strip() or 'document-project'}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/documents/{document_id}/revisions")
async def list_document_revisions(document_id: str):
    document = doc_module.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Documento nao encontrado")
    return doc_module.list_revisions(document_id)


@app.post("/api/documents/{document_id}/restore/{revision_id}")
async def restore_document_revision(document_id: str, revision_id: str, _: dict = None):
    restored = doc_module.restore_revision(document_id, revision_id)
    if restored is None:
        raise HTTPException(status_code=404, detail="Revisao nao encontrada")
    return restored


@app.post("/api/documents/{document_id}/generate-backlog")
async def generate_document_backlog(document_id: str, req: GenerateBacklogRequest):
    document = doc_module.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Documento nao encontrado")
    project = doc_module.get_project(document["project_id"])
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto documental nao encontrado")
    try:
        result = await ai_providers.generate(
            text=document.get("content") or "",
            system_prompt=_build_backlog_prompt(project, document),
            model=req.model,
            provider=req.provider,
            config=req.config,
            max_tokens=req.max_tokens,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    payload = _parse_script_json(result)
    if payload is None or not isinstance(payload.get("items"), list):
        preview = result[:400] if result else "(resposta vazia)"
        raise HTTPException(status_code=422, detail=f"IA nao retornou JSON valido para backlog. Resposta recebida: {preview}")
    items = doc_module.replace_backlog_items(project["id"], document_id, payload["items"])
    return {"items": items, "project_id": project["id"], "document_id": document_id}


@app.post("/api/documents/{document_id}/sync-to-compiler")
async def sync_document_to_compiler(document_id: str, req: SyncDocumentToCompilerRequest, _: None = Depends(_require_api_key)):
    document = doc_module.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Documento nao encontrado")
    compiler_project = proj_module.get_project(req.compiler_project_id)
    if compiler_project is None:
        raise HTTPException(status_code=404, detail="Projeto do compilador nao encontrado")

    topic = compiler_project.get("topic") or ""
    if req.use_document_title:
        topic = (document.get("title") or topic).strip()

    config = {**(compiler_project.get("config") or {})}
    config["linked_document_id"] = document_id
    if req.use_document_content_as_briefing:
        config["document_briefing"] = _extract_briefing_snippet(document.get("content") or "")
    if req.use_existing_script_meta:
        config["document_sync_meta"] = {
            "title": document.get("title") or "",
            "template_key": document.get("template_key") or "",
            "provider": document.get("provider") or "",
            "model": document.get("model") or "",
        }

    updated = proj_module.update_project(
        req.compiler_project_id,
        topic=topic,
        config=config,
    )
    updated["videos"] = proj_module.list_project_videos(req.compiler_project_id)
    return {"compiler_project": updated, "document_id": document_id}


# ── Histórico ─────────────────────────────────────────────────────────────────
@app.get("/api/history")
async def get_history():
    return history.list_all()


@app.get("/api/history/export")
async def export_history():
    """Exporta todas as transcrições do histórico como arquivo ZIP."""
    items = history.list_all()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in items:
            fp = item.get("filepath", "")
            if fp and os.path.exists(fp):
                zf.write(fp, os.path.basename(fp))
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=historico_transcricoes.zip"},
    )


@app.get("/api/history/{record_id}")
async def get_history_item(record_id: str):
    item = history.get(record_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Transcrição não encontrada")
    return item


@app.delete("/api/history/{record_id}", status_code=204)
async def delete_history_item(record_id: str, delete_file: bool = False):
    item = history.get(record_id)
    if item is None:
        return

    if delete_file:
        if item.get("filepath"):
            try:
                os.remove(item["filepath"])
            except OSError:
                pass
    history.delete(record_id)

# ── Save Recording to History ───────────────────────────────────────────────────────

class DeleteHistoryBatchRequest(BaseModel):
    record_ids: list[str] = Field(default_factory=list)


class SaveRecordingRequest(BaseModel):
    filepath: str
    filename: str
    content: str = ""


@app.post("/api/history/delete-batch")
async def delete_history_batch(req: DeleteHistoryBatchRequest):
    unique_ids = list(dict.fromkeys(record_id for record_id in req.record_ids if record_id))
    if not unique_ids:
        raise HTTPException(status_code=422, detail="record_ids nao pode ser vazio")

    deleted_ids: list[str] = []
    failed: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    for record_id in unique_ids:
        item = history.get(record_id)
        if item is None:
            failed.append({"id": record_id, "reason": "not_found"})
            continue

        filepath = item.get("filepath") or ""
        if filepath:
            try:
                os.remove(filepath)
            except OSError as exc:
                warnings.append(
                    {"id": record_id, "reason": f"file_delete_failed:{exc.__class__.__name__}"}
                )

        history.delete(record_id)
        deleted_ids.append(record_id)

    return {
        "requested": len(unique_ids),
        "deleted": len(deleted_ids),
        "deleted_ids": deleted_ids,
        "failed": failed,
        "warnings": warnings,
    }


@app.post("/api/history/recording", status_code=201)
async def save_recording_to_history(req: SaveRecordingRequest):
    """
    Save an audio recording to history.
    Used by the Audio Recorder workspace.
    """
    if not os.path.exists(req.filepath):
        raise HTTPException(status_code=404, detail="File not found")

    record_id = history.save(req.filepath)
    item = history.get(record_id)
    return {
        "id": record_id,
        "filename": req.filename,
        "filepath": req.filepath,
        "content": req.content,
        "created_at": item.get("created_at", "") if item else "",
        "size_bytes": os.path.getsize(req.filepath),
    }

# ── Editor Transcription (converged captions) ────────────────────────────────────────

class EditorTranscriptionSegment(BaseModel):
    text: str
    start: float
    end: float


class EditorTranscriptionResult(BaseModel):
    text: str
    segments: list[EditorTranscriptionSegment]
    language: str
    detected_language: str | None = None


@app.post("/api/editor/transcribe", status_code=201)
async def transcribe_editor_audio(
    audio_file: UploadFile,
    model: str = Form(default=DEFAULT_TRANSCRIBE_MODEL),
    language: str = Form(default="auto"),
    beam_size: int = Form(default=DEFAULT_BEAM_SIZE),
    batch_size: int = Form(default=DEFAULT_TRANSCRIBE_BATCH_SIZE),
    _: None = Depends(_require_api_key),
):
    """
    Transcribe audio from the OpenCut editor timeline.

    This endpoint accepts a WAV audio file extracted from the editor timeline
    and returns transcription segments in JSON format suitable for caption generation.
    This converges the editor captions with the official Python transcription pipeline.

    Request:
    - audio_file: WAV file (multipart/form-data)
    - model: Whisper model size (default: PIXEL_DEFAULT_WHISPER_MODEL or "medium")
    - language: Language code or "auto" (default: auto)
    - beam_size: Beam size for decoding (default: 5)
    - batch_size: Batch size for batched inference (default: PIXEL_DEFAULT_BATCH_SIZE or 8)

    Response:
    - text: Full transcription text
    - segments: Array of {text, start, end} objects
    - language: Requested language
    - detected_language: Auto-detected language (if language="auto")
    """
    if not FASTER_WHISPER_AVAILABLE():
        raise HTTPException(
            status_code=503,
            detail="faster-whisper not available - install with: pip install faster-whisper"
        )

    # Save uploaded audio temporarily
    temp_dir = UPLOAD_DIR / "editor_audio"
    temp_dir.mkdir(parents=True, exist_ok=True)

    temp_filename = f"editor_{uuid.uuid4().hex}.wav"
    temp_path = temp_dir / temp_filename

    try:
        # Read and save uploaded file
        content = await audio_file.read()
        temp_path.write_bytes(content)

        # Verify WAV format or convert
        audio_path = str(temp_path)
        if not temp_filename.lower().endswith(".wav"):
            converted = audio.convert_to_wav(audio_path, None)
            if converted is None:
                raise HTTPException(
                    status_code=422,
                    detail="Failed to convert audio to WAV format"
                )
            audio_path = converted
            Path(temp_path).unlink(missing_ok=True)
            temp_path = Path(audio_path)

        # Get audio duration for progress calculation
        duration = audio.get_wav_duration(audio_path)

        # Prepare language parameter
        lang_param = None if language == "auto" else language

        model_name, effective_batch_size = _resolve_transcribe_runtime(model, batch_size)

        # Load Whisper model
        _, batched = tr_module.get_whisper_model(model_name, None)
        if not batched:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load Whisper model: {model_name}"
            )

        # Transcribe (with chunking for long media)
        segments_list_raw, detected_language, temp_chunk_files = _transcribe_with_optional_chunking(
            batched=batched,
            audio_path=audio_path,
            duration=duration,
            language=lang_param,
            beam_size=beam_size,
            batch_size=effective_batch_size,
            is_cancelled=lambda: False,
            log_fn=None,
        )
        for temp_chunk in temp_chunk_files:
            try:
                Path(temp_chunk).unlink(missing_ok=True)
            except Exception:
                pass

        full_text_parts = []
        segments_list = []

        for seg in segments_list_raw:
            segment = EditorTranscriptionSegment(
                text=seg.text.strip(),
                start=float(seg.start),
                end=float(seg.end),
            )
            if segment.text:
                segments_list.append(segment)
                full_text_parts.append(segment.text)

        full_text = " ".join(full_text_parts)

        result = EditorTranscriptionResult(
            text=full_text,
            segments=segments_list,
            language=language,
            detected_language=detected_language if language == "auto" else None,
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Editor transcription failed")
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(e)}"
        )
    finally:
        # Cleanup temp file
        if temp_path.exists():
            try:
                temp_path.unlink()
            except Exception:
                pass

# ── Transcribe URL (combined download + transcribe) ─────────────────────────────────

class TranscribeUrlRequest(BaseModel):
    url: str
    audio_only: bool = True
    model: str = DEFAULT_TRANSCRIBE_MODEL
    language: str = "pt"
    beam_size: int = DEFAULT_BEAM_SIZE
    batch_size: int = DEFAULT_TRANSCRIBE_BATCH_SIZE
    diarize: bool = False
    num_speakers: int = 2
    auto_detect_speakers: bool = False
    speaker_names: dict[str, str] = Field(default_factory=dict)
    output_format: str = "txt"


class TranscribeRequest(BaseModel):
    files: list[str] = Field(default_factory=list)
    model: str = DEFAULT_TRANSCRIBE_MODEL
    language: str = "pt"
    beam_size: int = DEFAULT_BEAM_SIZE
    batch_size: int = DEFAULT_TRANSCRIBE_BATCH_SIZE
    diarize: bool = False
    num_speakers: int = 2
    auto_detect_speakers: bool = False
    speaker_names: dict[str, str] = Field(default_factory=dict)
    output_format: str = "txt"


class CreateProjectRequest(BaseModel):
    name: str
    topic: str = ""
    config: dict = Field(default_factory=dict)


class AddVideoRequest(BaseModel):
    source_url: str = ""
    local_path: str = ""
    title: str = ""


class ProcessProjectRequest(BaseModel):
    model: str = DEFAULT_TRANSCRIBE_MODEL
    language: str = "auto"
    beam_size: int = DEFAULT_BEAM_SIZE
    batch_size: int = DEFAULT_TRANSCRIBE_BATCH_SIZE
    diarize: bool = False


class GenerateScriptRequest(BaseModel):
    model: str
    provider: str
    config: dict = Field(default_factory=dict)
    max_tokens: int | None = None
    min_duration: int = 15
    max_duration: int = 90


class UpdateScriptRequest(BaseModel):
    script: dict = Field(default_factory=dict)


class UpdateConfigRequest(BaseModel):
    config: dict = Field(default_factory=dict)


class DownloadRequest(BaseModel):
    url: str
    audio_only: bool = True


class DownloadSourceRequest(BaseModel):
    source_url: str


class SyncEditorStateRequest(BaseModel):
    name: str | None = None
    editor_state: dict = Field(default_factory=dict)


class CreateChannelPresetRequest(BaseModel):
    name: str
    config: dict = Field(default_factory=dict)


class EditorAutoArrangeRequest(BaseModel):
    preset: str = "dynamic"


class ApplyChannelPresetRequest(BaseModel):
    preset_id: str


class GenerateViralMarkersRequest(BaseModel):
    style: str = "viral_shorts"


class GenerateNarrationPlanRequest(BaseModel):
    model: str
    provider: str
    config: dict = Field(default_factory=dict)
    max_tokens: int | None = None


class GenerateNarrationAudioRequest(BaseModel):
    voice_hint: str = ""
    rate: int = 180
    volume: float = 1.0


class GenerateYoutubePackageRequest(BaseModel):
    model: str
    provider: str
    config: dict = Field(default_factory=dict)
    max_tokens: int | None = None


class YouTubePublishRequest(BaseModel):
    title: str = ""
    description: str = ""
    tags: list[str] | None = None
    privacy_status: str = "private"
    category_id: str = "22"
    made_for_kids: bool = False
    notify_subscribers: bool = False


@app.post("/api/download")
async def start_download(req: DownloadRequest, _: None = Depends(_require_api_key)):
    """Downloads a URL (audio or video) and returns a job_id for progress tracking."""
    if not req.url.strip():
        raise HTTPException(status_code=422, detail="URL não pode ser vazia")
    if not dl_module.YT_DLP_AVAILABLE:
        raise HTTPException(status_code=503, detail="yt-dlp não instalado")

    job_id = _new_job()
    loop = asyncio.get_event_loop()

    threading.Thread(
        target=_run_download_standalone,
        args=(job_id, req, loop),
        daemon=True,
    ).start()

    return {"job_id": job_id}


def _run_download_standalone(job_id: str, req: DownloadRequest, loop: asyncio.AbstractEventLoop):
    """Downloads a URL without a project context (standalone download for legacy UI)."""
    def log(msg: str):
        _jobs[job_id]["logs"].append(msg)
        _job_send(job_id, loop, {"type": "log", "message": msg})

    def emit_progress(pct: int):
        _jobs[job_id]["progress"] = pct
        _job_send(job_id, loop, {"type": "progress", "value": pct})

    try:
        log(f"\n📥 Downloading from URL...")
        emit_progress(5)

        done_event = threading.Event()
        result_holder: dict = {"path": None, "error": None}

        def on_done(filepath: str):
            result_holder["path"] = filepath
            done_event.set()

        def on_error(msg: str):
            result_holder["error"] = msg
            done_event.set()

        def on_dl_progress(pct: int, speed: str):
            if speed:
                log(f"  {pct}%  ({speed})")
            emit_progress(pct)

        dl_module.download_url(
            url=req.url,
            audio_only=req.audio_only,
            on_progress=on_dl_progress,
            on_done=on_done,
            on_error=on_error,
        )
        done_event.wait(timeout=600)

        if result_holder["error"]:
            raise RuntimeError(result_holder["error"])

        filepath = result_holder["path"]
        if not filepath:
            raise RuntimeError("Download did not return a file.")

        log(f"✅ Downloaded: {os.path.basename(filepath)}")
        _job_finish(job_id, status="done", result={"filepath": filepath, "filename": os.path.basename(filepath)})
        _job_send(job_id, loop, {"type": "done", "filepath": filepath, "filename": os.path.basename(filepath)})

    except Exception as e:
        log(f"❌ Error: {e}")
        _job_finish(job_id, status="error", error=str(e))
        _job_send(job_id, loop, {"type": "error", "message": str(e)})


@app.post("/api/transcribe-url")
async def start_transcribe_url(req: TranscribeUrlRequest, _: None = Depends(_require_api_key)):
    if not req.url.strip():
        raise HTTPException(status_code=422, detail="URL não pode ser vazia")
    if not dl_module.YT_DLP_AVAILABLE:
        raise HTTPException(status_code=503, detail="yt-dlp não instalado")

    job_id = _new_job()
    loop = asyncio.get_event_loop()

    threading.Thread(
        target=_run_transcribe_url,
        args=(job_id, req, loop),
        daemon=True,
    ).start()

    return {"job_id": job_id}


@app.post("/api/transcribe")
async def start_transcribe(req: TranscribeRequest, _: None = Depends(_require_api_key)):
    normalized_files = [str(Path(file).expanduser()) for file in req.files if str(file).strip()]
    if not normalized_files:
        raise HTTPException(status_code=422, detail="Nenhum arquivo informado")

    missing_files = [file for file in normalized_files if not Path(file).exists()]
    if missing_files:
        raise HTTPException(
            status_code=404,
            detail=f"Arquivo não encontrado: {missing_files[0]}",
        )

    job_id = _new_job()
    loop = asyncio.get_event_loop()

    threading.Thread(
        target=_run_transcribe_files,
        args=(job_id, req.model_copy(update={"files": normalized_files}), loop),
        daemon=True,
    ).start()

    return {"job_id": job_id}


def _run_transcribe_files(job_id: str, req: TranscribeRequest, loop: asyncio.AbstractEventLoop):
    def log(msg: str):
        _jobs[job_id]["logs"].append(msg)
        _job_send(job_id, loop, {"type": "log", "message": msg})

    def progress(pct: int):
        _jobs[job_id]["progress"] = pct
        _job_send(job_id, loop, {"type": "progress", "value": pct})

    history_ids: list[str] = []
    generated_temp_files: list[str] = []
    saved_outputs: list[str] = []
    source_files_to_cleanup: list[str] = []
    t0 = time.time()

    try:
        log(f"[mem] RSS at start: {_rss_mb()}")
        total_files = max(len(req.files), 1)
        model_name, effective_batch_size = _resolve_transcribe_runtime(req.model, req.batch_size, log)
        language = None if req.language == "auto" else req.language

        log(f"Loading Whisper model '{model_name}' (batch={effective_batch_size}, chunk={TRANSCRIBE_CHUNK_SECONDS}s)...")
        _, batched = tr_module.get_whisper_model(model_name, log)
        if not batched:
            raise RuntimeError("Failed to load Whisper model.")
        log(f"[mem] RSS after model load: {_rss_mb()}")

        for file_index, original_path in enumerate(req.files):
            if _jobs[job_id].get("cancelled"):
                break

            source_path = Path(original_path)
            log(f"\n🎤 Processing {source_path.name} ({file_index + 1}/{total_files})")

            if not source_path.exists():
                raise RuntimeError(f"File not found: {source_path}")

            # Auto-clean original uploads after successful transcription.
            if _is_path_within_dir(source_path, UPLOAD_DIR):
                source_files_to_cleanup.append(str(source_path))

            if not str(source_path).lower().endswith(".wav"):
                log("🔄 Converting to WAV...")
                wav_path = audio.convert_to_wav(str(source_path), log)
                if wav_path is None:
                    raise RuntimeError(f"Failed to convert {source_path.name} to WAV.")
                generated_temp_files.append(wav_path)
                audio_path = wav_path
            else:
                audio_path = str(source_path)

            duration = audio.get_wav_duration(audio_path)
            file_progress_start = int((file_index / total_files) * 100)
            file_progress_span = max(1, int(100 / total_files))
            progress(max(1, file_progress_start + 5))

            segments_list, detected_language, chunk_temp_files = _transcribe_with_optional_chunking(
                batched=batched,
                audio_path=audio_path,
                duration=duration,
                language=language,
                beam_size=req.beam_size,
                batch_size=effective_batch_size,
                is_cancelled=lambda: bool(_jobs[job_id].get("cancelled")),
                progress_fn=progress,
                progress_start=file_progress_start + 5,
                progress_span=max(file_progress_span - 10, 1),
                log_fn=log,
            )
            generated_temp_files.extend(chunk_temp_files)

            log(f"✅ {len(segments_list)} segments | detected language: {detected_language or 'unknown'}")

            speaker_map = None
            if req.diarize:
                if diarization.RESEMBLYZER_AVAILABLE and diarization.SKLEARN_AVAILABLE:
                    log("🎭 Identifying speakers (Resemblyzer)...")
                    embeddings = diarization.extract_embeddings(audio_path, segments_list, log)
                    if embeddings:
                        speaker_map = diarization.cluster_speakers(
                            embeddings, req.num_speakers, req.auto_detect_speakers, log
                        )
                        del embeddings
                        n_spk = len(set(speaker_map.values())) if speaker_map else 0
                        log(f"✅ {n_spk} speaker(s) identified")
                    else:
                        log("⚠️ Diarization failed — saving without speaker identification")
                else:
                    log("⚠️ resemblyzer/scikit-learn not installed")
                gc.collect()

            base = os.path.splitext(audio_path)[0]
            suffix = "_with_speakers" if (req.diarize and speaker_map) else "_transcription"

            if req.output_format in ("txt", "ambos"):
                out = f"{base}{suffix}.txt"
                Path(out).write_text(
                    formatters.format_txt(segments_list, speaker_map, req.diarize, req.speaker_names),
                    encoding="utf-8",
                )
                log(f"💾 TXT: {os.path.basename(out)}")
                saved_outputs.append(out)
                history_ids.append(history.save(out))

            if req.output_format in ("srt", "ambos"):
                out = f"{base}{suffix}.srt"
                Path(out).write_text(
                    formatters.format_srt(segments_list, speaker_map, req.diarize, req.speaker_names),
                    encoding="utf-8",
                )
                log(f"💾 SRT: {os.path.basename(out)}")
                saved_outputs.append(out)

            progress(min(file_progress_start + file_progress_span, 100))

        progress(100)
        elapsed = time.time() - t0
        minutes, seconds = divmod(int(elapsed), 60)
        log(f"\n🎉 Transcription complete: {len(saved_outputs)} file(s) generated in {minutes}m{seconds:02d}s")
        log(f"[mem] RSS at end: {_rss_mb()}")

        result_data = {
            "job_id": job_id,
            "history_ids": history_ids,
            "files": saved_outputs,
        }
        _job_finish(job_id, status="done", result=result_data)
        _job_send(job_id, loop, {
            "type": "done",
            "history_ids": history_ids,
            "files": saved_outputs,
        })

    except Exception as e:
        log(f"❌ Error: {str(e)}")
        _job_finish(job_id, status="error", error=str(e))
        _job_send(job_id, loop, {"type": "error", "message": str(e)})
    finally:
        for temp_file in generated_temp_files:
            try:
                os.remove(temp_file)
            except OSError:
                pass

        if _jobs[job_id].get("status") == "done":
            for source_file in dict.fromkeys(source_files_to_cleanup):
                try:
                    os.remove(source_file)
                except OSError:
                    pass
        gc.collect()


def _run_transcribe_url(job_id: str, req: TranscribeUrlRequest, loop: asyncio.AbstractEventLoop):
    def log(msg: str):
        _jobs[job_id]["logs"].append(msg)
        _job_send(job_id, loop, {"type": "log", "message": msg})

    def progress(pct: int):
        _jobs[job_id]["progress"] = pct
        _job_send(job_id, loop, {"type": "progress", "value": pct})

    history_ids: list[str] = []
    temp_files: list[str] = []
    t0 = time.time()

    try:
        # Download
        log(f"\n📥 Downloading from URL...")
        progress(5)

        done_event = threading.Event()
        result_holder: dict = {"path": None, "error": None}

        def on_done(filepath: str):
            result_holder["path"] = filepath
            done_event.set()

        def on_error(msg: str):
            result_holder["error"] = msg
            done_event.set()

        def on_dl_progress(pct: int, speed: str):
            if speed:
                log(f"  {pct}%  ({speed})")
                overall_pct = int(pct * 0.2) + 5  # Download takes up to 25% of progress
                progress(overall_pct)

        dl_module.download_url(
            url=req.url,
            audio_only=req.audio_only,
            on_progress=on_dl_progress,
            on_done=on_done,
            on_error=on_error,
        )

        done_event.wait(timeout=600)

        if result_holder["error"]:
            log(f"❌ Download error: {result_holder['error']}")
            raise RuntimeError(result_holder["error"])

        filepath = result_holder["path"]
        if not filepath:
            raise RuntimeError("Download did not return a file.")

        log(f"✅ Downloaded: {os.path.basename(filepath)}")
        progress(25)

        # Transcribe
        temp_files.append(filepath)

        # Convert to WAV if needed
        if not filepath.lower().endswith(".wav"):
            log("🔄 Converting to WAV...")
            wav_path = audio.convert_to_wav(filepath, log)
            if wav_path is None:
                raise RuntimeError("Failed to convert to WAV.")
            temp_files.append(wav_path)
            audio_path = wav_path
        else:
            audio_path = filepath

        duration = audio.get_wav_duration(audio_path)
        language = None if req.language == "auto" else req.language
        model_name, effective_batch_size = _resolve_transcribe_runtime(req.model, req.batch_size, log)

        log(f"🎤 Loading model '{model_name}' (batch={effective_batch_size}, chunk={TRANSCRIBE_CHUNK_SECONDS}s)...")
        progress(30)

        _, batched = tr_module.get_whisper_model(model_name, log)
        if not batched:
            raise RuntimeError("Failed to load Whisper model.")
        log(f"[mem] RSS after model load: {_rss_mb()}")

        segments_list, detected_language, chunk_temp_files = _transcribe_with_optional_chunking(
            batched=batched,
            audio_path=audio_path,
            duration=duration,
            language=language,
            beam_size=req.beam_size,
            batch_size=effective_batch_size,
            is_cancelled=lambda: bool(_jobs[job_id].get("cancelled")),
            progress_fn=progress,
            progress_start=30,
            progress_span=65,
            log_fn=log,
        )
        temp_files.extend(chunk_temp_files)

        log(f"✅ {len(segments_list)} segments | detected language: {detected_language or 'unknown'}")
        progress(95)

        # Diarization
        speaker_map = None
        if req.diarize:
            if diarization.RESEMBLYZER_AVAILABLE and diarization.SKLEARN_AVAILABLE:
                log("🎭 Identifying speakers (Resemblyzer)...")
                embeddings = diarization.extract_embeddings(audio_path, segments_list, log)
                if embeddings:
                    speaker_map = diarization.cluster_speakers(
                        embeddings, req.num_speakers, req.auto_detect_speakers, log
                    )
                    del embeddings
                    n_spk = len(set(speaker_map.values())) if speaker_map else 0
                    log(f"✅ {n_spk} speaker(s) identified")
                else:
                    log("⚠️ Diarization failed — saving without speaker identification")
            else:
                log("⚠️ resemblyzer/scikit-learn not installed")
            gc.collect()

        # Save
        base = os.path.splitext(audio_path)[0]
        suffix = "_with_speakers" if (req.diarize and speaker_map) else "_transcription"
        saved: list[str] = []

        if req.output_format in ("txt", "ambos"):
            out = f"{base}{suffix}.txt"
            Path(out).write_text(
                formatters.format_txt(segments_list, speaker_map, req.diarize, req.speaker_names),
                encoding="utf-8",
            )
            log(f"💾 TXT: {os.path.basename(out)}")
            saved.append(out)
            record_id = history.save(out)
            history_ids.append(record_id)

        if req.output_format in ("srt", "ambos"):
            out = f"{base}{suffix}.srt"
            Path(out).write_text(
                formatters.format_srt(segments_list, speaker_map, req.diarize, req.speaker_names),
                encoding="utf-8",
            )
            log(f"💾 SRT: {os.path.basename(out)}")
            saved.append(out)

        progress(100)
        elapsed = time.time() - t0
        minutes, seconds = divmod(int(elapsed), 60)
        log(f"\n🎉 Transcription complete: {len(saved)} file(s) generated in {minutes}m{seconds:02d}s")
        log(f"[mem] RSS at end: {_rss_mb()}")

        result_data = {
            "job_id": job_id,
            "history_ids": history_ids,
            "files": saved,
        }
        _job_finish(job_id, status="done", result=result_data)
        _job_send(job_id, loop, {
            "type": "done",
            "history_ids": history_ids,
            "files": saved,
        })

    except Exception as e:
        log(f"❌ Error: {str(e)}")
        _job_finish(job_id, status="error", error=str(e))
        _job_send(job_id, loop, {"type": "error", "message": str(e)})
    finally:
        # Cleanup temp files
        for tf in temp_files:
            try:
                os.remove(tf)
            except OSError:
                pass
        gc.collect()
        try:
            import torch
            if tr_module.CUDA_AVAILABLE:
                torch.cuda.empty_cache()
        except ImportError:
            pass

# ── Projetos (Compilador) ─────────────────────────────────────────────────────

@app.post("/api/projects", status_code=201)
async def create_project(req: CreateProjectRequest, _: None = Depends(_require_api_key)):
    return proj_module.create_project(req.name, req.topic, req.config)


@app.get("/api/projects")
async def list_projects():
    projects = proj_module.list_projects()
    for p in projects:
        p["videos"] = proj_module.list_project_videos(p["id"])
    return projects


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    project["videos"] = proj_module.list_project_videos(project_id)
    return project


@app.delete("/api/projects/{project_id}", status_code=204)
async def delete_project(project_id: str, _: None = Depends(_require_api_key)):
    project = proj_module.get_project(project_id)
    if project:
        videos = proj_module.list_project_videos(project_id)
        for v in videos:
            for field in ("thumbnail_path",):
                p = v.get(field) or ""
                if p:
                    try:
                        os.remove(p)
                    except OSError:
                        pass
        output_path = project.get("output_path") or ""
        if output_path:
            try:
                os.remove(output_path)
            except OSError:
                pass
    proj_module.delete_project(project_id)


@app.post("/api/projects/{project_id}/videos", status_code=201)
async def add_video_to_project(project_id: str, req: AddVideoRequest, _: None = Depends(_require_api_key)):
    if proj_module.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    if not req.source_url.strip() and not req.local_path.strip():
        raise HTTPException(status_code=422, detail="Informe source_url ou local_path")
    return proj_module.add_video(project_id, req.source_url, req.local_path, req.title)


@app.delete("/api/projects/{project_id}/videos/{video_id}", status_code=204)
async def remove_video_from_project(project_id: str, video_id: str, _: None = Depends(_require_api_key)):
    proj_module.remove_video(video_id)


@app.get("/api/projects/{project_id}/videos/{video_id}/thumbnail")
async def project_video_thumbnail(project_id: str, video_id: str):
    video = proj_module.get_video(video_id)
    if not video or video.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Video nao encontrado")
    thumb = video.get("thumbnail_path") or ""
    if not thumb or not Path(thumb).exists():
        raise HTTPException(status_code=404, detail="Thumbnail nao disponivel")
    return FileResponse(thumb, media_type="image/jpeg")


@app.get("/api/projects/{project_id}/videos/{video_id}/media")
@app.head("/api/projects/{project_id}/videos/{video_id}/media")
async def project_video_media(project_id: str, video_id: str):
    video = proj_module.get_video(video_id)
    if not video or video.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Video nao encontrado")
    local_path = video.get("local_path") or ""
    if not local_path or not Path(local_path).exists():
        raise HTTPException(status_code=404, detail="Arquivo de video nao disponivel")
    media_type = mimetypes.guess_type(local_path)[0] or "video/mp4"
    return FileResponse(local_path, media_type=media_type, filename=Path(local_path).name)


@app.post("/api/projects/{project_id}/download-source")
async def download_project_source(project_id: str, req: DownloadSourceRequest, _: None = Depends(_require_api_key)):
    """Downloads a URL source for a manual project without transcribing."""
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    if not req.source_url.strip():
        raise HTTPException(status_code=422, detail="source_url is required")
    if not dl_module.YT_DLP_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="yt-dlp is not installed. Install it to download media from URL sources.",
        )
    videos = proj_module.list_project_videos(project_id)
    if not videos:
        raise HTTPException(status_code=422, detail="Add a video source to the project first")
    # Use the first pending video that has this URL
    video = next(
        (v for v in videos if (v.get("source_url") or "").strip() == req.source_url.strip()),
        None,
    )
    if video is None:
        raise HTTPException(
            status_code=422,
            detail="No matching URL source was found in the project. Add the source first and try again.",
        )
    job_id = _new_job()
    loop = asyncio.get_event_loop()
    threading.Thread(
        target=_run_download_source,
        args=(job_id, project_id, video["id"], req.source_url, loop),
        daemon=True,
    ).start()
    return {"job_id": job_id}


@app.post("/api/projects/{project_id}/process")
async def process_project(project_id: str, req: ProcessProjectRequest, _: None = Depends(_require_api_key)):
    if proj_module.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    if not proj_module.list_project_videos(project_id):
        raise HTTPException(status_code=422, detail="Nenhum video no projeto")
    job_id = _new_job()
    loop = asyncio.get_event_loop()
    threading.Thread(
        target=_run_project_process,
        args=(job_id, project_id, req, loop),
        daemon=True,
    ).start()
    return {"job_id": job_id}


@app.post("/api/projects/{project_id}/generate-script")
async def generate_script(project_id: str, req: GenerateScriptRequest):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    videos = proj_module.list_project_videos(project_id)
    transcribed = [v for v in videos if v.get("transcription")]
    if not transcribed:
        raise HTTPException(status_code=422, detail="Nenhum video com transcricao disponivel")
    transcription_text = _build_unified_transcription(transcribed)
    system_prompt = _build_compilador_prompt(
        project.get("topic") or "conteudo geral",
        req.min_duration,
        req.max_duration,
    )
    try:
        result = await ai_providers.generate(
            text=transcription_text,
            system_prompt=system_prompt,
            model=req.model,
            provider=req.provider,
            config=req.config,
            max_tokens=req.max_tokens,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    script = _parse_script_json(result)
    if script is None:
        preview = result[:400] if result else "(resposta vazia)"
        raise HTTPException(
            status_code=422,
            detail=f"IA nao retornou JSON valido. Tente novamente ou use outro modelo. Resposta recebida: {preview}",
        )
    for seg in script.get("segments", []):
        seg.setdefault("selected", True)
        seg.setdefault("id", str(uuid.uuid4()))

    # Validacao: detecta timestamps suspeitos (possivel confusao de unidade pela IA)
    warnings = _validate_script_timestamps(script, transcribed)
    if warnings:
        script["_warnings"] = warnings

    proj_module.update_project(project_id, status="scripted", script=script)
    return {"script": script, "warnings": warnings}


@app.post("/api/projects/{project_id}/update-script")
async def update_script(project_id: str, req: UpdateScriptRequest, _: None = Depends(_require_api_key)):
    if proj_module.get_project(project_id) is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    updated = proj_module.update_project(project_id, script=req.script)
    return {"script": updated["script"]}


@app.post("/api/projects/{project_id}/update-config")
async def update_config(project_id: str, req: UpdateConfigRequest, _: None = Depends(_require_api_key)):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    merged = {**(project.get("config") or {}), **req.config}
    updated = proj_module.update_project(project_id, config=merged)
    return {"config": updated["config"]}


@app.post("/api/projects/{project_id}/sync-editor-state")
async def sync_editor_state(project_id: str, req: SyncEditorStateRequest):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")

    merged_config = {**(project.get("config") or {})}
    if req.editor_state:
        merged_config["editor_state"] = {
            **(merged_config.get("editor_state") or {}),
            **req.editor_state,
        }

    updates = {"config": merged_config}
    if req.name is not None and req.name.strip():
        updates["name"] = req.name.strip()

    updated = proj_module.update_project(project_id, **updates)
    updated["videos"] = proj_module.list_project_videos(project_id)
    return updated


@app.get("/api/editor-presets")
async def list_editor_presets():
    return EDITOR_PRESETS


@app.get("/api/channel-presets")
async def list_channel_presets():
    return proj_module.list_channel_presets()


@app.post("/api/channel-presets", status_code=201)
async def create_channel_preset(req: CreateChannelPresetRequest, _: None = Depends(_require_api_key)):
    if not req.name.strip():
        raise HTTPException(status_code=422, detail="Nome do preset nao pode ser vazio")
    return proj_module.create_channel_preset(
        req.name.strip(),
        req.config or {},
    )


@app.delete("/api/channel-presets/{preset_id}", status_code=204)
async def delete_channel_preset(preset_id: str, _: None = Depends(_require_api_key)):
    proj_module.delete_channel_preset(preset_id)


@app.post("/api/projects/{project_id}/auto-arrange")
async def auto_arrange_project(
    project_id: str,
    req: EditorAutoArrangeRequest,
    _: None = Depends(_require_api_key),
):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    if not project.get("script") or not (project["script"].get("segments") or []):
        raise HTTPException(status_code=422, detail="Gere o roteiro antes de auto-editar a timeline")
    script, config = _apply_editor_preset(project, req.preset)
    updated = proj_module.update_project(project_id, script=script, config=config)
    return {
        "script": updated["script"],
        "config": updated["config"],
        "preset": req.preset,
    }


@app.post("/api/projects/{project_id}/apply-channel-preset")
async def apply_channel_preset(
    project_id: str,
    req: ApplyChannelPresetRequest,
    _: None = Depends(_require_api_key),
):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    preset = proj_module.get_channel_preset(req.preset_id)
    if preset is None:
        raise HTTPException(status_code=404, detail="Preset de canal nao encontrado")

    config = {
        **(project.get("config") or {}),
        **(preset.get("config") or {}),
        "channel_preset_id": preset["id"],
    }
    updated = proj_module.update_project(project_id, config=config)
    return {
        "project": updated,
        "preset": preset,
    }


@app.post("/api/projects/{project_id}/generate-viral-markers")
async def generate_viral_markers(
    project_id: str,
    req: GenerateViralMarkersRequest,
    _: None = Depends(_require_api_key),
):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    if not project.get("script") or not (project["script"].get("segments") or []):
        raise HTTPException(status_code=422, detail="Gere o roteiro antes de montar hooks e CTAs")

    script = project.get("script") or {}
    script["viral_markers"] = _generate_viral_markers(project, req.style)
    updated = proj_module.update_project(project_id, script=script)
    return {
        "script": updated["script"],
        "viral_markers": updated["script"].get("viral_markers") or [],
    }


@app.post("/api/projects/{project_id}/generate-narration-plan")
async def generate_narration_plan(project_id: str, req: GenerateNarrationPlanRequest):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    videos = proj_module.list_project_videos(project_id)
    if not project.get("script") or not (project["script"].get("segments") or []):
        raise HTTPException(status_code=422, detail="Gere o roteiro antes de montar a narracao")

    try:
        result = await ai_providers.generate(
            text=_build_unified_transcription([v for v in videos if v.get("transcription")]),
            system_prompt=_build_narration_plan_prompt(project, videos),
            model=req.model,
            provider=req.provider,
            config=req.config,
            max_tokens=req.max_tokens,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    payload = _parse_script_json(result)
    if payload is None or not isinstance(payload.get("narration"), list):
        preview = result[:400] if result else "(resposta vazia)"
        raise HTTPException(
            status_code=422,
            detail=f"IA nao retornou JSON valido para narracao. Resposta recebida: {preview}",
        )

    script = project.get("script") or {}
    script["narration_plan"] = payload["narration"]
    updated = proj_module.update_project(project_id, script=script)
    return {"script": updated["script"], "narration": payload["narration"]}


@app.post("/api/projects/{project_id}/generate-narration-audio")
async def generate_narration_audio(
    project_id: str,
    req: GenerateNarrationAudioRequest,
    _: None = Depends(_require_api_key),
):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    if not tts_module.tts_available():
        raise HTTPException(status_code=503, detail="TTS local indisponivel. Instale pyttsx3 e uma voz do sistema.")

    script = project.get("script") or {}
    narration_items = script.get("narration_plan") or []
    if not narration_items:
        raise HTTPException(status_code=422, detail="Gere o plano de narracao antes de sintetizar audio")

    offsets = _final_segment_offsets(project)
    tts_dir = COMPILADOS_DIR / f"tts_{project_id}"
    tts_dir.mkdir(parents=True, exist_ok=True)

    generated = []
    for idx, item in enumerate(narration_items, 1):
        if item.get("enabled") is False:
            continue
        target_id = str(item.get("insert_after_segment_id") or "")
        base_offset = offsets.get(target_id, {})
        start_time = float(base_offset.get("end", 0.0)) + 0.15
        output_path = tts_dir / f"narration_{idx:03d}.wav"
        audio_path = tts_module.synthesize_to_file(
            text=str(item.get("text") or ""),
            output_path=str(output_path),
            voice_hint=req.voice_hint,
            rate=req.rate,
            volume=req.volume,
            log_fn=logger.info,
        )
        generated_item = {
            **item,
            "enabled": item.get("enabled", True),
            "audio_path": audio_path or "",
            "start": round(start_time, 2),
            "voice_hint": req.voice_hint,
            "rate": req.rate,
            "volume": req.volume,
        }
        generated.append(generated_item)

    script["narration_audio"] = generated
    updated = proj_module.update_project(project_id, script=script)
    return {
        "script": updated["script"],
        "narration_audio": generated,
    }


@app.post("/api/projects/{project_id}/generate-youtube-package")
async def generate_youtube_package(project_id: str, req: GenerateYoutubePackageRequest):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    if not project.get("script") or not (project["script"].get("segments") or []):
        raise HTTPException(status_code=422, detail="Gere o roteiro antes de montar o pacote do YouTube")

    try:
        result = await ai_providers.generate(
            text=_build_youtube_source_text(project),
            system_prompt=_build_youtube_metadata_prompt(project),
            model=req.model,
            provider=req.provider,
            config=req.config,
            max_tokens=req.max_tokens,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    payload = _parse_script_json(result)
    if payload is None:
        preview = result[:400] if result else "(resposta vazia)"
        raise HTTPException(
            status_code=422,
            detail=f"IA nao retornou JSON valido para pacote do YouTube. Resposta recebida: {preview}",
        )

    script = project.get("script") or {}
    if payload.get("title"):
        script["title"] = str(payload["title"]).strip()
    if payload.get("description"):
        script["description"] = str(payload["description"]).strip()

    project_config = project.get("config") or {}
    youtube_config = {
        **(project_config.get("youtube") or {}),
        "tags": _normalize_tag_list(payload.get("tags")),
        "hashtags": _normalize_tag_list(payload.get("hashtags")),
        "pinned_comment": str(payload.get("pinned_comment") or "").strip(),
        "intro_hook": str(payload.get("intro_hook") or "").strip(),
    }
    project_config["youtube"] = youtube_config

    updated = proj_module.update_project(project_id, script=script, config=project_config)
    return {
        "script": updated["script"],
        "youtube": updated["config"].get("youtube") or {},
    }


@app.post("/api/projects/{project_id}/compile")
async def compile_project(project_id: str, _: None = Depends(_require_api_key)):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    if not project.get("script") or not project["script"].get("segments"):
        raise HTTPException(status_code=422, detail="Gere o roteiro com IA antes de compilar")
    job_id = _new_job()
    loop = asyncio.get_event_loop()
    threading.Thread(
        target=_run_project_compile,
        args=(job_id, project_id, loop),
        daemon=True,
    ).start()
    return {"job_id": job_id}


@app.post("/api/projects/{project_id}/youtube/publish")
async def publish_project_youtube(
    project_id: str,
    req: YouTubePublishRequest,
    _: None = Depends(_require_api_key),
):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    output_path = project.get("output_path")
    if not output_path or not os.path.exists(output_path):
        raise HTTPException(status_code=422, detail="Renderize o projeto antes de enviar para o YouTube")

    job_id = _new_job()
    loop = asyncio.get_event_loop()
    threading.Thread(
        target=_run_project_publish_youtube,
        args=(job_id, project_id, req, loop),
        daemon=True,
    ).start()
    return {"job_id": job_id}


@app.get("/api/projects/{project_id}/export-srt")
async def export_project_srt(project_id: str):
    """Gera o arquivo SRT do video final com timestamps recalculados."""
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    script = project.get("script")
    if not script or not script.get("segments"):
        raise HTTPException(status_code=422, detail="Roteiro nao disponivel")

    videos = {v["id"]: v for v in proj_module.list_project_videos(project_id)}
    segments = [s for s in script["segments"] if s.get("selected", True)]
    transition_duration = float((project.get("config") or {}).get("transition_duration", 0.5))

    srt_lines: list[str] = []
    entry_idx = 1
    final_time = 0.0

    for i, seg in enumerate(segments):
        video = videos.get(seg.get("video_id", ""))
        if not video:
            continue
        clip_start = seg.get("start", 0.0)
        clip_end = seg.get("end", 0.0)
        clip_duration = clip_end - clip_start
        if clip_duration <= 0:
            continue

        transcription = video.get("transcription") or []
        for t in transcription:
            t_start = t.get("start", 0.0)
            t_end = t.get("end", 0.0)
            text = (t.get("text") or "").strip()
            if not text:
                continue
            # Incluir apenas sub-segmentos que caem dentro do clip selecionado
            if t_end <= clip_start or t_start >= clip_end:
                continue
            # Clampar ao intervalo do clip
            t_start_c = max(t_start, clip_start)
            t_end_c = min(t_end, clip_end)
            # Converter para tempo do video final
            srt_start = final_time + (t_start_c - clip_start)
            srt_end = final_time + (t_end_c - clip_start)
            srt_lines.append(str(entry_idx))
            srt_lines.append(f"{_srt_ts(srt_start)} --> {_srt_ts(srt_end)}")
            srt_lines.append(text)
            srt_lines.append("")
            entry_idx += 1

        # Avançar tempo acumulado (subtrair sobreposição da transição)
        has_next = i < len(segments) - 1
        next_has_transition = has_next and segments[i + 1].get("transition_in") not in (None, "none")
        if next_has_transition:
            td = min(transition_duration, clip_duration * 0.9)
            final_time += clip_duration - td
        else:
            final_time += clip_duration

    if not srt_lines:
        raise HTTPException(status_code=422, detail="Nenhuma transcricao disponivel nos segmentos selecionados")

    safe_name = "".join(
        c for c in (project.get("name") or "compilado") if c.isalnum() or c in " -_"
    ).strip()[:40] or "compilado"

    from fastapi.responses import Response
    return Response(
        content="\n".join(srt_lines),
        media_type="text/srt; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.srt"'},
    )


def _srt_ts(seconds: float) -> str:
    """Converte segundos para formato SRT: HH:MM:SS,mmm"""
    ms = int(round(seconds * 1000))
    h = ms // 3_600_000
    ms %= 3_600_000
    m = ms // 60_000
    ms %= 60_000
    s = ms // 1000
    ms %= 1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _normalize_tag_list(raw_tags) -> list[str]:
    if not raw_tags:
        return []
    if isinstance(raw_tags, str):
        items = raw_tags.split(",")
    else:
        items = raw_tags
    clean = []
    seen = set()
    for item in items:
        tag = str(item or "").strip().lstrip("#")
        if not tag:
            continue
        lowered = tag.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        clean.append(tag[:60])
    return clean[:15]


def _build_youtube_metadata_prompt(project: dict) -> str:
    script = project.get("script") or {}
    segments = [s for s in script.get("segments", []) if s.get("selected", True)]
    clip_summaries = []
    for idx, seg in enumerate(segments[:12], 1):
        label = (seg.get("label") or "").strip()
        reason = (seg.get("reason") or "").strip()
        duration = max(0.0, float(seg.get("end", 0.0)) - float(seg.get("start", 0.0)))
        summary = f"{idx}. {label or 'Clip sem titulo'} ({duration:.1f}s)"
        if reason:
            summary += f" - {reason}"
        clip_summaries.append(summary)

    current_title = (script.get("title") or "").strip()
    current_description = (script.get("description") or "").strip()
    return (
        "Responda em JSON valido, sem markdown e sem comentarios. "
        "Voce e um estrategista de crescimento para YouTube no Brasil. "
        "Crie um pacote forte de publicacao com foco em CTR, retencao e clareza. "
        "Nao invente fatos fora do material. "
        'Retorne exatamente as chaves: "title", "description", "tags", "hashtags", "pinned_comment", "intro_hook". '
        '"tags" e "hashtags" devem ser arrays de strings.\n\n'
        f"Tema do canal/projeto: {project.get('topic') or project.get('name') or 'video geral'}\n"
        f"Titulo atual: {current_title or '(vazio)'}\n"
        f"Descricao atual: {current_description or '(vazia)'}\n"
        f"Clips selecionados:\n" + "\n".join(clip_summaries or ["Nenhum clip detalhado."])
    )


def _build_youtube_source_text(project: dict) -> str:
    script = project.get("script") or {}
    segments = [s for s in script.get("segments", []) if s.get("selected", True)]
    parts = [
        f"Projeto: {project.get('name') or 'Sem nome'}",
        f"Tema: {project.get('topic') or 'Nao informado'}",
    ]
    if script.get("title"):
        parts.append(f"Titulo atual: {script['title']}")
    if script.get("description"):
        parts.append(f"Descricao atual: {script['description']}")
    for idx, seg in enumerate(segments[:15], 1):
        label = (seg.get("label") or "").strip()
        reason = (seg.get("reason") or "").strip()
        overlay = (seg.get("text_overlay") or "").strip()
        parts.append(
            f"Clip {idx}: {label or 'sem titulo'} | {seg.get('start', 0)}-{seg.get('end', 0)}s | "
            f"motivo={reason or 'n/a'} | overlay={overlay or 'n/a'}"
        )
    return "\n".join(parts)


def _build_backlog_prompt(project: dict, document: dict) -> str:
    return (
        "Responda em JSON valido, sem markdown. "
        'Retorne exatamente a chave "items", que deve ser um array de objetos com: '
        '"title", "description", "priority", "status". '
        'Use apenas status em {"todo","doing","done"} e priority em {"high","medium","low"}. '
        "Extraia entregaveis acionaveis do documento, sem inventar features fora do texto.\n\n"
        f"Projeto documental: {project.get('name')}\n"
        f"Documento: {document.get('title')}\n\n"
        f"{document.get('content')}"
    )


def _extract_briefing_snippet(markdown_text: str, max_chars: int = 1200) -> str:
    cleaned = " ".join((markdown_text or "").replace("\r", "\n").split())
    return cleaned[:max_chars].strip()


def _apply_editor_preset(project: dict, preset_key: str) -> tuple[dict, dict]:
    preset = EDITOR_PRESETS.get(preset_key, EDITOR_PRESETS["dynamic"])
    script = project.get("script") or {}
    segments = script.get("segments") or []
    selected = [seg for seg in segments if seg.get("selected", True)]

    cursor = 0.0
    overlap = float(preset.get("overlap_seconds", 0.0))
    tracks = preset.get("tracks") or [1]

    for idx, seg in enumerate(selected):
        track = tracks[idx % len(tracks)]
        duration = max(0.2, float(seg.get("end", 0.0)) - float(seg.get("start", 0.0)))
        timeline_start = max(0.0, cursor - (overlap if idx > 0 and track != 1 else 0.0))
        seg["track"] = track
        seg["timeline_start"] = round(timeline_start, 2)
        if idx > 0:
            transition = preset.get("transition")
            seg["transition_in"] = None if transition in (None, "none") else transition
        if seg.get("text_overlay"):
            seg["text_overlay_style"] = preset.get("overlay_style", seg.get("text_overlay_style") or "classic")
        cursor = max(cursor, timeline_start + duration)

    config = project.get("config") or {}
    config.update({
        "quality": preset.get("quality", config.get("quality", "medium")),
        "output_format": preset.get("output_format", config.get("output_format", "landscape")),
        "frame_fit_mode": preset.get("frame_fit_mode", config.get("frame_fit_mode", "contain")),
        "editor_preset": preset_key,
    })
    script["segments"] = segments
    return script, config


def _capture_channel_preset_from_project(project: dict) -> dict:
    config = project.get("config") or {}
    return {
        "quality": config.get("quality", "medium"),
        "output_format": config.get("output_format", "landscape"),
        "frame_fit_mode": config.get("frame_fit_mode", "contain"),
        "intro_video_path": config.get("intro_video_path", ""),
        "outro_video_path": config.get("outro_video_path", ""),
        "background_music_path": config.get("background_music_path", ""),
        "background_music_volume": config.get("background_music_volume", 0.18),
        "narration_enabled": config.get("narration_enabled", True),
        "narration_voice_hint": config.get("narration_voice_hint", "pt"),
        "narration_rate": config.get("narration_rate", 185),
        "narration_volume": config.get("narration_volume", 1.0),
        "narration_ducking": config.get("narration_ducking", 0.5),
        "editor_preset": config.get("editor_preset", "dynamic"),
        "transition_duration": config.get("transition_duration", 0.5),
    }


def _generate_viral_markers(project: dict, style: str = "viral_shorts") -> list[dict]:
    script = project.get("script") or {}
    segments = [seg for seg in (script.get("segments") or []) if seg.get("selected", True)]
    if not segments:
        return []

    total_duration = sum(max(0.0, float(seg.get("end", 0.0)) - float(seg.get("start", 0.0))) for seg in segments)
    first = segments[0]
    midpoint = segments[min(len(segments) // 2, len(segments) - 1)]
    last = segments[-1]

    markers = [
        {
            "id": str(uuid.uuid4()),
            "type": "hook",
            "label": "Hook inicial",
            "style": style,
            "target_segment_id": first.get("id"),
            "time_hint": 0.6,
            "instruction": "Abra com promessa forte, curiosidade ou tensão nos 2 primeiros segundos.",
        }
    ]
    if len(segments) > 2 or total_duration >= 25:
        markers.append(
            {
                "id": str(uuid.uuid4()),
                "type": "pattern_interrupt",
                "label": "Quebra de padrão",
                "style": style,
                "target_segment_id": midpoint.get("id"),
                "time_hint": round(total_duration * 0.45, 2),
                "instruction": "Troque ritmo, ângulo, overlay ou narração para renovar a retenção.",
            }
        )
    markers.append(
        {
            "id": str(uuid.uuid4()),
            "type": "cta",
            "label": "CTA final",
            "style": style,
            "target_segment_id": last.get("id"),
            "time_hint": max(0.0, round(total_duration - min(4.0, total_duration * 0.12), 2)),
            "instruction": "Feche com CTA curto e contextualizado sem quebrar o ritmo do vídeo.",
        }
    )
    return markers


def _build_narration_plan_prompt(project: dict, videos: list[dict]) -> str:
    script = project.get("script") or {}
    segments = [seg for seg in script.get("segments", []) if seg.get("selected", True)]
    clip_lines = []
    for idx, seg in enumerate(segments[:15], 1):
        clip_lines.append(
            f"{idx}. id={seg.get('id')} label={seg.get('label') or 'clip'} "
            f"start={seg.get('start', 0)} end={seg.get('end', 0)} reason={seg.get('reason') or 'n/a'}"
        )
    speaker_lines = []
    for video in videos:
        for chunk in (video.get("transcription") or []):
            speaker = chunk.get("speaker")
            if speaker:
                speaker_lines.append(f"{speaker}: {(chunk.get('text') or '').strip()[:120]}")
    return (
        "Responda em JSON valido, sem markdown. "
        'Retorne exatamente a chave "narration", que deve ser um array de objetos com: '
        '"text", "insert_after_segment_id", "voice_style", "reason". '
        "Crie pontos de narração curtos, energéticos e profissionais para manter retenção. "
        "Nao repita o que a fala original ja cobre de forma obvia.\n\n"
        f"Projeto: {project.get('name')}\n"
        f"Tema: {project.get('topic') or 'geral'}\n"
        f"Clips:\n" + "\n".join(clip_lines or ["Sem clips"]) + "\n\n"
        f"Amostra de falas e speakers:\n" + "\n".join(speaker_lines[:20] or ["Sem speakers diarizados"])
    )


def _selected_segments(script: dict) -> list[dict]:
    return [seg for seg in (script.get("segments") or []) if seg.get("selected", True)]


def _final_segment_offsets(project: dict) -> dict[str, dict]:
    script = project.get("script") or {}
    segments = _selected_segments(script)
    config = project.get("config") or {}
    transition_duration = float(config.get("transition_duration", 0.5) or 0.5)
    offsets: dict[str, dict] = {}
    cursor = 0.0

    intro_path = str(config.get("intro_video_path") or "").strip()
    if intro_path and Path(intro_path).exists():
        intro_duration = comp_module.get_duration(intro_path) or 0.0
        cursor += max(0.0, intro_duration)

    for idx, seg in enumerate(segments):
        seg_id = str(seg.get("id") or "")
        duration = max(0.0, float(seg.get("end", 0.0)) - float(seg.get("start", 0.0)))
        offsets[seg_id] = {
            "start": cursor,
            "end": cursor + duration,
            "duration": duration,
        }
        has_next = idx < len(segments) - 1
        next_transition = has_next and segments[idx + 1].get("transition_in") not in (None, "none")
        if next_transition:
            td = min(transition_duration, duration * 0.9)
            cursor += max(0.0, duration - td)
        else:
            cursor += duration
    return offsets


def _project_segments_with_ids(project_id: str) -> tuple[dict, list[dict], dict[str, dict]]:
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")

    script = project.get("script") or {}
    segments = script.get("segments") or []
    changed = False
    for seg in segments:
        if not seg.get("id"):
            seg["id"] = str(uuid.uuid4())
            changed = True
    if changed:
        proj_module.update_project(project_id, script=script)
        project = proj_module.get_project(project_id) or project
        segments = (project.get("script") or {}).get("segments") or segments

    by_id = {str(seg["id"]): seg for seg in segments if seg.get("id")}
    return project, segments, by_id


def _resolve_project_segment(project_id: str, segment_id: str) -> tuple[dict, dict, dict]:
    project, _segments, by_id = _project_segments_with_ids(project_id)
    segment = by_id.get(segment_id)
    if segment is None:
        raise HTTPException(status_code=404, detail="Clip nao encontrado")

    video = proj_module.get_video(segment.get("video_id", ""))
    if not video or video.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Video do clip nao encontrado")
    if not video.get("local_path") or not Path(video["local_path"]).exists():
        raise HTTPException(status_code=404, detail="Arquivo de video nao disponivel")
    return project, segment, video


def _build_clip_file(
    project: dict,
    segment: dict,
    video: dict,
    output_path: str,
) -> str | None:
    base_clip = comp_module.cut_clip(
        input_path=video["local_path"],
        start=float(segment.get("start", 0.0)),
        end=float(segment.get("end", 0.0)),
        output_path=output_path,
        log_fn=logger.info,
    )
    if not base_clip:
        return None

    proj_config = project.get("config") or {}
    quality_key = proj_config.get("quality", "medium")
    output_format = proj_config.get("output_format", "landscape")
    frame_fit_mode = proj_config.get("frame_fit_mode", "contain")
    quality = comp_module.QUALITY_PRESETS.get(quality_key, comp_module.QUALITY_PRESETS["medium"])
    norm_w, norm_h = comp_module.get_output_dimensions(quality_key, output_format)

    normalized_path = str(Path(output_path).with_name(Path(output_path).stem + "_norm.mp4"))
    normalized = comp_module.normalize_clip(
        input_path=base_clip,
        output_path=normalized_path,
        width=norm_w,
        height=norm_h,
        crf=quality["crf"],
        fit_mode=frame_fit_mode,
        log_fn=logger.info,
    )
    clip = normalized or base_clip
    if normalized and clip != base_clip:
        try:
            os.remove(base_clip)
        except OSError:
            pass

    overlay_text = segment.get("text_overlay")
    if overlay_text:
        overlay_path = str(Path(output_path).with_name(Path(output_path).stem + "_ov.mp4"))
        overlayed = comp_module.add_text_overlay(
            input_path=clip,
            output_path=overlay_path,
            text=overlay_text,
            position=segment.get("text_overlay_position") or "bottom",
            duration=segment.get("text_overlay_duration"),
            style=segment.get("text_overlay_style") or "classic",
            log_fn=logger.info,
        )
        if overlayed:
            try:
                os.remove(clip)
            except OSError:
                pass
            return overlayed
    return clip


@app.get("/api/projects/{project_id}/download")
async def download_compiled(project_id: str):
    project = proj_module.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projeto nao encontrado")
    output_path = project.get("output_path")
    if not output_path or not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Video compilado nao encontrado")
    return FileResponse(
        output_path,
        media_type="video/mp4",
        headers={"Content-Disposition": f"attachment; filename={os.path.basename(output_path)}"},
    )


@app.get("/api/projects/{project_id}/clips/{segment_id}/download")
async def download_project_clip(project_id: str, segment_id: str):
    project, segment, video = _resolve_project_segment(project_id, segment_id)
    clip_dir = COMPILADOS_DIR / f"project_{project_id}_clips"
    clip_dir.mkdir(parents=True, exist_ok=True)

    safe_name = "".join(
        c for c in (segment.get("label") or project.get("name") or "clip") if c.isalnum() or c in " -_"
    ).strip()[:40] or "clip"
    output_path = str(clip_dir / f"{safe_name}_{segment_id[:8]}.mp4")
    existing = Path(output_path)
    if not existing.exists():
        clip_path = _build_clip_file(project, segment, video, output_path)
        if not clip_path:
            raise HTTPException(status_code=500, detail="Falha ao exportar clip")
        output_path = clip_path

    return FileResponse(
        output_path,
        media_type="video/mp4",
        headers={"Content-Disposition": f"attachment; filename={Path(output_path).name}"},
    )


@app.get("/api/projects/{project_id}/clips/export")
async def export_selected_clips(project_id: str):
    project, segments, _by_id = _project_segments_with_ids(project_id)
    selected = [seg for seg in segments if seg.get("selected", True)]
    if not selected:
        raise HTTPException(status_code=422, detail="Nenhum clip selecionado para exportacao")

    clip_dir = COMPILADOS_DIR / f"project_{project_id}_clips"
    clip_dir.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    exported = 0

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for seg in selected:
            video = proj_module.get_video(seg.get("video_id", ""))
            if not video or video.get("project_id") != project_id:
                continue
            local_path = video.get("local_path") or ""
            if not local_path or not Path(local_path).exists():
                continue
            safe_name = "".join(
                c for c in (seg.get("label") or project.get("name") or "clip") if c.isalnum() or c in " -_"
            ).strip()[:40] or "clip"
            out_path = str(clip_dir / f"{safe_name}_{str(seg['id'])[:8]}.mp4")
            if not Path(out_path).exists():
                clip_path = _build_clip_file(project, seg, video, out_path)
                if not clip_path:
                    continue
                out_path = clip_path
            zf.write(out_path, Path(out_path).name)
            exported += 1

    if exported == 0:
        raise HTTPException(status_code=500, detail="Nenhum clip foi exportado com sucesso")

    buf.seek(0)
    safe_project = "".join(
        c for c in (project.get("name") or "clips") if c.isalnum() or c in " -_"
    ).strip()[:40] or "clips"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_project}_clips.zip"'},
    )


@app.get("/api/transitions")
async def list_transitions():
    """Retorna as transicoes de video disponiveis para o compilador."""
    return comp_module.AVAILABLE_TRANSITIONS


@app.get("/api/quality-presets")
async def list_quality_presets():
    """Retorna os presets de qualidade disponiveis para compilacao."""
    return comp_module.QUALITY_PRESETS


@app.get("/api/output-formats")
async def list_output_formats():
    """Retorna os formatos de saida disponiveis para render final."""
    return comp_module.OUTPUT_FORMATS


@app.get("/api/frame-fit-modes")
async def list_frame_fit_modes():
    """Retorna os modos de enquadramento disponiveis para o render."""
    return comp_module.FRAME_FIT_MODES


@app.get("/api/overlay-styles")
async def list_overlay_styles():
    """Retorna os estilos visuais disponiveis para texto overlay."""
    return comp_module.OVERLAY_STYLES


# ── Helpers do Compilador ─────────────────────────────────────────────────────

def _build_unified_transcription(videos: list[dict]) -> str:
    parts = []
    for v in videos:
        title = v.get("title") or "Video sem titulo"
        duration = v.get("duration") or 0.0
        mins = int(duration // 60)
        secs = int(duration % 60)
        # Cabecalho mostra duracao legivel mas timestamps sao em SEGUNDOS puros
        parts.append(
            f'=== Video ID: {v["id"]} | "{title}" | Duracao total: {duration:.1f}s ({mins}m{secs:02d}s) ==='
        )
        for seg in (v.get("transcription") or []):
            # Timestamps em segundos decimais — formato inequivoco para a IA
            parts.append(f'[{seg["start"]:.2f}s -> {seg["end"]:.2f}s] {seg["text"]}')
        parts.append("")
    return "\n".join(parts)


def _build_compilador_prompt(topic: str, min_duration: int, max_duration: int) -> str:
    return (
        "Voce e um editor profissional de video para YouTube especializado em canais de resumo.\n\n"
        f"Tema do projeto: {topic}\n"
        f"Duracao alvo do video final: entre {min_duration // 60} e {max_duration // 60} minutos.\n\n"
        "Sua tarefa:\n"
        "1. Selecionar os momentos mais relevantes, informativos e impactantes\n"
        "2. Organizar em uma narrativa coerente e fluida\n"
        "3. Comecar com um momento de alto impacto (hook)\n"
        "4. Terminar com uma conclusao satisfatoria\n"
        "5. Evitar repetir informacoes semelhantes de videos diferentes\n\n"
        "REGRA CRITICA SOBRE TIMESTAMPS:\n"
        "Os timestamps nas transcricoes estao em SEGUNDOS (ex: [125.40s -> 143.80s]).\n"
        "Os campos start e end no JSON de saida devem ser esses mesmos valores em SEGUNDOS.\n"
        "NAO converta para minutos. NAO invente valores. Copie exatamente os segundos do segmento selecionado.\n\n"
        "IMPORTANTE: Retorne APENAS um JSON valido (sem markdown, sem texto extra) com esta estrutura:\n"
        '{\n'
        '  "title": "titulo sugerido para o video",\n'
        '  "description": "descricao para YouTube (2-3 linhas)",\n'
        '  "segments": [\n'
        '    {\n'
        '      "video_id": "id exato do video conforme informado",\n'
        '      "start": 125.40,\n'
        '      "end": 143.80,\n'
        '      "label": "descricao curta do momento",\n'
        '      "reason": "por que selecionou este trecho"\n'
        '    }\n'
        '  ],\n'
        '  "ai_notes": "observacoes sobre as escolhas editoriais"\n'
        '}\n\n'
        "Transcricoes dos videos (timestamps em SEGUNDOS):\n"
    )


def _validate_script_timestamps(script: dict, videos: list[dict]) -> list[str]:
    """
    Verifica se os timestamps do script parecem estar em segundos (correto)
    ou se a IA os gerou em minutos (bug classico de confusao de unidade).
    Retorna lista de avisos; vazia = tudo OK.
    """
    warnings = []
    segments = script.get("segments", [])
    if not segments:
        return warnings

    # Calcula duracao maxima real dos videos
    max_real_duration = max(
        (v.get("duration") or 0.0) for v in videos
    ) if videos else 0.0

    # Se todos os end estao abaixo de 20s mas a duracao real e > 2min, algo errado
    max_end_in_script = max((s.get("end") or 0.0) for s in segments)
    if max_real_duration > 120 and max_end_in_script < 20:
        warnings.append(
            f"ATENCAO: Os timestamps do roteiro chegam ate {max_end_in_script:.1f}s mas "
            f"o video tem {max_real_duration:.0f}s ({max_real_duration/60:.1f} min). "
            "A IA pode ter gerado os timestamps em MINUTOS em vez de segundos. "
            "Regere o roteiro — o prompt foi corrigido."
        )

    # Detecta clips com duracao menor que 0.5s (inuteis para video)
    short_clips = [
        i + 1 for i, s in enumerate(segments)
        if (s.get("end") or 0) - (s.get("start") or 0) < 0.5
    ]
    if short_clips:
        warnings.append(
            f"Segmentos {short_clips} tem menos de 0.5s de duracao e serao ignorados na compilacao."
        )

    return warnings


def _parse_script_json(text: str) -> dict | None:
    """Extrai e parseia JSON da resposta da IA (pode estar em bloco de codigo markdown)."""
    import re
    match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text, re.IGNORECASE)
    if match:
        text = match.group(1)
    text = text.strip()
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None


def _run_project_process(
    job_id: str,
    project_id: str,
    req: ProcessProjectRequest,
    loop: asyncio.AbstractEventLoop,
):
    def log(msg: str):
        _jobs[job_id]["logs"].append(msg)
        _job_send(job_id, loop, {"type": "log", "message": msg})

    def progress(pct: int):
        _jobs[job_id]["progress"] = pct
        _job_send(job_id, loop, {"type": "progress", "value": pct})

    t0 = time.time()
    try:
        videos = proj_module.list_project_videos(project_id)
        if not videos:
            log("Nenhum video no projeto.")
            _job_finish(job_id, status="done")
            _job_send(job_id, loop, {"type": "done"})
            return

        pending = [v for v in videos if v.get("status") != "transcribed"]
        if not pending:
            log("Todos os videos ja estao transcritos.")
            _job_finish(job_id, status="done")
            _job_send(job_id, loop, {"type": "done"})
            return
        skipped = len(videos) - len(pending)
        if skipped:
            log(f"{skipped} video(s) ja transcritos — pulando.")
        videos = pending

        total = len(videos)
        model_name, effective_batch_size = _resolve_transcribe_runtime(req.model, req.batch_size, log)
        _, batched = tr_module.get_whisper_model(model_name, log)
        if not batched:
            raise RuntimeError("Nao foi possivel carregar o modelo Whisper.")

        for i, video in enumerate(videos, 1):
            if _jobs[job_id].get("cancelled"):
                break

            video_id = video["id"]
            title = video.get("title") or f"Video {i}"
            log(f"\n[{i}/{total}] {title}")

            local_path = video.get("local_path") or ""
            source_url = video.get("source_url") or ""

            # Download se necessario
            if not local_path and source_url:
                log("Baixando video...")
                proj_module.update_video(video_id, status="downloading")
                done_event = threading.Event()
                result_holder: dict = {"path": None, "error": None}

                def on_done(fp, _vid=video_id):
                    result_holder["path"] = fp
                    proj_module.update_video(_vid, status="downloaded", local_path=fp)
                    done_event.set()

                def on_error(msg, _vid=video_id):
                    result_holder["error"] = msg
                    proj_module.update_video(_vid, status="error", error_msg=msg)
                    done_event.set()

                def on_dl_progress(pct, speed):
                    if speed:
                        log(f"  {pct}%  ({speed})")

                dl_module.download_url(
                    url=source_url,
                    audio_only=False,
                    on_progress=on_dl_progress,
                    on_done=on_done,
                    on_error=on_error,
                )
                done_event.wait(timeout=600)

                if result_holder["error"]:
                    log(f"Erro no download: {result_holder['error']}")
                    continue
                local_path = result_holder["path"] or ""
                if not local_path:
                    log("Download nao retornou arquivo.")
                    continue
                log(f"Download concluido: {os.path.basename(local_path)}")

            if not local_path:
                log("Sem arquivo local para transcrever. Pulando.")
                continue

            # Extrair thumbnail do video
            thumbs_dir = COMPILADOS_DIR / "thumbnails"
            thumbs_dir.mkdir(exist_ok=True)
            thumb_path = str(thumbs_dir / f"thumb_{video_id}.jpg")
            if comp_module.extract_thumbnail(local_path, thumb_path, time=5.0):
                proj_module.update_video(video_id, thumbnail_path=thumb_path)

            log("Transcrevendo...")
            proj_module.update_video(video_id, status="transcribing")

            temp_wav = None
            chunk_temp_files: list[str] = []
            try:
                if not local_path.lower().endswith(".wav"):
                    temp_wav = audio.convert_to_wav(local_path, log)
                    if temp_wav is None:
                        log("Falha na conversao para WAV.")
                        proj_module.update_video(video_id, status="error", error_msg="Falha WAV")
                        continue
                    audio_path = temp_wav
                else:
                    audio_path = local_path

                duration_wav = audio.get_wav_duration(audio_path)
                language = None if req.language == "auto" else req.language

                segments_list, detected_language, chunk_temp_files = _transcribe_with_optional_chunking(
                    batched=batched,
                    audio_path=audio_path,
                    duration=duration_wav,
                    language=language,
                    beam_size=req.beam_size,
                    batch_size=effective_batch_size,
                    is_cancelled=lambda: bool(_jobs[job_id].get("cancelled")),
                    log_fn=log,
                )

                # Optional diarization
                speaker_map = None
                if req.diarize:
                    if diarization.RESEMBLYZER_AVAILABLE and diarization.SKLEARN_AVAILABLE:
                        log("Identifying speakers...")
                        embeddings = diarization.extract_embeddings(audio_path, segments_list, log)
                        if embeddings:
                            speaker_map = diarization.cluster_speakers(embeddings, 0, True, log)
                            n_spk = len(set(speaker_map.values())) if speaker_map else 0
                            log(f"{n_spk} speaker(s) identified")
                        else:
                            log("Diarization failed — saving without speaker info")
                    else:
                        log("Diarization skipped — resemblyzer/scikit-learn not installed")

                transcription = []
                for idx, s in enumerate(segments_list):
                    if not s.text.strip():
                        continue
                    seg_data = {"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()}
                    if speaker_map and idx in speaker_map:
                        seg_data["speaker"] = speaker_map[idx]
                    transcription.append(seg_data)
                video_duration = segments_list[-1].end if segments_list else duration_wav

                proj_module.update_video(
                    video_id,
                    status="transcribed",
                    transcription=transcription,
                    duration=video_duration,
                )
                log(f"{len(transcription)} segmentos | idioma: {detected_language or 'unknown'}")

            except Exception as e:
                log(f"Erro na transcricao: {e}")
                proj_module.update_video(video_id, status="error", error_msg=str(e))
            finally:
                if temp_wav:
                    try:
                        os.remove(temp_wav)
                    except OSError:
                        pass
                for temp_chunk in chunk_temp_files:
                    try:
                        os.remove(temp_chunk)
                    except OSError:
                        pass

            progress(int(i / total * 90) + 5)

        all_videos = proj_module.list_project_videos(project_id)
        if all(v["status"] == "transcribed" for v in all_videos):
            proj_module.update_project(project_id, status="transcribed")
        elif any(v["status"] == "error" for v in all_videos):
            proj_module.update_project(project_id, status="error")

        progress(100)
        elapsed = time.time() - t0
        minutes, seconds = divmod(int(elapsed), 60)
        log(f"\nProcessamento concluido em {minutes}m{seconds:02d}s")
        _job_finish(job_id, status="done")
        _job_send(job_id, loop, {"type": "done"})

    except Exception as e:
        import traceback
        msg = f"Erro: {e}\n{traceback.format_exc()}"
        log(msg)
        logger.error("Erro no processamento do projeto %s: %s", project_id, e, exc_info=True)
        _job_finish(job_id, status="error", error=str(e))
        proj_module.update_project(project_id, status="error")
        _job_send(job_id, loop, {"type": "error", "message": str(e)})


def _run_download_source(
    job_id: str,
    project_id: str,
    video_id: str,
    source_url: str,
    loop: asyncio.AbstractEventLoop,
):
    """Downloads a URL source for a manual project without transcribing."""
    def log(msg: str):
        _jobs[job_id]["logs"].append(msg)
        _job_send(job_id, loop, {"type": "log", "message": msg})

    def emit_progress(pct: int):
        _jobs[job_id]["progress"] = pct
        _job_send(job_id, loop, {"type": "progress", "progress": pct})

    try:
        log("Starting media download...")
        proj_module.update_video(video_id, status="downloading")
        emit_progress(5)

        done_event = threading.Event()
        result_holder: dict = {"path": None, "error": None}

        def on_done(fp, _vid=video_id):
            result_holder["path"] = fp
            proj_module.update_video(_vid, status="downloaded", local_path=fp)
            done_event.set()

        def on_error(msg, _vid=video_id):
            result_holder["error"] = msg
            proj_module.update_video(_vid, status="error", error_msg=msg)
            done_event.set()

        def on_dl_progress(pct, speed):
            if speed:
                log(f"  {pct}%  ({speed})")
            emit_progress(int(pct * 0.85))

        dl_module.download_url(
            url=source_url,
            audio_only=False,
            on_progress=on_dl_progress,
            on_done=on_done,
            on_error=on_error,
        )
        done_event.wait(timeout=600)

        if result_holder["error"]:
            raise RuntimeError(result_holder["error"])

        local_path = result_holder["path"] or ""
        if not local_path:
            raise RuntimeError("Download returned no file.")

        log(f"Downloaded: {os.path.basename(local_path)}")
        emit_progress(88)

        # Extract thumbnail
        thumbs_dir = COMPILADOS_DIR / "thumbnails"
        thumbs_dir.mkdir(exist_ok=True)
        thumb_path = str(thumbs_dir / f"thumb_{video_id}.jpg")
        if comp_module.extract_thumbnail(local_path, thumb_path, time=5.0):
            proj_module.update_video(video_id, thumbnail_path=thumb_path)
            log("Thumbnail extracted.")

        result_data = {"local_path": local_path, "video_id": video_id}
        _job_finish(job_id, status="done", result=result_data)
        _job_send(job_id, loop, {"type": "done", "result": result_data})

    except Exception as e:
        log(f"Error: {e}")
        _job_finish(job_id, status="error", error=str(e))
        _job_send(job_id, loop, {"type": "error", "message": str(e)})


def _run_project_compile(
    job_id: str,
    project_id: str,
    loop: asyncio.AbstractEventLoop,
):
    def log(msg: str):
        _jobs[job_id]["logs"].append(msg)
        _job_send(job_id, loop, {"type": "log", "message": msg})

    def progress(pct: int):
        _jobs[job_id]["progress"] = pct
        _job_send(job_id, loop, {"type": "progress", "value": pct})

    clips_dir = COMPILADOS_DIR / f"clips_{project_id}"
    temp_clips: list[str] = []

    try:
        project = proj_module.get_project(project_id)
        if not project:
            raise RuntimeError("Projeto nao encontrado.")

        script = project.get("script") or {}
        segments = [s for s in script.get("segments", []) if s.get("selected", True)]
        if not segments:
            raise RuntimeError("Nenhum segmento selecionado no roteiro.")

        videos_map = {v["id"]: v for v in proj_module.list_project_videos(project_id)}
        proj_module.update_project(project_id, status="compiling")
        clips_dir.mkdir(parents=True, exist_ok=True)

        # Resolucao de qualidade
        proj_config = project.get("config") or {}
        quality_key = proj_config.get("quality", "medium")
        output_format = proj_config.get("output_format", "landscape")
        frame_fit_mode = proj_config.get("frame_fit_mode", "contain")
        intro_video_path = str(proj_config.get("intro_video_path") or "").strip()
        outro_video_path = str(proj_config.get("outro_video_path") or "").strip()
        background_music_path = str(proj_config.get("background_music_path") or "").strip()
        background_music_volume = float(proj_config.get("background_music_volume", 0.18) or 0.18)
        quality = comp_module.QUALITY_PRESETS.get(quality_key, comp_module.QUALITY_PRESETS["medium"])
        crf = quality["crf"]
        norm_w, norm_h = comp_module.get_output_dimensions(quality_key, output_format)

        # Normalizacao e obrigatoria quando ha transicoes ou quando o usuario escolhe um formato-alvo
        # diferente do modo paisagem padrao.
        has_transitions = any(
            s.get("transition_in") and s.get("transition_in") != "none"
            for s in segments[1:]
        )
        has_intro = bool(intro_video_path)
        has_outro = bool(outro_video_path)
        requires_normalization = has_transitions or output_format != "landscape" or has_intro or has_outro

        if requires_normalization:
            log(
                "Normalizando clips para o formato final "
                f"{output_format} ({norm_w}x{norm_h})."
            )
        else:
            log("Sem transicoes — concatenacao rapida (sem re-encode).")

        total = len(segments)
        clip_paths: list[str] = []
        failed_clips: list[int] = []

        for i, seg in enumerate(segments, 1):
            if _jobs[job_id].get("cancelled"):
                break
            video = videos_map.get(seg.get("video_id", ""))
            if not video or not video.get("local_path"):
                log(f"[{i}/{total}] Video nao encontrado ou sem arquivo. Pulando.")
                failed_clips.append(i)
                continue
            label = seg.get("label") or f"Segmento {i}"
            log(f"[{i}/{total}] Cortando: {label} [{seg['start']:.1f}s -> {seg['end']:.1f}s]")
            clip_raw = str(clips_dir / f"clip_{i:03d}_raw.mp4")
            cut = comp_module.cut_clip(
                input_path=video["local_path"],
                start=seg["start"],
                end=seg["end"],
                output_path=clip_raw,
                log_fn=log,
            )
            if not cut:
                log(f"  Falha no corte do clip {i}.")
                failed_clips.append(i)
                continue
            temp_clips.append(clip_raw)

            # Normalize quando houver transicoes ou formato de saida dedicado (ex: celular 9:16).
            if requires_normalization:
                clip_out = str(clips_dir / f"clip_{i:03d}.mp4")
                norm = comp_module.normalize_clip(
                    input_path=clip_raw,
                    output_path=clip_out,
                    width=norm_w,
                    height=norm_h,
                    crf=crf,
                    fit_mode=frame_fit_mode,
                    log_fn=log,
                )
                base_clip = norm if norm else clip_raw
                if norm:
                    temp_clips.append(norm)
            else:
                base_clip = clip_raw

            # Texto overlay opcional por segmento
            overlay_text = seg.get("text_overlay")
            if overlay_text:
                clip_ov = str(clips_dir / f"clip_{i:03d}_ov.mp4")
                result_ov = comp_module.add_text_overlay(
                    input_path=base_clip,
                    output_path=clip_ov,
                    text=overlay_text,
                    position=seg.get("text_overlay_position") or "bottom",
                    duration=seg.get("text_overlay_duration"),
                    style=seg.get("text_overlay_style") or "classic",
                    log_fn=log,
                )
                if result_ov:
                    clip_paths.append(result_ov)
                    temp_clips.append(result_ov)
                else:
                    clip_paths.append(base_clip)
            else:
                clip_paths.append(base_clip)
            progress(int(i / total * 75) + 5)

        if not clip_paths:
            raise RuntimeError("Nenhum clip foi cortado com sucesso.")

        if failed_clips:
            log(f"\nAVISO: {len(failed_clips)} clip(s) falharam e foram ignorados: segmentos {failed_clips}.")

        intro_added = False
        if has_intro:
            intro_path_obj = Path(intro_video_path)
            if intro_path_obj.exists():
                intro_out = str(clips_dir / "clip_000_intro.mp4")
                intro_norm = comp_module.normalize_clip(
                    input_path=str(intro_path_obj),
                    output_path=intro_out,
                    width=norm_w,
                    height=norm_h,
                    crf=crf,
                    fit_mode=frame_fit_mode,
                    log_fn=log,
                )
                if intro_norm:
                    clip_paths.insert(0, intro_norm)
                    temp_clips.append(intro_norm)
                    intro_added = True
                    log("Introducao adicionada ao inicio do video.")
                else:
                    log("Falha ao preparar a introducao. O render seguira sem ela.")
            else:
                log(f"Introducao configurada, mas o arquivo nao existe: {intro_video_path}")

        outro_added = False
        if has_outro:
            outro_path_obj = Path(outro_video_path)
            if outro_path_obj.exists():
                outro_out = str(clips_dir / "clip_999_outro.mp4")
                outro_norm = comp_module.normalize_clip(
                    input_path=str(outro_path_obj),
                    output_path=outro_out,
                    width=norm_w,
                    height=norm_h,
                    crf=crf,
                    fit_mode=frame_fit_mode,
                    log_fn=log,
                )
                if outro_norm:
                    clip_paths.append(outro_norm)
                    temp_clips.append(outro_norm)
                    outro_added = True
                    log("Encerramento adicionado ao final do video.")
                else:
                    log("Falha ao preparar o encerramento. O render seguira sem ele.")
            else:
                log(f"Encerramento configurado, mas o arquivo nao existe: {outro_video_path}")

        log(f"\nConcatenando {len(clip_paths)} clips...")
        progress(88)

        # Extrair transicoes do roteiro (transition_in de cada segmento a partir do segundo)
        selected_segs = [s for s in segments if s.get("selected", True)]
        transitions = [s.get("transition_in") for s in selected_segs[1:]]
        if intro_added:
            transitions = [None] + transitions
        if outro_added:
            transitions = transitions + [None]
        transition_duration = float((project.get("config") or {}).get("transition_duration", 0.5))

        safe_name = "".join(
            c for c in (project.get("name") or "compilado") if c.isalnum() or c in " -_"
        ).strip()[:40]
        output_path = str(COMPILADOS_DIR / f"{safe_name or 'compilado'}.mp4")
        result = comp_module.concatenate_with_transitions(
            clip_paths, transitions, output_path,
            transition_duration=transition_duration,
            log_fn=log,
        )
        if not result:
            raise RuntimeError("Falha na concatenacao dos clips.")

        narration_audio = (script.get("narration_audio") or [])
        narration_enabled = bool(proj_config.get("narration_enabled", True))
        if narration_enabled and narration_audio:
            log("Aplicando narracao automatizada ao render final...")
            narration_output = str(clips_dir / "final_with_narration.mp4")
            voiced = comp_module.mix_voiceover_tracks(
                input_path=result,
                overlays=narration_audio,
                output_path=narration_output,
                voice_volume=float(proj_config.get("narration_volume", 1.0) or 1.0),
                ducking=float(proj_config.get("narration_ducking", 0.5) or 0.5),
                log_fn=log,
            )
            if voiced:
                os.replace(voiced, output_path)
                result = output_path
            else:
                log("Falha ao aplicar narracao. Mantendo o render sem voice-over.")

        if background_music_path:
            music_path_obj = Path(background_music_path)
            if music_path_obj.exists():
                mixed_output = str(clips_dir / "final_with_music.mp4")
                log("Aplicando trilha de fundo ao render final...")
                mixed = comp_module.mix_background_music(
                    input_path=result,
                    music_path=str(music_path_obj),
                    output_path=mixed_output,
                    music_volume=background_music_volume,
                    log_fn=log,
                )
                if mixed:
                    os.replace(mixed, output_path)
                    result = output_path
                else:
                    log("Falha ao aplicar trilha. Mantendo o render sem musica.")
            else:
                log(f"Trilha configurada, mas o arquivo nao existe: {background_music_path}")

        proj_module.update_project(project_id, status="done", output_path=output_path)
        progress(100)
        log(f"\nVideo compilado: {os.path.basename(output_path)}")
        _job_finish(job_id, status="done", result=output_path)
        _job_send(job_id, loop, {
            "type": "done",
            "output_path": output_path,
            "filename": os.path.basename(output_path),
        })

    except Exception as e:
        import traceback
        msg = f"Erro: {e}\n{traceback.format_exc()}"
        log(msg)
        logger.error("Erro na compilacao do projeto %s: %s", project_id, e, exc_info=True)
        _job_finish(job_id, status="error", error=str(e))
        proj_module.update_project(project_id, status="error")
        _job_send(job_id, loop, {"type": "error", "message": str(e)})
    finally:
        for c in temp_clips:
            try:
                os.remove(c)
            except OSError:
                pass
        try:
            clips_dir.rmdir()
        except OSError:
            pass


def _run_project_publish_youtube(
    job_id: str,
    project_id: str,
    req: YouTubePublishRequest,
    loop: asyncio.AbstractEventLoop,
):
    def log(msg: str):
        _jobs[job_id]["logs"].append(msg)
        _job_send(job_id, loop, {"type": "log", "message": msg})

    def progress(pct: int):
        _jobs[job_id]["progress"] = pct
        _job_send(job_id, loop, {"type": "progress", "value": pct})

    try:
        project = proj_module.get_project(project_id)
        if not project:
            raise RuntimeError("Projeto nao encontrado.")

        output_path = project.get("output_path")
        if not output_path or not os.path.exists(output_path):
            raise RuntimeError("Video compilado nao encontrado.")

        script = project.get("script") or {}
        project_config = project.get("config") or {}
        youtube_config = project_config.get("youtube") or {}

        title = (req.title or script.get("title") or project.get("name") or "Video sem titulo").strip()
        description = (req.description or script.get("description") or "").strip()
        tags = req.tags if req.tags is not None else youtube_config.get("tags") or []
        tags = _normalize_tag_list(tags)

        log("Preparando upload para YouTube...")
        progress(10)

        result = youtube_api.upload_video(
            video_path=output_path,
            title=title,
            description=description,
            tags=tags,
            privacy_status=req.privacy_status,
            category_id=req.category_id,
            made_for_kids=req.made_for_kids,
            notify_subscribers=req.notify_subscribers,
            progress_cb=lambda pct: progress(max(15, min(95, pct))),
        )

        youtube_config = {
            **youtube_config,
            "title": title,
            "description": description,
            "tags": tags,
            "privacy_status": req.privacy_status,
            "category_id": req.category_id,
            "made_for_kids": req.made_for_kids,
            "notify_subscribers": req.notify_subscribers,
            "last_upload": result,
        }
        project_config["youtube"] = youtube_config
        proj_module.update_project(project_id, config=project_config)

        progress(100)
        log(f"Upload concluido: {result['url']}")
        _job_finish(job_id, status="done", result=result)
        _job_send(job_id, loop, {"type": "done", "youtube": result})
    except Exception as e:
        log(f"Erro no upload para YouTube: {e}")
        logger.error("Erro no upload do projeto %s para YouTube: %s", project_id, e, exc_info=True)
        _job_finish(job_id, status="error", error=str(e))
        _job_send(job_id, loop, {"type": "error", "message": str(e)})


# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await websocket.accept()

    q: asyncio.Queue = asyncio.Queue()
    _ws_queues[job_id] = q

    # Envia logs já existentes ao reconectar
    job = _jobs.get(job_id, {})
    for log_msg in job.get("logs", []):
        await websocket.send_text(json.dumps({"type": "log", "message": log_msg}))
    if job.get("progress"):
        await websocket.send_text(json.dumps({"type": "progress", "value": job["progress"]}))

    try:
        while True:
            msg = await asyncio.wait_for(q.get(), timeout=60.0)
            await websocket.send_text(json.dumps(msg))
            if msg.get("type") in ("done", "error"):
                break
    except asyncio.TimeoutError:
        pass
    except WebSocketDisconnect:
        pass
    finally:
        _ws_queues.pop(job_id, None)
