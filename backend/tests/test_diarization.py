"""Testes para diarization.py — cluster_speakers."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
import numpy as np
from unittest.mock import patch, MagicMock


# ─── cluster_speakers ──────────────────────────────────────────────────────────

class TestClusterSpeakers:

    def _embeddings_dois_falantes(self):
        """Gera embeddings sintéticos claramente separáveis em 2 clusters."""
        rng = np.random.default_rng(42)
        cluster_a = [rng.normal([1, 0, 0], 0.05, 3) for _ in range(5)]
        cluster_b = [rng.normal([0, 1, 0], 0.05, 3) for _ in range(5)]
        return cluster_a + cluster_b  # 10 embeddings, 5 de cada falante

    def test_dois_falantes(self):
        from diarization import cluster_speakers
        embeddings = self._embeddings_dois_falantes()
        resultado = cluster_speakers(embeddings, num_speakers=2, auto_detect=False)

        assert isinstance(resultado, dict)
        assert len(resultado) == len(embeddings)
        # Deve haver exatamente 2 valores únicos (0 e 1)
        assert len(set(resultado.values())) == 2

    def test_um_falante_retorna_todos_zero(self):
        """Apenas 1 embedding válido → todos speaker 0."""
        from diarization import cluster_speakers
        embeddings = [np.array([1.0, 0.0, 0.0])]
        resultado = cluster_speakers(embeddings, num_speakers=2, auto_detect=False)
        assert all(v == 0 for v in resultado.values())

    def test_sem_sklearn_retorna_none(self):
        with patch("diarization.SKLEARN_AVAILABLE", False):
            from diarization import cluster_speakers
            resultado = cluster_speakers(
                [np.array([1.0, 0.0])],
                num_speakers=2,
                auto_detect=False,
            )
        assert resultado is None

    def test_embedding_none_e_preenchido(self):
        """Embeddings None devem herdar o speaker do segmento anterior."""
        from diarization import cluster_speakers
        rng = np.random.default_rng(0)
        # 3 embeddings reais + 1 None no meio
        e0 = rng.normal([1, 0], 0.01, 2)
        e1 = rng.normal([0, 1], 0.01, 2)
        e2 = rng.normal([1, 0], 0.01, 2)
        embeddings = [e0, None, e1, e2]

        resultado = cluster_speakers(embeddings, num_speakers=2, auto_detect=False)

        assert len(resultado) == 4
        # O índice 1 (None) deve ter o mesmo speaker que o índice 0
        assert resultado[1] == resultado[0]

    def test_auto_detect_log(self):
        """auto_detect=True deve chamar log_fn com número detectado."""
        from diarization import cluster_speakers
        logs = []
        embeddings = self._embeddings_dois_falantes()
        cluster_speakers(embeddings, num_speakers=2, auto_detect=True, log_fn=logs.append)
        assert any("Auto-detectou" in m for m in logs)

    def test_num_speakers_maior_que_amostras(self):
        """Se num_speakers > amostras disponíveis, não deve quebrar."""
        from diarization import cluster_speakers
        embeddings = [np.array([1.0, 0.0]), np.array([0.0, 1.0])]
        resultado = cluster_speakers(embeddings, num_speakers=10, auto_detect=False)
        assert resultado is not None
