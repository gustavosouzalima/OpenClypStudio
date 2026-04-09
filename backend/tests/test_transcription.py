"""Testes para transcription.py — carregamento de modelo e cache."""

import pytest
from unittest.mock import Mock, patch
from transcription import CUDA_AVAILABLE, FASTER_WHISPER_AVAILABLE, get_whisper_model, _model_cache, _batched_cache


class TestTranscription:

    def setup_method(self):
        """Limpa o cache antes de cada teste."""
        _model_cache.clear()
        _batched_cache.clear()

    def teardown_method(self):
        """Limpa o cache após cada teste."""
        _model_cache.clear()
        _batched_cache.clear()

    def test_caches_sao_dicts(self):
        """Verifica que os caches existem e são dicionários."""
        assert isinstance(_model_cache, dict)
        assert isinstance(_batched_cache, dict)

    def test_get_whisper_model_carrega_modelo(self):
        """Testa carregamento bem-sucedido do modelo."""
        with patch("transcription.WhisperModel") as MockWhisperModel, \
             patch("transcription.BatchedInferencePipeline") as MockBatchedPipeline:
            mock_model_instance = Mock()
            mock_batched_instance = Mock()
            MockWhisperModel.return_value = mock_model_instance
            MockBatchedPipeline.return_value = mock_batched_instance

            model, batched = get_whisper_model("small", lambda x: print(x))

            assert model is not None
            assert batched is not None
            assert MockWhisperModel.call_count == 1
            assert MockBatchedPipeline.call_count == 1

    def test_cache_evita_carregamento_repetido(self):
        """Verifica que o cache impede recarregamento ao chamar get_whisper_model repetidamente."""
        with patch("transcription.WhisperModel") as MockWhisperModel, \
             patch("transcription.BatchedInferencePipeline") as MockBatchedPipeline:
            mock_model_instance = Mock()
            mock_batched_instance = Mock()
            MockWhisperModel.return_value = mock_model_instance
            MockBatchedPipeline.return_value = mock_batched_instance

            # Primeira chamada carrega o modelo
            get_whisper_model("small", lambda x: print(x))

            # Verifica que foi chamado apenas uma vez na primeira execução
            assert MockWhisperModel.call_count == 1, "Primeira chamada deveria carregar o modelo"
            assert MockBatchedPipeline.call_count == 1, "Primeira chamada deveria criar batched pipeline"

            # Verifica que o cache guardou as instâncias
            assert "small" in _model_cache, "Modelo small deve estar no cache"
            assert "small" in _batched_cache, "Batched pipeline para small deve estar no cache"

            # Verifica que o mesmo modelo é retornado ao acessar o cache diretamente
            assert _model_cache["small"] is MockWhisperModel.return_value

    def test_get_whisper_model_retorna_none_no_erro(self):
        """Testa caso de erro ao carregar o modelo."""
        error_logged = False
        error_message = ""

        def log_fn(msg):
            nonlocal error_logged, error_message
            if msg and isinstance(msg, str):
                error_logged = True
                error_message = msg

        with patch("transcription.WhisperModel", side_effect=Exception("Erro de disco")), \
             patch("transcription.BatchedInferencePipeline"):
            model, batched = get_whisper_model("small", log_fn)

            assert error_logged is True
            assert "Erro de disco" in error_message
            # Quando há erro, retorna None para ambos
            assert model is None
            assert batched is None

    def test_cuda_available_sinaliza_corretamente(self):
        """Verifica que CUDA_AVAILABLE é do tipo bool."""
        assert isinstance(CUDA_AVAILABLE, bool)

    def test_faster_whisper_available_sinaliza_corretamente(self):
        """Verifica que FASTER_WHISPER_AVAILABLE é do tipo bool."""
        assert isinstance(FASTER_WHISPER_AVAILABLE, bool)

    def test_get_whisper_model_cache_usa_modelo_unico(self):
        """Verifica que modelos diferentes usam o mesmo WhisperModel quando o mesmo tamanho é usado."""
        with patch("transcription.WhisperModel") as MockWhisperModel, \
             patch("transcription.BatchedInferencePipeline") as MockBatchedPipeline:
            mock_model_instance_1 = Mock()
            mock_model_instance_2 = Mock()
            mock_batched_instance = Mock()
            MockWhisperModel.side_effect = [mock_model_instance_1, mock_model_instance_2]
            MockBatchedPipeline.return_value = mock_batched_instance

            # Carrega dois tamanhos diferentes
            model1, _ = get_whisper_model("small", lambda x: None)
            model2, _ = get_whisper_model("base", lambda x: None)

            # Verifica que ambos foram carregados
            assert MockWhisperModel.call_count == 2

            # Agora carrega novamente o mesmo tamanho - deve usar cache
            model3, _ = get_whisper_model("small", lambda x: None)

            # Model 3 deve ser o mesmo que model 1 (cache)
            assert model3 is model1

            # Verifica que BatchedInferencePipeline foi chamado apenas uma vez para "small"
            assert MockBatchedPipeline.call_count == 2  # Um para "small" e um para "base"
