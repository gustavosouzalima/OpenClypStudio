"""Download de vídeos/áudios do YouTube e Instagram via yt-dlp."""

import os
import threading
import subprocess
from pathlib import Path

try:
    import yt_dlp
    YT_DLP_AVAILABLE = True
except ImportError:
    yt_dlp = None
    YT_DLP_AVAILABLE = False
    print("⚠️ yt-dlp não instalado. Execute: pip install yt-dlp")

DEFAULT_DOWNLOAD_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "Transcritor")


def get_download_dir() -> str:
    os.makedirs(DEFAULT_DOWNLOAD_DIR, exist_ok=True)
    return DEFAULT_DOWNLOAD_DIR


def download_url(
    url: str,
    audio_only: bool = True,
    on_progress=None,
    on_done=None,
    on_error=None,
    download_dir: str = None,
):
    """
    Baixa um vídeo/áudio em thread separada.

    Callbacks:
        on_progress(pct: int, speed: str)  — progresso do download
        on_done(filepath: str)             — caminho do arquivo final
        on_error(msg: str)                 — mensagem de erro
    """
    def _run():
        target_dir = download_dir or get_download_dir()
        os.makedirs(target_dir, exist_ok=True)
        before = set(os.listdir(target_dir))

        ydl_opts = {
            'outtmpl': os.path.join(target_dir, '%(title)s.%(ext)s'),
            'progress_hooks': [_make_hook(on_progress)],
            'quiet': True,
            'no_warnings': True,
        }

        if audio_only:
            ydl_opts['format'] = 'bestaudio/best'
        else:
            # Prioriza codecs amplamente compatíveis com o editor (H.264/AVC em MP4).
            # Evita AV1/AV01 que costuma quebrar pipelines de thumbnail/decoding em browser.
            ydl_opts['format'] = (
                'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/'
                'best[vcodec^=avc1][ext=mp4]/'
                'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
            )
            ydl_opts['merge_output_format'] = 'mp4'

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)

            final_path = _resolve_downloaded_path(info, target_dir, before)
            if not audio_only:
                final_path = ensure_editor_compatible_video(final_path)
            if on_done:
                on_done(final_path)

        except Exception as e:
            if on_error:
                on_error(str(e))

    threading.Thread(target=_run, daemon=True).start()


def _resolve_downloaded_path(info: dict, target_dir: str, before: set[str]) -> str:
    requested = info.get("requested_downloads") or []
    for item in requested:
        filepath = item.get("filepath")
        if filepath and os.path.exists(filepath):
            return filepath

    for key in ("filepath", "_filename"):
        filepath = info.get(key)
        if filepath and os.path.exists(filepath):
            return filepath

    entries = info.get("entries")
    if isinstance(entries, list):
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            for key in ("filepath", "_filename"):
                filepath = entry.get(key)
                if filepath and os.path.exists(filepath):
                    return filepath

    after = set(os.listdir(target_dir))
    new_files = [os.path.join(target_dir, f) for f in after - before]
    if new_files:
        return max(new_files, key=os.path.getmtime)

    all_files = [
        os.path.join(target_dir, f)
        for f in os.listdir(target_dir)
        if os.path.isfile(os.path.join(target_dir, f))
    ]
    if all_files:
        return max(all_files, key=os.path.getmtime)

    raise RuntimeError("Nenhum arquivo foi baixado.")


def _make_hook(on_progress):
    _last_pct = [-1]

    def hook(d):
        if on_progress is None:
            return
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            downloaded = d.get('downloaded_bytes', 0)
            speed_raw = d.get('speed') or 0
            speed = _fmt_speed(speed_raw)
            if total > 0:
                pct = int(downloaded / total * 100)
                if pct != _last_pct[0]:
                    _last_pct[0] = pct
                    on_progress(pct, speed)
        elif d['status'] == 'finished':
            on_progress(100, "")

    return hook


def _fmt_speed(bps: float) -> str:
    if bps <= 0:
        return ""
    if bps >= 1_048_576:
        return f"{bps / 1_048_576:.1f} MB/s"
    return f"{bps / 1024:.0f} KB/s"


def _probe_video_codec(path: str) -> str | None:
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=codec_name",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            return None
        codec = (completed.stdout or "").strip().lower()
        return codec or None
    except Exception:
        return None


def ensure_editor_compatible_video(path: str) -> str:
    """Converte para H.264/AAC quando o vídeo baixado não é compatível com o editor."""
    src = Path(path)
    if not src.exists():
        return path

    codec = _probe_video_codec(str(src))
    if codec in {"h264", "avc1"}:
        return str(src)

    # Reencode para MP4 H.264/AAC com faststart para playback web.
    transcode_dirs = [
        src.parent,
    ]
    pixel_data_dir = os.getenv("PIXEL_DATA_DIR", "").strip()
    if pixel_data_dir:
        transcode_dirs.append(Path(pixel_data_dir) / "uploads" / "transcoded")

    for out_dir in transcode_dirs:
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
        except OSError:
            continue
        dst = out_dir / f"{src.stem}_h264.mp4"
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(dst),
        ]
        completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if completed.returncode == 0 and dst.exists():
            return str(dst)

    return str(src)
