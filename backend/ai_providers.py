"""Clientes unificados para provedores de IA (LM Studio, Ollama, Zai)."""

import logging
import os
import httpx
import app_settings

logger = logging.getLogger(__name__)

_TIMEOUT_DETECT = 3.0
_TIMEOUT_PROCESS = 600.0  # Timeout para APIs cloud (Zai)
_TIMEOUT_LOCAL = httpx.Timeout(connect=10.0, read=None, write=None, pool=None)  # Sem limite de leitura para modelos locais/LAN


def _resolve_cloud_api_key(provider: str, config: dict) -> str:
    api_key = (config.get("api_key") or "").strip()
    if api_key:
        return api_key
    if provider == "gemini":
        return os.getenv("GEMINI_API_KEY", "").strip() or str(
            app_settings.get_setting("gemini_api_key", "") or ""
        ).strip()
    if provider == "openai":
        return os.getenv("OPENAI_API_KEY", "").strip() or str(
            app_settings.get_setting("openai_api_key", "") or ""
        ).strip()
    return ""


def _resolve_cloud_model(provider: str, model: str) -> str:
    model = (model or "").strip()
    if model:
        return model
    if provider == "gemini":
        return os.getenv("GEMINI_MODEL", "").strip() or "gemini-2.5-flash-lite"
    if provider == "openai":
        return os.getenv("OPENAI_MODEL", "").strip() or "gpt-4o-mini"
    return model


async def is_connected(provider: str, config: dict) -> bool:
    """Verifica se o provedor está acessível."""
    if provider == "lm_studio":
        return await _lm_studio_connected(config.get("base_url", "http://localhost:1234/v1"))
    elif provider == "ollama":
        return await _ollama_connected(config.get("base_url", "http://localhost:11434"))
    elif provider in ("openai", "gemini"):
        # Para cloud, se tiver chave, consideramos "conectado" para o UI
        return bool(_resolve_cloud_api_key(provider, config))
    elif provider == "zai":
        return await _zai_connected(config.get("base_url", ""))
    return False


async def list_models(provider: str, config: dict) -> list[str]:
    """Retorna lista de modelos disponíveis no provedor."""
    try:
        if provider == "lm_studio":
            return await _lm_studio_models(config.get("base_url", "http://localhost:1234/v1"))
        elif provider == "ollama":
            return await _ollama_models(config.get("base_url", "http://localhost:11434"))
        elif provider == "openai":
            return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]
        elif provider == "gemini":
            return [
                "gemini-2.5-flash-lite",
                "gemini-2.5-flash",
                "gemini-2.5-pro",
                "gemini-2.0-flash",
                "gemini-1.5-flash",
                "gemini-1.5-pro",
            ]
        elif provider == "zai":
            return await _zai_models(config.get("base_url", ""), config.get("api_key", ""))
    except Exception as e:
        logger.warning("Erro ao listar modelos (%s): %s", provider, e)
    return []


async def generate(text: str, system_prompt: str, model: str, provider: str, config: dict, max_tokens: int | None = None) -> str:
    """Gera texto usando o provedor escolhido."""
    if provider == "lm_studio":
        return await _lm_studio_generate(text, system_prompt, model, config.get("base_url", "http://localhost:1234/v1"), max_tokens)
    elif provider == "ollama":
        return await _ollama_generate(text, system_prompt, model, config.get("base_url", "http://localhost:11434"), max_tokens)
    elif provider == "openai":
        return await _openai_generate(
            text,
            system_prompt,
            _resolve_cloud_model("openai", model),
            _resolve_cloud_api_key("openai", config),
            max_tokens,
        )
    elif provider == "gemini":
        return await _gemini_generate(
            text,
            system_prompt,
            _resolve_cloud_model("gemini", model),
            _resolve_cloud_api_key("gemini", config),
            max_tokens,
        )
    elif provider == "zai":
        return await _zai_generate(text, system_prompt, model, config.get("base_url", ""), config.get("api_key", ""), max_tokens)
    raise ValueError(f"Provedor desconhecido: {provider}")


# ─────────────────────────────────────────────────────────────────────────────
# OpenAI Cloud
# ─────────────────────────────────────────────────────────────────────────────

async def _openai_generate(text: str, system_prompt: str, model: str, api_key: str, max_tokens: int | None = None) -> str:
    if not api_key:
        raise RuntimeError("API Key da OpenAI não configurada.")
    
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text}
        ],
        "temperature": 0.3,
        "max_tokens": max_tokens or 4096,
    }
    headers = {"Authorization": f"Bearer {api_key}"}
    
    async with httpx.AsyncClient(timeout=_TIMEOUT_PROCESS) as client:
        r = await client.post(url, json=payload, headers=headers)
        if r.status_code != 200:
            raise RuntimeError(f"Erro OpenAI ({r.status_code}): {r.text}")
        data = r.json()
        return data["choices"][0]["message"]["content"]


