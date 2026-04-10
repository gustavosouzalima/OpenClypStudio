"""Conversão de áudio via FFmpeg."""

import os
import tempfile
import subprocess
import wave


def convert_to_wav(input_file: str, log_fn=None) -> str | None:
    """Converte qualquer áudio/vídeo para WAV 16kHz mono. Retorna o caminho do WAV ou None."""
    try:
        safe_name = f"transcritor_{os.getpid()}_{os.path.splitext(os.path.basename(input_file))[0]}.wav"
        out = os.path.join(tempfile.gettempdir(), safe_name)
        cmd = [
            'ffmpeg', '-threads', '0', '-i', input_file,
            '-vn', '-sn', '-dn',
            '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', out
        ]
        subprocess.run(cmd, check=True, capture_output=True, timeout=3600)
        return out
    except subprocess.TimeoutExpired:
        if log_fn:
            log_fn("FFmpeg excedeu o tempo limite na conversao para WAV.")
        return None
    except FileNotFoundError:
        if log_fn:
            log_fn("FFmpeg nao encontrado.")
        return None
    except subprocess.CalledProcessError as e:
        if log_fn:
            log_fn(f"Erro na conversao: {e.stderr.decode(errors='ignore')[:200]}")
        return None


def get_wav_duration(wav_path: str) -> float:
    """Retorna duração em segundos de um arquivo WAV."""
    try:
        with wave.open(wav_path, 'rb') as wf:
            return wf.getnframes() / float(wf.getframerate())
    except Exception:
        return 1.0
