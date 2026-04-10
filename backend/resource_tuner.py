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


# Approximate RAM usage per concurrent transcription worker (MB).
# Includes VAD model, audio buffer, and CTranslate2 working memory.
_RAM_PER_WORKER_MB = 400

# Minimum free RAM to keep available (MB) so the system stays healthy.
_RAM_HEADROOM_MB = int(os.getenv("PIXEL_RAM_HEADROOM_MB", "1500"))


def compute_parallel_chunks(model_rss_mb: int = 0) -> int:
    """Return how many chunks can be transcribed in parallel right now.

    Takes into account:
    - Available CPU cores
    - Available RAM minus a safety headroom
    - Estimated RAM cost per parallel worker
    """
    snap = ResourceSnapshot()
    logger.info("resource_tuner: %s", snap)

    # CPU-based limit: leave 1 core for the system / event-loop
    cpu_limit = max(1, snap.cpu_count - 1)

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

    # Sanity: never more than 8 (diminishing returns + I/O contention)
    result = min(result, 8)

    logger.info(
        "resource_tuner: parallel_chunks=%d (cpu_limit=%d, ram_limit=%d, avail=%dMB)",
        result, cpu_limit, ram_limit, snap.available_ram_mb,
    )
    return result


def check_memory_pressure() -> bool:
    """Return True if the system is under memory pressure."""
    avail = _available_ram_mb()
    return avail < _RAM_HEADROOM_MB