# ─────────────────────────────────────────────────────────────────────────────
# Gemini Cloud (Google AI)
# ─────────────────────────────────────────────────────────────────────────────

async def _gemini_generate(text: str, system_prompt: str, model: str, api_key: str, max_tokens: int | None = None) -> str:
    if not api_key:
        raise RuntimeError("API Key do Gemini não configurada.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "system_instruction": {
            "parts": [{"text": system_prompt}]
        },
        "contents": [
            {"role": "user", "parts": [{"text": text}]}
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": max_tokens or 8192,
        },
    }

    headers = {"x-goog-api-key": api_key}
    logger.info("[Gemini] Enviando requisição (model=%s)", model)
    async with httpx.AsyncClient(timeout=_TIMEOUT_PROCESS) as client:
        r = await client.post(url, json=payload, headers=headers)
        if r.status_code != 200:
            raise RuntimeError(f"Erro Gemini ({r.status_code}): {r.text[:400]}")
        data = r.json()

    # Conteúdo bloqueado por safety filters
    block_reason = data.get("promptFeedback", {}).get("blockReason")
    if block_reason:
        raise RuntimeError(f"Conteúdo bloqueado pelo Gemini: {block_reason}")

    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError(f"Gemini retornou resposta sem candidatos: {data}")

    finish_reason = candidates[0].get("finishReason", "STOP")
    if finish_reason in ("SAFETY", "RECITATION", "PROHIBITED_CONTENT"):
        raise RuntimeError(f"Gemini interrompeu a geração por: {finish_reason}")

    try:
        result = candidates[0]["content"]["parts"][0]["text"]
        logger.info("[Gemini] Resposta recebida: %d caracteres", len(result))
        return result
    except (KeyError, IndexError):
        raise RuntimeError(f"Resposta Gemini em formato inesperado: {data}")


# ─────────────────────────────────────────────────────────────────────────────
# LM Studio (OpenAI-compatible)
# ─────────────────────────────────────────────────────────────────────────────
async def _lm_studio_connected(base_url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_DETECT) as client:
            r = await client.get(f"{base_url}/models")
            return r.status_code == 200
    except Exception:
        return False


async def _lm_studio_models(base_url: str) -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_DETECT) as client:
            r = await client.get(f"{base_url}/models")
            r.raise_for_status()
            data = r.json()
            return [m["id"] for m in data.get("data", [])]
    except Exception:
        return []




async def _lm_studio_generate(text: str, system_prompt: str, model: str, base_url: str, max_tokens: int | None = None) -> str:
    full_prompt = f"{system_prompt}\n\n{text}"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": full_prompt}],
        "temperature": 0.3,
        "max_tokens": max_tokens or 8192,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_LOCAL) as client:
            r = await client.post(f"{base_url}/chat/completions", json=payload)
            r.raise_for_status()
            data = r.json()
            return _extract_openai_content(data)
    except httpx.ConnectError:
        raise RuntimeError("LM Studio não está rodando.")
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"Erro HTTP {e.response.status_code}: {e.response.text[:200]}")


# ─────────────────────────────────────────────────────────────────────────────
# Ollama (OpenAI-compatible)
# ─────────────────────────────────────────────────────────────────────────────

async def _ollama_connected(base_url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_DETECT) as client:
            # Ollama não tem /models, usa /api/tags
            r = await client.get(f"{base_url}/api/tags")
            return r.status_code == 200
    except Exception:
        return False


async def _ollama_models(base_url: str) -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_DETECT) as client:
            r = await client.get(f"{base_url}/api/tags")
            r.raise_for_status()
            data = r.json()
            return [m["name"] for m in data.get("models", [])]
    except Exception:
        return []


async def _ollama_generate(text: str, system_prompt: str, model: str, base_url: str, max_tokens: int | None = None) -> str:
    # Ollama API format
    payload = {
        "model": model,
        "prompt": f"{system_prompt}\n\n{text}",
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": max_tokens or 8192},
    }
    try:
        logger.info(f"[Ollama] Enviando requisição para {base_url}/api/generate (model={model})")
        async with httpx.AsyncClient(timeout=_TIMEOUT_LOCAL) as client:
            r = await client.post(f"{base_url}/api/generate", json=payload)
            r.raise_for_status()
            data = r.json()
            result = data.get("response", "")
            logger.info(f"[Ollama] Resposta recebida: {len(result)} caracteres")
            return result
    except httpx.ConnectError as e:
        logger.error(f"[Ollama] Erro de conexão: {e}")
        raise RuntimeError(f"Ollama não está rodando em {base_url}. Verifique se o Ollama está iniciado.")
    except httpx.ConnectTimeout:
        logger.error(f"[Ollama] Timeout de conexão - Ollama pode não estar rodando")
        raise RuntimeError(f"Timeout de conexão: Não foi possível conectar ao Ollama em {base_url}.")
    except httpx.HTTPStatusError as e:
        logger.error(f"[Ollama] Erro HTTP {e.response.status_code}: {e.response.text[:200]}")
        raise RuntimeError(f"Erro HTTP {e.response.status_code} da API Ollama: {e.response.text[:200]}")
    except Exception as e:
        logger.error(f"[Ollama] Erro inesperado: {e}")
        raise RuntimeError(f"Erro ao chamar Ollama: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Zai API (https://docs.z.ai/api-reference/introduction)
# ─────────────────────────────────────────────────────────────────────────────

async def _zai_connected(base_url: str) -> bool:
    if not base_url:
        return False
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_DETECT) as client:
            # Zai usa /models como OpenAI
            r = await client.get(f"{base_url}/models", headers={"Authorization": "Bearer dummy"})
            return r.status_code in (200, 401)  # 401 = reachable but invalid token
    except Exception:
        return False


