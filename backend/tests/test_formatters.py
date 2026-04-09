"""Testes para formatters.py — format_txt e format_srt."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from formatters import format_txt, format_srt


# ─── format_txt ────────────────────────────────────────────────────────────────

class TestFormatTxt:

    def test_sem_diarizacao(self, segments_simples):
        resultado = format_txt(segments_simples, speaker_map=None, diarize=False)
        linhas = resultado.splitlines()
        assert linhas[0] == "Olá, tudo bem?"
        assert linhas[1] == "Sim, obrigado."
        assert linhas[2] == "Até logo."

    def test_com_diarizacao(self, segments_simples, speaker_map_dois):
        resultado = format_txt(segments_simples, speaker_map=speaker_map_dois, diarize=True)
        linhas = resultado.splitlines()
        assert linhas[0] == "SPEAKER_01: Olá, tudo bem?"
        assert linhas[1] == "SPEAKER_02: Sim, obrigado."
        assert linhas[2] == "SPEAKER_01: Até logo."

    def test_ignora_segmentos_vazios(self, segments_com_vazio):
        resultado = format_txt(segments_com_vazio, speaker_map=None, diarize=False)
        linhas = resultado.splitlines()
        assert len(linhas) == 2
        assert linhas[0] == "Primeiro segmento."
        assert linhas[1] == "Último segmento."

    def test_diarizacao_false_ignora_speaker_map(self, segments_simples, speaker_map_dois):
        """Mesmo passando speaker_map, se diarize=False não deve aparecer prefixo."""
        resultado = format_txt(segments_simples, speaker_map=speaker_map_dois, diarize=False)
        assert "SPEAKER" not in resultado

    def test_lista_vazia(self):
        resultado = format_txt([], speaker_map=None, diarize=False)
        assert resultado == ""

    def test_speaker_map_none_com_diarize_true(self, segments_simples):
        """diarize=True mas speaker_map=None → sem prefixo (diarização falhou)."""
        resultado = format_txt(segments_simples, speaker_map=None, diarize=True)
        assert "SPEAKER" not in resultado

    def test_com_nomes_personalizados(self, segments_simples, speaker_map_dois):
        resultado = format_txt(
            segments_simples,
            speaker_map=speaker_map_dois,
            diarize=True,
            speaker_names={"SPEAKER_01": "João", "SPEAKER_02": "Maria"},
        )
        linhas = resultado.splitlines()
        assert linhas[0] == "João: Olá, tudo bem?"
        assert linhas[1] == "Maria: Sim, obrigado."
        assert linhas[2] == "João: Até logo."


# ─── format_srt ────────────────────────────────────────────────────────────────

class TestFormatSrt:

    def test_numeracao_sequencial(self, segments_simples):
        resultado = format_srt(segments_simples, speaker_map=None, diarize=False)
        linhas = resultado.splitlines()
        assert linhas[0] == "1"
        # Encontra onde começa o bloco 2
        idx2 = linhas.index("2")
        assert idx2 > 0
        idx3 = linhas.index("3")
        assert idx3 > idx2

    def test_formato_timestamp(self, segments_simples):
        resultado = format_srt(segments_simples, speaker_map=None, diarize=False)
        linhas = resultado.splitlines()
        # Segunda linha do primeiro bloco = timestamp
        assert linhas[1] == "00:00:00,000 --> 00:00:02,500"

    def test_timestamp_horas(self):
        from dataclasses import dataclass

        @dataclass
        class Seg:
            text: str
            start: float
            end: float

        seg = [Seg("Texto longo.", 3661.5, 3723.75)]
        resultado = format_srt(seg, speaker_map=None, diarize=False)
        linhas = resultado.splitlines()
        assert linhas[1] == "01:01:01,500 --> 01:02:03,750"

    def test_com_diarizacao(self, segments_simples, speaker_map_dois):
        resultado = format_srt(segments_simples, speaker_map=speaker_map_dois, diarize=True)
        assert "[SPEAKER_01]" in resultado
        assert "[SPEAKER_02]" in resultado

    def test_com_nomes_personalizados(self, segments_simples, speaker_map_dois):
        resultado = format_srt(
            segments_simples,
            speaker_map=speaker_map_dois,
            diarize=True,
            speaker_names={"SPEAKER_01": "João", "SPEAKER_02": "Maria"},
        )
        assert "[João]" in resultado
        assert "[Maria]" in resultado

    def test_ignora_segmentos_vazios(self, segments_com_vazio):
        resultado = format_srt(segments_com_vazio, speaker_map=None, diarize=False)
        linhas = [l for l in resultado.splitlines() if l]
        # Apenas 2 blocos válidos → índices 1 e 2
        assert linhas[0] == "1"
        # Confirma que existe o índice 2
        assert "2" in linhas

    def test_lista_vazia(self):
        resultado = format_srt([], speaker_map=None, diarize=False)
        assert resultado == ""

    def test_bloco_separado_por_linha_em_branco(self, segments_simples):
        resultado = format_srt(segments_simples, speaker_map=None, diarize=False)
        # Entre blocos deve haver linha vazia
        blocos = resultado.split("\n\n")
        # Último elemento pode ser vazio se terminar com \n\n
        blocos = [b for b in blocos if b.strip()]
        assert len(blocos) == 3
