"""Corte de clips de video e montagem final via FFmpeg."""

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

QUALITY_PRESETS = {
    "high":   {"crf": 18, "scale": "1920:1080"},
    "medium": {"crf": 23, "scale": "1280:720"},
    "low":    {"crf": 28, "scale": "854:480"},
}

OUTPUT_FORMATS = {
    "landscape": {
        "label": "Tela normal",
        "aspect_ratio": "16:9",
        "dimensions": {
            "high": (1920, 1080),
            "medium": (1280, 720),
            "low": (854, 480),
        },
    },
    "portrait": {
        "label": "Celular",
        "aspect_ratio": "9:16",
        "dimensions": {
            "high": (1080, 1920),
            "medium": (720, 1280),
            "low": (480, 854),
        },
    },
}

FRAME_FIT_MODES = {
    "contain": {"label": "Caber inteiro"},
    "cover": {"label": "Preencher cortando"},
    "blur": {"label": "Fundo desfocado"},
}

OVERLAY_STYLES = {
    "classic": {"label": "Classico"},
    "punch": {"label": "Impacto"},
    "lower_third": {"label": "Lower third"},
}

AVAILABLE_TRANSITIONS = [
    "none",
    "fade",
    "dissolve",
    "wipeleft",
    "wiperight",
    "wipeup",
    "wipedown",
    "slideleft",
    "slideright",
    "circleopen",
    "circleclose",
]


def get_output_dimensions(quality_key: str = "medium", output_format: str = "landscape") -> tuple[int, int]:
    """Resolve largura/altura alvo para o preset de qualidade e formato escolhido."""
    fmt = OUTPUT_FORMATS.get(output_format, OUTPUT_FORMATS["landscape"])
    dimensions = fmt["dimensions"]
    return dimensions.get(quality_key, dimensions["medium"])