async def _zai_models(base_url: str, api_key: str) -> list[str]:
    if not base_url or not api_key:
        return []
    try:
        headers = {"Authorization": f"Bearer {api_key}"}
        async with httpx.AsyncClient(timeout=_TIMEOUT_DETECT) as client:
            r = await client.get(f"{base_url}/models", headers=headers)
            if r.status_code == 200:
                data = r.json()
                return [m["id"] for m in data.get("data", [])]
    except Exception:
        pass
    # Fallback: modelos conhecidos do Zai
    return ["glm-4.5", "glm-4.5-air", "glm-4.5-flash", "glm-4.5v", "glm-4.6"]


async def _zai_generate(text: str, system_prompt: str, model: str, base_url: str, api_key: str, max_tokens: int | None = None) -> str:
    if not base_url or not api_key:
        raise RuntimeError("Configure a URL e API Key da Zai API nas Configurações.")
    full_prompt = f"{system_prompt}\n\n{text}"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": full_prompt}],
        "temperature": 0.3,
        "max_tokens": max_tokens or 8192,
        "stream": False,
    }
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        logger.info(f"[Zai] Enviando requisição para {base_url}/chat/completions (model={model})")
        async with httpx.AsyncClient(timeout=_TIMEOUT_PROCESS) as client:
            r = await client.post(f"{base_url}/chat/completions", json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()
            result = _extract_openai_content(data)
            logger.info(f"[Zai] Resposta recebida: {len(result)} caracteres")
            return result
    except httpx.ConnectError as e:
        logger.error(f"[Zai] Erro de conexão: {e}")
        raise RuntimeError(f"Não foi possível conectar à Zai API em {base_url}. Verifique a URL e sua conexão.")
    except httpx.HTTPStatusError as e:
        body = e.response.text[:300]
        logger.error(f"[Zai] Erro HTTP {e.response.status_code}: {body}")
        # Plano Lite pode ter limitações - tenta dar mensagem mais útil
        if e.response.status_code == 403:
            raise RuntimeError("Erro 403 (Forbidden): Seu plano Zai API pode não ter acesso a este endpoint. Verifique os planos disponíveis em docs.z.ai")
        if e.response.status_code == 401:
            raise RuntimeError("Erro 401 (Unauthorized): API Key inválida ou expirada. Verifique em docs.z.ai")
        raise RuntimeError(f"Erro HTTP {e.response.status_code}: {body}")
    except httpx.ReadTimeout:
        logger.error(f"[Zai] Timeout após {_TIMEOUT_PROCESS}s")
        raise RuntimeError(f"Timeout: A Zai API demorou muito para responder. Tente reduzir Max Tokens ou usar um modelo mais rápido.")
    except Exception as e:
        logger.error(f"[Zai] Erro inesperado: {e}")
        raise RuntimeError(f"Erro ao chamar Zai API: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Utilitários
# ─────────────────────────────────────────────────────────────────────────────

def _extract_openai_content(data: dict) -> str:
    """Extrai content de respostas OpenAI-compatíveis."""
    # Se a resposta contém um erro, retorna a mensagem de erro
    if "error" in data:
        err = data["error"]
        if isinstance(err, dict):
            msg = err.get("message") or err.get("detail") or str(err)
        else:
            msg = str(err)
        raise RuntimeError(f"Erro retornado pela API: {msg}")

    choices = data.get("choices")
    if choices and isinstance(choices, list) and choices:
        first = choices[0]
        msg = first.get("message") or first.get("delta") or {}
        if isinstance(msg, dict) and "content" in msg:
            return msg["content"] or ""
        if "text" in first:
            return first["text"]
    if "content" in data:
        return data["content"]
    for key in ("response", "output", "text", "result"):
        if key in data:
            return str(data[key])
    chaves = list(data.keys())
    raise RuntimeError(f"Formato de resposta desconhecido. Chaves: {chaves}")
