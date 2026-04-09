"""Testes para audio.py — convert_to_wav e get_wav_duration."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import wave
import struct
import pytest
from unittest.mock import patch, MagicMock
from audio import convert_to_wav, get_wav_duration


@pytest.fixture
def wav_file(tmp_path):
    """Cria um arquivo WAV válido de 1 segundo (16kHz, mono, 16-bit)."""
    path = tmp_path / "test.wav"
    sample_rate = 16000
    num_samples = sample_rate  # 1 segundo
    with wave.open(str(path), 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack('<' + 'h' * num_samples, *([0] * num_samples)))
    return str(path)


# ─── get_wav_duration ──────────────────────────────────────────────────────────

class TestGetWavDuration:

    def test_duracao_correta(self, wav_file):
        duracao = get_wav_duration(wav_file)
        assert abs(duracao - 1.0) < 0.01  # ~1 segundo

    def test_arquivo_invalido_retorna_fallback(self, tmp_path):
        """Arquivo inexistente deve retornar 1.0 (fallback seguro)."""
        duracao = get_wav_duration(str(tmp_path / "nao_existe.wav"))
        assert duracao == 1.0

    def test_arquivo_corrompido_retorna_fallback(self, tmp_path):
        """Arquivo com conteúdo inválido deve retornar 1.0."""
        bad = tmp_path / "bad.wav"
        bad.write_bytes(b"isso nao e um wav")
        duracao = get_wav_duration(str(bad))
        assert duracao == 1.0


# ─── convert_to_wav ────────────────────────────────────────────────────────────

class TestConvertToWav:

    def test_sucesso(self, tmp_path):
        """FFmpeg encontrado e converte com sucesso."""
        fake_out = str(tmp_path / "saida.wav")
        with patch("audio.subprocess.run") as mock_run, \
             patch("audio.os.path.join", return_value=fake_out), \
             patch("audio.tempfile.gettempdir", return_value=str(tmp_path)):
            mock_run.return_value = MagicMock(returncode=0)
            resultado = convert_to_wav("video.mp4")
        assert resultado == fake_out

    def test_ffmpeg_nao_encontrado(self, tmp_path):
        """FileNotFoundError → retorna None e chama log_fn."""
        log_msgs = []
        with patch("audio.subprocess.run", side_effect=FileNotFoundError()):
            resultado = convert_to_wav("video.mp4", log_fn=log_msgs.append)
        assert resultado is None
        assert any("FFmpeg" in m for m in log_msgs)

    def test_ffmpeg_erro_de_conversao(self, tmp_path):
        """CalledProcessError → retorna None e chama log_fn."""
        import subprocess
        log_msgs = []
        erro = subprocess.CalledProcessError(1, "ffmpeg", stderr=b"erro de codec")
        with patch("audio.subprocess.run", side_effect=erro):
            resultado = convert_to_wav("video.mp4", log_fn=log_msgs.append)
        assert resultado is None
        assert any("Erro" in m for m in log_msgs)

    def test_sem_log_fn_nao_falha(self):
        """Sem log_fn, erros não devem levantar exceção."""
        with patch("audio.subprocess.run", side_effect=FileNotFoundError()):
            resultado = convert_to_wav("video.mp4", log_fn=None)
        assert resultado is None
