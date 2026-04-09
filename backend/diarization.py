"""Diarização de falantes via Resemblyzer + scikit-learn."""

import numpy as np

try:
    from resemblyzer import VoiceEncoder, preprocess_wav
    RESEMBLYZER_AVAILABLE = True
except ImportError:
    RESEMBLYZER_AVAILABLE = False
    print("⚠️ resemblyzer não instalado. Execute: pip install resemblyzer")

try:
    from sklearn.cluster import AgglomerativeClustering
    from sklearn.metrics import silhouette_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("⚠️ scikit-learn não instalado. Execute: pip install scikit-learn")

try:
    from transcription import CUDA_AVAILABLE
except ImportError:
    CUDA_AVAILABLE = False

# Cache global do encoder
_voice_encoder = None


def get_voice_encoder(log_fn=None):
    global _voice_encoder
    if not RESEMBLYZER_AVAILABLE:
        return None
    if _voice_encoder is None:
        try:
            if log_fn:
                log_fn("🔄 Carregando Resemblyzer (~17MB, apenas na 1ª vez)...")
            device = "cuda" if CUDA_AVAILABLE else "cpu"
            _voice_encoder = VoiceEncoder(device=device)
            if log_fn:
                log_fn("✅ Resemblyzer carregado localmente")
        except Exception as e:
            if log_fn:
                log_fn(f"❌ Erro ao carregar Resemblyzer: {e}")
            return None
    return _voice_encoder


def extract_embeddings(audio_path: str, segments, log_fn=None):
    encoder = get_voice_encoder(log_fn)
    if encoder is None:
        return None
    try:
        wav = preprocess_wav(audio_path)
        sr = 16000
        embeddings = []
        for seg in segments:
            start = int(seg.start * sr)
            end = int(seg.end * sr)
            chunk = wav[start:end]
            if len(chunk) < 1600:  # < 0.1s — muito curto
                embeddings.append(None)
                continue
            emb = encoder.embed_utterance(chunk)
            embeddings.append(emb)
        return embeddings
    except Exception as e:
        if log_fn:
            log_fn(f"❌ Erro ao extrair embeddings: {e}")
        return None


def cluster_speakers(embeddings, num_speakers: int, auto_detect: bool, log_fn=None) -> dict:
    if not SKLEARN_AVAILABLE:
        if log_fn:
            log_fn("❌ scikit-learn não instalado. Execute: pip install scikit-learn")
        return None

    valid_idx = [i for i, e in enumerate(embeddings) if e is not None]
    if len(valid_idx) < 2:
        return {i: 0 for i in range(len(embeddings))}

    X = np.array([embeddings[i] for i in valid_idx])
    X = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-8)

    if auto_detect:
        best_score, best_k = -1, 2
        for k in range(2, min(7, len(valid_idx))):
            try:
                labels = AgglomerativeClustering(n_clusters=k, metric='cosine',
                                                  linkage='average').fit_predict(X)
                score = silhouette_score(X, labels, metric='cosine')
                if score > best_score:
                    best_score, best_k = score, k
            except Exception:
                pass
        num_speakers = best_k
        if log_fn:
            log_fn(f"  🔍 Auto-detectou {num_speakers} falante(s) (score={best_score:.2f})")

    n = min(num_speakers, len(valid_idx))
    labels = AgglomerativeClustering(n_clusters=n, metric='cosine',
                                      linkage='average').fit_predict(X)

    result = {}
    ptr = 0
    for i in range(len(embeddings)):
        if i in valid_idx:
            result[i] = int(labels[ptr])
            ptr += 1
        else:
            result[i] = result.get(i - 1, 0)
    return result
