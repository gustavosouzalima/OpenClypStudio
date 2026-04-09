"""Testes unitarios para ai_providers.py — provedores de IA."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

import ai_providers


def _mock_response(status_code: int, body: dict | str) -> MagicMock:
    r = MagicMock()
    r.status_code = status_code
    if isinstance(body, dict):
        r.json.return_value = body
        r.text = json.dumps(body)
    else:
        r.text = body
        r.json.return_value = {}
    return r


def _gemini_ok(text: str = "Resposta OK") -> dict:
    return {
        "candidates": [
            {
                "content": {"parts": [{"text": text}]},
                "finishReason": "STOP",
            }
        ]
    }


# ── Gemini — list_models ──────────────────────────────────────────────────────

class TestGeminiListModels:

    @pytest.mark.asyncio
    async def test_retorna_modelos_gemini_atuais(self):
        models = await ai_providers.list_models("gemini", {})
        assert "gemini-2.5-flash-lite" in models
        assert "gemini-2.5-flash" in models
        assert "gemini-1.5-flash" in models

    @pytest.mark.asyncio
    async def test_gemini_2_5_flash_lite_na_lista(self):
        models = await ai_providers.list_models("gemini", {})
        assert "gemini-2.5-flash-lite" in models


# ── Gemini — is_connected ─────────────────────────────────────────────────────

class TestGeminiIsConnected:

    @pytest.mark.asyncio
    async def test_conectado_quando_tem_api_key(self):
        result = await ai_providers.is_connected("gemini", {"api_key": "AIza-test"})
        assert result is True

    @pytest.mark.asyncio
    async def test_desconectado_sem_api_key(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GEMINI_API_KEY", None)
            result = await ai_providers.is_connected("gemini", {})
        assert result is False

    @pytest.mark.asyncio
    async def test_desconectado_com_api_key_vazia(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GEMINI_API_KEY", None)
            result = await ai_providers.is_connected("gemini", {"api_key": ""})
        assert result is False


# ── Gemini — _gemini_generate ─────────────────────────────────────────────────

class TestGeminiGenerate:

    @pytest.mark.asyncio
    async def test_sem_api_key_levanta_runtime_error(self):
        with pytest.raises(RuntimeError, match="API Key"):
            await ai_providers._gemini_generate("texto", "system", "gemini-2.5-flash-lite", "")

    @pytest.mark.asyncio
    async def test_sucesso_retorna_texto(self):
        mock_resp = _mock_response(200, _gemini_ok("Roteiro gerado com sucesso"))
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client
            result = await ai_providers._gemini_generate(
                "texto", "system prompt", "gemini-2.5-flash-lite", "AIza-test"
            )
        assert result == "Roteiro gerado com sucesso"

    @pytest.mark.asyncio
    async def test_status_nao_200_levanta_runtime_error(self):
        mock_resp = _mock_response(400, {"error": {"message": "API key not valid"}})
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client
            with pytest.raises(RuntimeError, match="Erro Gemini \\(400\\)"):
                await ai_providers._gemini_generate(
                    "texto", "system", "gemini-2.5-flash-lite", "chave-invalida"
                )

    @pytest.mark.asyncio
    async def test_conteudo_bloqueado_por_safety_levanta_erro(self):
        body = {"promptFeedback": {"blockReason": "SAFETY"}, "candidates": []}
        mock_resp = _mock_response(200, body)
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client
            with pytest.raises(RuntimeError, match="bloqueado"):
                await ai_providers._gemini_generate(
                    "texto", "system", "gemini-2.5-flash-lite", "AIza-test"
                )

    @pytest.mark.asyncio
    async def test_finish_reason_safety_levanta_erro(self):
        body = {
            "candidates": [
                {"content": {"parts": [{"text": ""}]}, "finishReason": "SAFETY"}
            ]
        }
        mock_resp = _mock_response(200, body)
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client
            with pytest.raises(RuntimeError, match="SAFETY"):
                await ai_providers._gemini_generate(
                    "texto", "system", "gemini-2.5-flash-lite", "AIza-test"
                )

    @pytest.mark.asyncio
    async def test_sem_candidates_levanta_erro(self):
        body = {"candidates": []}
        mock_resp = _mock_response(200, body)
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client
            with pytest.raises(RuntimeError, match="sem candidatos"):
                await ai_providers._gemini_generate(
                    "texto", "system", "gemini-2.5-flash-lite", "AIza-test"
                )

    @pytest.mark.asyncio
    async def test_payload_usa_system_instruction(self):
        """Verifica que o payload envia system_instruction como campo separado."""
        mock_resp = _mock_response(200, _gemini_ok("ok"))
        captured = {}
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)

            async def capture_post(url, **kwargs):
                captured["payload"] = kwargs.get("json", {})
                return mock_resp

            mock_client.post = capture_post
            mock_client_cls.return_value = mock_client
            await ai_providers._gemini_generate(
                "conteudo do usuario", "instrucao de sistema", "gemini-2.5-flash-lite", "AIza-test"
            )

        assert "system_instruction" in captured["payload"]
        parts = captured["payload"]["system_instruction"]["parts"]
        assert parts[0]["text"] == "instrucao de sistema"

    @pytest.mark.asyncio
    async def test_payload_conteudo_usuario_separado_de_system(self):
        """Verifica que o conteudo do usuario NAO esta misturado com o system prompt."""
        mock_resp = _mock_response(200, _gemini_ok("ok"))
        captured = {}
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)

            async def capture_post(url, **kwargs):
                captured["payload"] = kwargs.get("json", {})
                return mock_resp

            mock_client.post = capture_post
            mock_client_cls.return_value = mock_client
            await ai_providers._gemini_generate(
                "transcricao dos videos", "voce e um editor", "gemini-2.5-flash-lite", "AIza-test"
            )

        contents = captured["payload"]["contents"]
        user_text = contents[0]["parts"][0]["text"]
        # O texto do usuario deve ser apenas a transcricao, nao misturado com system
        assert "transcricao dos videos" in user_text
        assert "voce e um editor" not in user_text

    @pytest.mark.asyncio
    async def test_max_tokens_passado_para_generation_config(self):
        mock_resp = _mock_response(200, _gemini_ok("ok"))
        captured = {}
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)

            async def capture_post(url, **kwargs):
                captured["payload"] = kwargs.get("json", {})
                return mock_resp

            mock_client.post = capture_post
            mock_client_cls.return_value = mock_client
            await ai_providers._gemini_generate(
                "texto", "system", "gemini-2.5-flash-lite", "AIza-test", max_tokens=2048
            )

        config = captured["payload"]["generationConfig"]
        assert config["maxOutputTokens"] == 2048

    @pytest.mark.asyncio
    async def test_finish_reason_stop_retorna_texto_normalmente(self):
        body = {
            "candidates": [
                {"content": {"parts": [{"text": "Resposta completa"}]}, "finishReason": "STOP"}
            ]
        }
        mock_resp = _mock_response(200, body)
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client
            result = await ai_providers._gemini_generate(
                "texto", "system", "gemini-2.5-flash-lite", "AIza-test"
            )
        assert result == "Resposta completa"

    @pytest.mark.asyncio
    async def test_finish_reason_max_tokens_retorna_texto(self):
        """MAX_TOKENS nao e erro — retorna o texto parcial gerado."""
        body = {
            "candidates": [
                {"content": {"parts": [{"text": "Texto truncado..."}]}, "finishReason": "MAX_TOKENS"}
            ]
        }
        mock_resp = _mock_response(200, body)
        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client
            result = await ai_providers._gemini_generate(
                "texto", "system", "gemini-2.5-flash-lite", "AIza-test"
            )
        assert result == "Texto truncado..."
