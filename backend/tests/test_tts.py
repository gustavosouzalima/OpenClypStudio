"""Testes para tts.py."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from pathlib import Path
from unittest.mock import patch, MagicMock

from tts import synthesize_to_file


class TestSynthesizeToFile:

    def test_texto_vazio_retorna_none(self, tmp_path):
        output = tmp_path / "voice.wav"
        assert synthesize_to_file("", str(output)) is None

    def test_import_error_retorna_none(self, tmp_path):
        output = tmp_path / "voice.wav"
        with patch("builtins.__import__", side_effect=ImportError()):
            assert synthesize_to_file("teste", str(output)) is None

    def test_sucesso_retorna_arquivo(self, tmp_path):
        output = tmp_path / "voice.wav"
        engine = MagicMock()

        def fake_run():
            Path(output).write_bytes(b"fake wav")

        engine.runAndWait.side_effect = fake_run
        fake_pyttsx3 = MagicMock()
        fake_pyttsx3.init.return_value = engine

        with patch.dict(sys.modules, {"pyttsx3": fake_pyttsx3}):
            result = synthesize_to_file("narracao", str(output), voice_hint="pt")
        assert result == str(output.resolve())
