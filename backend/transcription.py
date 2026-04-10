"""Carregamento do modelo Whisper e transcrição via faster-whisper.

Threading strategy for CPU inference
-------------------------------------
When chunks are transcribed in parallel (ThreadPoolExecutor), each
worker issues its own ``batched.transcribe()`` call.  CTranslate2 uses
OpenMP internally, so if ``cpu_threads=N`` each call spawns N OpenMP
threads.  With W parallel workers that means W×N OS threads competing
for the physical cores — heavy contention and poor utilisation.

The optimal setup is **1 OpenMP thread per worker, W workers = W cores
fully busy with zero contention**.  ``resource_tuner`` decides W at
transcription time; here we just make sure the model is created with
``cpu_threads=1`` (overridable) and ``num_workers=W`` so CTranslate2's
internal pool can handle W concurrent requests.
"""

import os
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

# Force OpenMP / MKL to 1 thread per call so parallel workers don't contend.
# These must be set BEFORE any CTranslate2 / numpy import triggers OpenMP init.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

# Cache global de modelos
_model_cache: dict = {}
_batched_cache: dict = {}

# 1 thread per CTranslate2 call — parallelism comes from multiple workers.
_CPU_THREADS = int(os.getenv("PIXEL_CPU_THREADS", "1"))
# CTranslate2 internal worker pool size — must be >= parallel chunk workers.
_NUM_WORKERS = int(os.getenv("PIXEL_NUM_WORKERS", "0")) or 1


def get_whisper_model(model_size: str, log_fn=None):
    """Retorna (WhisperModel, BatchedInferencePipeline) para o tamanho solicitado."""
    if model_size not in _model_cache:
        try:
            if log_fn:
                log_fn(f"Carregando faster-whisper: {model_size}...")
            device = "cuda" if CUDA_AVAILABLE else "cpu"
            compute_type = "float16" if CUDA_AVAILABLE else "int8"
            cpu_threads = _CPU_THREADS if device == "cpu" else 0
            model = WhisperModel(
                model_size,
                device=device,
                compute_type=compute_type,
                cpu_threads=cpu_threads,
                num_workers=_NUM_WORKERS,
            )
            _model_cache[model_size] = model
            _batched_cache[model_size] = BatchedInferencePipeline(model=model)
            if log_fn:
                log_fn(
                    f"Modelo {model_size} carregado | device={device} | "
                    f"compute={compute_type} | cpu_threads={cpu_threads} | "
                    f"ct2_workers={_NUM_WORKERS}"
                )
        except Exception as e:
            if log_fn:
                log_fn(f"Erro ao carregar modelo: {e}")
            return None, None
    return _model_cache[model_size], _batched_cache[model_size]
