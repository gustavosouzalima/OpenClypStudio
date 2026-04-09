"""Carregamento do modelo Whisper e transcrição via faster-whisper."""

import warnings
import logging

warnings.filterwarnings("ignore")
logging.getLogger("faster_whisper").setLevel(logging.WARNING)

# --- Disponibilidade de libs ---
try:
    import torch
    CUDA_AVAILABLE = torch.cuda.is_available()
    if CUDA_AVAILABLE:
        print(f"[OK] GPU detectada: {torch.cuda.get_device_name(0)}")
    else:
        print("[INFO] GPU nao detectada, usando CPU.")
except ImportError:
    torch = None
    CUDA_AVAILABLE = False
    print("[AVISO] PyTorch nao encontrado.")

try:
    from faster_whisper import WhisperModel, BatchedInferencePipeline
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    FASTER_WHISPER_AVAILABLE = False
    print("⚠️ faster-whisper não instalado. Execute: pip install faster-whisper")

# Cache global de modelos
_model_cache: dict = {}
_batched_cache: dict = {}


def get_whisper_model(model_size: str, log_fn=None):
    """Retorna (WhisperModel, BatchedInferencePipeline) para o tamanho solicitado."""
    if model_size not in _model_cache:
        try:
            if log_fn:
                log_fn(f"Carregando faster-whisper: {model_size}...")
            device = "cuda" if CUDA_AVAILABLE else "cpu"
            compute_type = "float16" if CUDA_AVAILABLE else "int8"
            model = WhisperModel(model_size, device=device, compute_type=compute_type)
            _model_cache[model_size] = model
            _batched_cache[model_size] = BatchedInferencePipeline(model=model)
            if log_fn:
                log_fn(f"Modelo {model_size} carregado | device={device} | compute={compute_type}")
        except Exception as e:
            if log_fn:
                log_fn(f"Erro ao carregar modelo: {e}")
            return None, None
    return _model_cache[model_size], _batched_cache[model_size]