def ffmpeg_available() -> bool:
    """Verifica se FFmpeg esta disponivel no PATH."""
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def cut_clip(
    input_path: str,
    start: float,
    end: float,
    output_path: str,
    log_fn=None,
) -> str | None:
    """
    Corta um trecho de video entre start e end (em segundos).
    Retorna output_path em caso de sucesso ou None em caso de erro.
    """
    duration = end - start
    if duration <= 0:
        if log_fn:
            log_fn(f"Duracao invalida: start={start} end={end}")
        return None
    cmd = [
        "ffmpeg",
        "-ss", str(start),
        "-i", input_path,
        "-t", str(duration),
        "-c:v", "libx264",
        "-c:a", "aac",
        "-avoid_negative_ts", "make_zero",
        "-y",
        output_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
        return output_path
    except subprocess.TimeoutExpired:
        if log_fn:
            log_fn("FFmpeg excedeu o tempo limite.")
        return None
    except FileNotFoundError:
        if log_fn:
            log_fn("FFmpeg nao encontrado.")
        return None
    except subprocess.CalledProcessError as e:
        if log_fn:
            log_fn(f"Erro ao cortar clip: {e.stderr.decode(errors='ignore')[:300]}")
        return None


def concatenate_clips(
    clip_paths: list[str],
    output_path: str,
    log_fn=None,
) -> str | None:
    """
    Concatena uma lista de clips MP4 em um unico arquivo via FFmpeg concat demuxer.
    Retorna output_path em caso de sucesso ou None em caso de erro.
    """
    if not clip_paths:
        if log_fn:
            log_fn("Nenhum clip para concatenar.")
        return None
    if len(clip_paths) == 1:
        shutil.copy2(clip_paths[0], output_path)
        return output_path

    list_fd, list_path = tempfile.mkstemp(suffix=".txt")
    try:
        with os.fdopen(list_fd, "w", encoding="utf-8") as f:
            for cp in clip_paths:
                safe = Path(cp).resolve().as_posix()
                f.write(f"file '{safe}'\n")
        cmd = [
            "ffmpeg",
            "-f", "concat",
            "-safe", "0",
            "-i", list_path,
            "-c", "copy",
            "-y",
            output_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
        return output_path
    except subprocess.TimeoutExpired:
        if log_fn:
            log_fn("FFmpeg excedeu o tempo limite.")
        return None
    except FileNotFoundError:
        if log_fn:
            log_fn("FFmpeg nao encontrado.")
        return None
    except subprocess.CalledProcessError as e:
        if log_fn:
            log_fn(f"Erro na concatenacao: {e.stderr.decode(errors='ignore')[:300]}")
        return None
    finally:
        try:
            os.unlink(list_path)
        except OSError:
            pass


def get_duration(path: str) -> float | None:
    """
    Retorna a duracao em segundos de um arquivo de video usando ffprobe.
    Retorna None em caso de erro.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        path,
    ]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, timeout=30)
        data = json.loads(result.stdout)
        for stream in data.get("streams", []):
            d = stream.get("duration")
            if d:
                return float(d)
    except (FileNotFoundError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired, ValueError, KeyError):
        pass
    return None


def concatenate_with_transitions(
    clip_paths: list[str],
    transitions: list[str | None],
    output_path: str,
    transition_duration: float = 0.5,
    log_fn=None,
) -> str | None:
    """
    Concatena clips com transicoes xfade entre eles.

    - transitions: lista de N-1 nomes de transicao (um por juncao entre clips).
      Valores None ou "none" indicam corte direto.
    - Se todas as transicoes forem None/"none", usa concat demuxer (rapido, sem re-encode).
    - Se qualquer transicao estiver ativa, usa FFmpeg xfade + acrossfade (re-encode).
    - Se ffprobe falhar ao obter duracoes, cai no concat demuxer como fallback.

    Retorna output_path em caso de sucesso ou None em caso de erro.
    """
    if not clip_paths:
        if log_fn:
            log_fn("Nenhum clip para concatenar.")
        return None

    if len(clip_paths) == 1:
        shutil.copy2(clip_paths[0], output_path)
        return output_path

    def _is_none(t):
        return t is None or str(t).lower() == "none"

    # Se todas as transicoes sao "none", usa concat demuxer
    if all(_is_none(t) for t in transitions):
        return concatenate_clips(clip_paths, output_path, log_fn=log_fn)

    # Obter duracoes via ffprobe — short-circuit na primeira falha
    durations: list[float] = []
    for p in clip_paths:
        d = get_duration(p)
        if d is None:
            if log_fn:
                log_fn("Nao foi possivel obter duracao de um clip — usando concat direto.")
            return concatenate_clips(clip_paths, output_path, log_fn=log_fn)
        durations.append(d)

    # Garantir que transitions tem exatamente N-1 entradas
    n = len(clip_paths)
    trans = list(transitions) + [None] * (n - 1)
    trans = trans[: n - 1]

    # Construir filter_complex com xfade + acrossfade encadeados
    # Video
    v_labels = [f"[{i}:v]" for i in range(n)]
    a_labels = [f"[{i}:a]" for i in range(n)]
    filter_parts = []

    running_offset = 0.0
    prev_v = v_labels[0]
    prev_a = a_labels[0]

    for i in range(n - 1):
        t_name = trans[i] if not _is_none(trans[i]) else "fade"
        td = min(transition_duration, durations[i] * 0.9, durations[i + 1] * 0.9)
        running_offset += durations[i] - td

        is_last = i == n - 2
        out_v = "[vout]" if is_last else f"[v{i:02d}]"
        out_a = "[aout]" if is_last else f"[a{i:02d}]"

        filter_parts.append(
            f"{prev_v}{v_labels[i + 1]}xfade=transition={t_name}:"
            f"duration={td}:offset={running_offset:.4f}{out_v}"
        )
        filter_parts.append(
            f"{prev_a}{a_labels[i + 1]}acrossfade=d={td}{out_a}"
        )
        prev_v = out_v
        prev_a = out_a

    filter_complex = ";".join(filter_parts)

    inputs = []
    for p in clip_paths:
        inputs += ["-i", p]

    cmd = [
        "ffmpeg",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-y",
        output_path,
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
        return output_path
    except subprocess.TimeoutExpired:
        if log_fn:
            log_fn("FFmpeg excedeu o tempo limite.")
        return None
    except FileNotFoundError:
        if log_fn:
            log_fn("FFmpeg nao encontrado.")
        return None
    except subprocess.CalledProcessError as e:
        if log_fn:
            log_fn(f"Erro na concatenacao com transicoes: {e.stderr.decode(errors='ignore')[:300]}")
        return None


def normalize_clip(
    input_path: str,
    output_path: str,
    width: int = 1920,
    height: int = 1080,
    fps: int = 30,
    crf: int = 23,
    fit_mode: str = "contain",
    log_fn=None,
) -> str | None:
    """
    Normaliza um clip para resolucao, FPS e codec uniformes.
    Necessario antes de concatenar clips de origens diferentes com xfade.
    Usa scale+pad para manter aspect ratio sem distorcer.
    """
    if fit_mode == "cover":
        vf = (
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},"
            f"fps={fps}"
        )
    elif fit_mode == "blur":
        vf = (
            f"split[bg][fg];"
            f"[bg]scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},gblur=sigma=18[bgblur];"
            f"[fg]scale={width}:{height}:force_original_aspect_ratio=decrease[fgfit];"
            f"[bgblur][fgfit]overlay=(W-w)/2:(H-h)/2,"
            f"fps={fps}"
        )
    else:
        vf = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fps={fps}"
        )
    cmd = [
        "ffmpeg",
        "-i", input_path,
        "-vf", vf,
        "-c:v", "libx264",
        "-crf", str(crf),
        "-c:a", "aac",
        "-ar", "48000",
        "-ac", "2",
        "-y",
        output_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
        return output_path
    except subprocess.TimeoutExpired:
        if log_fn:
            log_fn("FFmpeg excedeu o tempo limite.")
        return None
    except FileNotFoundError:
        if log_fn:
            log_fn("FFmpeg nao encontrado.")
        return None
    except subprocess.CalledProcessError as e:
        if log_fn:
            log_fn(f"Erro ao normalizar clip: {e.stderr.decode(errors='ignore')[:300]}")
        return None


def mix_background_music(
    input_path: str,
    music_path: str,
    output_path: str,
    music_volume: float = 0.18,
    fade_out_duration: float = 2.5,
    log_fn=None,
) -> str | None:
    """
    Mistura trilha de fundo ao audio principal do video final.
    A trilha e repetida se necessario, respeita o tempo do video e recebe fade out.
    """
    duration = get_duration(input_path)
    if duration is None or duration <= 0:
        if log_fn:
            log_fn("Nao foi possivel medir a duracao do video final para aplicar trilha.")
        return None

    fade_start = max(duration - max(fade_out_duration, 0.1), 0.0)
    filter_complex = (
        f"[1:a]volume={max(music_volume, 0.0):.3f},"
        f"atrim=0:{duration:.3f},"
        f"afade=t=out:st={fade_start:.3f}:d={max(fade_out_duration, 0.1):.3f}[bg];"
        f"[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]"
    )
    cmd = [
        "ffmpeg",
        "-i", input_path,
        "-stream_loop", "-1",
        "-i", music_path,
        "-filter_complex", filter_complex,
        "-map", "0:v:0",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        "-y",
        output_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
        return output_path
    except subprocess.TimeoutExpired:
        if log_fn:
            log_fn("FFmpeg excedeu o tempo limite ao misturar trilha.")
        return None
    except FileNotFoundError:
        if log_fn:
            log_fn("FFmpeg nao encontrado.")
        return None
    except subprocess.CalledProcessError as e:
        if log_fn:
            log_fn(f"Erro ao misturar trilha: {e.stderr.decode(errors='ignore')[:300]}")
        return None


def mix_voiceover_tracks(
    input_path: str,
    overlays: list[dict],
    output_path: str,
    voice_volume: float = 1.0,
    ducking: float = 0.5,
    log_fn=None,
) -> str | None:
    """
    Mistura uma ou mais narracoes temporizadas sobre o audio principal do video.
    overlays: [{"audio_path": "...", "start": 12.5, "volume": 1.0}, ...]
    """
    valid = [item for item in overlays if item.get("audio_path") and os.path.exists(str(item["audio_path"]))]
    if not valid:
      if log_fn:
          log_fn("Nenhuma narracao valida para mixar.")
      return None

    inputs = ["-i", input_path]
    filter_parts = [f"[0:a]volume={max(0.0, min(1.0, ducking)):.3f}[base]"]
    mix_inputs = ["[base]"]

    for idx, item in enumerate(valid, 1):
        audio_path = str(item["audio_path"])
        start_ms = max(0, int(float(item.get("start", 0.0)) * 1000))
        volume = max(0.0, float(item.get("volume", voice_volume)))
        inputs += ["-i", audio_path]
        label = f"[vo{idx}]"
        filter_parts.append(
            f"[{idx}:a]adelay={start_ms}|{start_ms},volume={volume:.3f}{label}"
        )
        mix_inputs.append(label)

    filter_parts.append(
        "".join(mix_inputs) + f"amix=inputs={len(mix_inputs)}:duration=first:dropout_transition=2[aout]"
    )
    cmd = [
        "ffmpeg",
        *inputs,
        "-filter_complex", ";".join(filter_parts),
        "-map", "0:v:0",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        "-y",
        output_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
        return output_path
    except subprocess.TimeoutExpired:
        if log_fn:
            log_fn("FFmpeg excedeu o tempo limite ao misturar narracao.")
        return None
    except FileNotFoundError:
        if log_fn:
            log_fn("FFmpeg nao encontrado.")
        return None
    except subprocess.CalledProcessError as e:
        if log_fn:
            log_fn(f"Erro ao misturar narracao: {e.stderr.decode(errors='ignore')[:300]}")
        return None


def add_text_overlay(
    input_path: str,
    output_path: str,
    text: str,
    position: str = "bottom",
    duration: float | None = None,
    font_size: int = 28,
    style: str = "classic",
    log_fn=None,
) -> str | None:
    """
    Adiciona texto sobre o video usando FFmpeg drawtext.
    position: 'bottom', 'top', 'center'
    duration: segundos que o texto fica visivel (None = video todo)
    """
    # Escapa aspas simples no texto
    safe_text = text.replace("'", "\\'").replace(":", "\\:")

    enable = f":enable='between(t,0,{duration})'" if duration else ""

    if style == "punch":
        if position == "top":
            y_expr = "36"
        elif position == "center":
            y_expr = "(H-th)/2"
        else:
            y_expr = "H-th-46"
        drawtext = (
            f"drawtext=text='{safe_text}'"
            f":fontsize={max(font_size + 12, 40)}"
            f":fontcolor=white"
            f":borderw=4:bordercolor=black@0.9"
            f":box=1:boxcolor=black@0.35:boxborderw=18"
            f":x=(W-tw)/2:y={y_expr}"
            f"{enable}"
        )
    elif style == "lower_third":
        y_expr = "H-th-72" if position != "top" else "48"
        drawtext = (
            f"drawtext=text='{safe_text}'"
            f":fontsize={max(font_size - 2, 24)}"
            f":fontcolor=white"
            f":box=1:boxcolor=black@0.78:boxborderw=16"
            f":x=36:y={y_expr}"
            f"{enable}"
        )
    else:
        if position == "top":
            y_expr = "20"
        elif position == "center":
            y_expr = "(H-th)/2"
        else:  # bottom
            y_expr = "H-th-20"
        drawtext = (
            f"drawtext=text='{safe_text}'"
            f":fontsize={font_size}"
            f":fontcolor=white"
            f":box=1:boxcolor=black@0.6:boxborderw=8"
            f":x=20:y={y_expr}"
            f"{enable}"
        )

    cmd = [
        "ffmpeg",
        "-i", input_path,
        "-vf", drawtext,
        "-c:v", "libx264",
        "-c:a", "copy",
        "-y",
        output_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
        return output_path
    except subprocess.TimeoutExpired:
        if log_fn:
            log_fn("FFmpeg excedeu o tempo limite.")
        return None
    except FileNotFoundError:
        if log_fn:
            log_fn("FFmpeg nao encontrado.")
        return None
    except subprocess.CalledProcessError as e:
        if log_fn:
            log_fn(f"Erro ao adicionar texto: {e.stderr.decode(errors='ignore')[:300]}")
        return None


def extract_thumbnail(
    input_path: str,
    output_path: str,
    time: float = 5.0,
    log_fn=None,
) -> str | None:
    """
    Extrai um frame do video em `time` segundos como JPEG.
    Retorna output_path ou None em caso de erro.
    """
    cmd = [
        "ffmpeg",
        "-ss", str(time),
        "-i", input_path,
        "-vframes", "1",
        "-q:v", "2",
        "-y",
        output_path,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=60)
        return output_path
    except subprocess.TimeoutExpired:
        if log_fn:
            log_fn("FFmpeg excedeu o tempo limite ao extrair thumbnail.")
        return None
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        if log_fn:
            log_fn(f"Erro ao extrair thumbnail: {e}")
        return None
