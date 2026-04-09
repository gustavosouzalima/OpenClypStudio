"""Testes para downloader.py — _fmt_speed e download_url."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from unittest.mock import patch, MagicMock, call
from downloader import _fmt_speed, download_url, get_download_dir


# ─── _fmt_speed ────────────────────────────────────────────────────────────────

class TestFmtSpeed:

    def test_zero_retorna_vazio(self):
        assert _fmt_speed(0) == ""

    def test_negativo_retorna_vazio(self):
        assert _fmt_speed(-100) == ""

    def test_kb_por_segundo(self):
        resultado = _fmt_speed(512 * 1024)  # 512 KB/s
        assert "KB/s" in resultado
        assert "512" in resultado

    def test_mb_por_segundo(self):
        resultado = _fmt_speed(2.5 * 1024 * 1024)  # 2.5 MB/s
        assert "MB/s" in resultado
        assert "2.5" in resultado

    def test_limite_kb_mb(self):
        """Exatamente 1 MB/s deve mostrar MB/s."""
        resultado = _fmt_speed(1_048_576)
        assert "MB/s" in resultado

    def test_abaixo_de_1mb_mostra_kb(self):
        resultado = _fmt_speed(1_048_575)  # 1 byte abaixo de 1MB
        assert "KB/s" in resultado


# ─── get_download_dir ──────────────────────────────────────────────────────────

class TestGetDownloadDir:

    def test_cria_diretorio_se_nao_existe(self, tmp_path):
        target = str(tmp_path / "novo_dir")
        with patch("downloader.DEFAULT_DOWNLOAD_DIR", target), \
             patch("downloader.os.makedirs") as mock_mkdir:
            get_download_dir()
            mock_mkdir.assert_called_once_with(target, exist_ok=True)


# ─── download_url ──────────────────────────────────────────────────────────────

class TestDownloadUrl:

    def _run_sync(self, url, **kwargs):
        """Executa download_url e aguarda a thread terminar (para testes)."""
        import threading
        done = threading.Event()
        results = {}

        def on_done(path):
            results['path'] = path
            done.set()

        def on_error(msg):
            results['error'] = msg
            done.set()

        download_url(url, on_done=on_done, on_error=on_error, **kwargs)
        done.wait(timeout=5)
        return results

    def test_sucesso_adiciona_arquivo(self, tmp_path):
        """Download bem-sucedido chama on_done com o caminho do arquivo."""
        arquivo = tmp_path / "video.m4a"
        arquivo.write_bytes(b"fake audio")

        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)

        def fake_download(urls):
            pass  # arquivo já foi criado acima

        mock_ydl.download = fake_download

        with patch("downloader.yt_dlp") as mock_lib, \
             patch("downloader.get_download_dir", return_value=str(tmp_path)), \
             patch("downloader.os.listdir", side_effect=[set(), {"video.m4a"}]):
            mock_lib.YoutubeDL.return_value = mock_ydl
            resultado = self._run_sync("https://youtube.com/watch?v=test")

        assert 'path' in resultado
        assert resultado['path'].endswith("video.m4a")

    def test_nenhum_arquivo_baixado_chama_on_error(self, tmp_path):
        """Se nenhum arquivo novo aparecer, deve chamar on_error."""
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.download = MagicMock()

        with patch("downloader.yt_dlp") as mock_lib, \
             patch("downloader.get_download_dir", return_value=str(tmp_path)), \
             patch("downloader.os.listdir", return_value=set()):
            mock_lib.YoutubeDL.return_value = mock_ydl
            resultado = self._run_sync("https://youtube.com/watch?v=test")

        assert 'error' in resultado

    def test_excecao_chama_on_error(self, tmp_path):
        """Exceção no yt-dlp deve chamar on_error com mensagem."""
        with patch("downloader.yt_dlp") as mock_lib, \
             patch("downloader.get_download_dir", return_value=str(tmp_path)):
            mock_lib.YoutubeDL.side_effect = RuntimeError("URL inválida")
            resultado = self._run_sync("https://url-invalida.com")

        assert 'error' in resultado
        assert "URL inválida" in resultado['error']

    def test_on_progress_chamado(self, tmp_path):
        """Hook de progresso deve chamar on_progress com pct e speed."""
        arquivo = tmp_path / "audio.webm"
        arquivo.write_bytes(b"x")

        progress_calls = []

        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)

        captured_hook = {}

        def fake_ydl_class(opts):
            captured_hook['hook'] = opts['progress_hooks'][0]
            return mock_ydl

        mock_ydl.download = MagicMock()

        with patch("downloader.yt_dlp") as mock_lib, \
             patch("downloader.get_download_dir", return_value=str(tmp_path)), \
             patch("downloader.os.listdir", side_effect=[set(), {"audio.webm"}]):
            mock_lib.YoutubeDL.side_effect = fake_ydl_class

            import threading
            done = threading.Event()

            download_url(
                "https://youtube.com/watch?v=x",
                on_progress=lambda pct, spd: progress_calls.append(pct),
                on_done=lambda p: done.set(),
                on_error=lambda e: done.set(),
                download_dir=str(tmp_path),
            )

            # Simula o hook de progresso
            if captured_hook:
                captured_hook['hook']({
                    'status': 'downloading',
                    'downloaded_bytes': 500,
                    'total_bytes': 1000,
                    'speed': 256 * 1024,
                })
                captured_hook['hook']({'status': 'finished'})

            done.wait(timeout=5)

        assert 50 in progress_calls   # 500/1000 = 50%
        assert 100 in progress_calls  # finished
