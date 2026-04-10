"""Adaptive resource detection for transcription tuning.

Detects available CPU cores and free RAM, then computes safe concurrency
limits so the backend uses as much hardware as possible without OOM.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def _cpu_count() -> int:
    """Return usable CPU count (respects cgroup/container limits)."""
    try:
        return len(os.sched_getaffinity(0))
    except AttributeError:
        pass
    return os.cpu_count() or 2


def _total_ram_mb() -> int:
    """Return total system RAM in MB."""
    try:
        import psutil
        return int(psutil.virtual_memory().total / (1024 * 1024))
    except Exception:
        pass
    # Fallback: read from /proc on Linux
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    return int(line.split()[1]) // 1024
    except Exception:
        pass
    return 4096  # Conservative fallback


def _available_ram_mb() -> int:
    """Return available (free + cached) RAM in MB."""
    try:
        import psutil
        return int(psutil.virtual_memory().available / (1024 * 1024))
    except Exception:
        pass
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024
    except Exception:
        pass
    return 2048


def _process_rss_mb() -> int:
    """Return current process RSS in MB."""
    try:
        import psutil
        return int(psutil.Process().memory_info().rss / (1024 * 1024))
    except Exception:
        pass
    try:
        with open("/proc/self/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) // 1024
    except Exception:
        pass
    return 0


class ResourceSnapshot:
    """Immutable snapshot of current resource state."""

    __slots__ = ("cpu_count", "total_ram_mb", "available_ram_mb", "process_rss_mb")

    def __init__(self) -> None:
        self.cpu_count = _cpu_count()
        self.total_ram_mb = _total_ram_mb()
        self.available_ram_mb = _available_ram_mb()
        self.process_rss_mb = _process_rss_mb()

    def __repr__(self) -> str:
        return (
            f"Resources(cpus={self.cpu_count}, "
            f"ram_total={self.total_ram_mb}MB, "
            f"ram_avail={self.available_ram_mb}MB, "
            f"rss={self.process_rss_mb}MB)"
        )


# With cpu_threads=1 per worker, each worker uses ~150-250 MB for audio
# buffers, VAD model instance, and CTranslate2 working memory.
_RAM_PER_WORKER_MB = int(os.getenv("PIXEL_RAM_PER_WORKER_MB", "220"))

# Minimum free RAM to keep available (MB) so the system stays healthy.
_RAM_HEADROOM_MB = int(os.getenv("PIXEL_RAM_HEADROOM_MB", "1024"))

# Safety ceiling for chunk-level parallelism.
# 0 disables this ceiling (parallelism then limited by CPU/RAM/env cap only).
_HARD_MAX_PARALLEL_CHUNKS = int(os.getenv("PIXEL_HARD_MAX_PARALLEL_CHUNKS", "16"))


def compute_parallel_chunks() -> int:
    """Return how many chunks can be transcribed in parallel right now.

    Strategy: 1 worker per CPU core (each with cpu_threads=1), capped by
    available RAM.  This eliminates OpenMP thread contention and gives
    near-linear CPU scaling.
    """
    snap = ResourceSnapshot()
    logger.info("resource_tuner: %s", snap)

    # CPU-based limit: use ALL cores (workers have 1 thread each, no contention)
    cpu_limit = max(1, snap.cpu_count)

    # RAM-based limit
    free_for_workers = snap.available_ram_mb - _RAM_HEADROOM_MB
    if free_for_workers <= 0:
        ram_limit = 1
    else:
        ram_limit = max(1, int(free_for_workers / _RAM_PER_WORKER_MB))

    result = min(cpu_limit, ram_limit)

    # Env var override / cap
    env_max = int(os.getenv("PIXEL_MAX_PARALLEL_CHUNKS", "0"))
    if env_max > 0:
        result = min(result, env_max)

    if _HARD_MAX_PARALLEL_CHUNKS > 0:
        result = min(result, _HARD_MAX_PARALLEL_CHUNKS)

    logger.info(
        "resource_tuner: parallel_chunks=%d (cpu_limit=%d, ram_limit=%d, avail=%dMB, env_cap=%d, hard_cap=%d)",
        result,
        cpu_limit,
        ram_limit,
        snap.available_ram_mb,
        env_max,
        _HARD_MAX_PARALLEL_CHUNKS,
    )
    return result


def check_memory_pressure() -> bool:
    """Return True if the system is under memory pressure."""
    avail = _available_ram_mb()
    return avail < _RAM_HEADROOM_MB
