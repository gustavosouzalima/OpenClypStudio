"""Persistent job store backed by SQLite.

Jobs survive backend restarts so the frontend never gets a 404 for a
recently-active job.  The in-memory dict ``_cache`` keeps hot jobs for
fast reads; SQLite is the source of truth.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DB_PATH: Path | None = None
_cache: dict[str, dict] = {}
_lock = threading.Lock()

# How many seconds to keep finished jobs in the DB before pruning.
_RETENTION_SECONDS = 60 * 60 * 24  # 24 h


def _connect() -> sqlite3.Connection:
    assert _DB_PATH is not None, "job_store.init() not called"
    conn = sqlite3.connect(str(_DB_PATH), timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init(data_dir: Path) -> None:
    """Create / open the jobs database inside *data_dir*."""
    global _DB_PATH
    data_dir.mkdir(parents=True, exist_ok=True)
    _DB_PATH = data_dir / "jobs.db"

    conn = _connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            job_id     TEXT PRIMARY KEY,
            status     TEXT NOT NULL DEFAULT 'pending',
            progress   INTEGER NOT NULL DEFAULT 0,
            logs       TEXT NOT NULL DEFAULT '[]',
            result     TEXT,
            error      TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )
    """)
    conn.commit()

    # Prune very old finished jobs on startup.
    cutoff = time.time() - _RETENTION_SECONDS
    conn.execute(
        "DELETE FROM jobs WHERE status IN ('done','error') AND updated_at < ?",
        (cutoff,),
    )
    conn.commit()

    # Warm the cache with recent jobs (last 24 h).
    rows = conn.execute(
        "SELECT job_id, status, progress, logs, result, error FROM jobs WHERE updated_at >= ?",
        (cutoff,),
    ).fetchall()
    with _lock:
        for row in rows:
            _cache[row[0]] = {
                "status": row[1],
                "progress": row[2],
                "logs": json.loads(row[3]) if row[3] else [],
                "result": json.loads(row[4]) if row[4] else None,
                "error": row[5],
            }
    conn.close()

    # Mark jobs that were running when the backend died as "error".
    _recover_interrupted()
    logger.info("job_store: loaded %d recent jobs from %s", len(_cache), _DB_PATH)


def _recover_interrupted() -> None:
    """Mark pending jobs from a previous run as failed."""
    conn = _connect()
    now = time.time()
    conn.execute(
        "UPDATE jobs SET status='error', error='Backend restarted during execution', updated_at=? "
        "WHERE status='pending'",
        (now,),
    )
    conn.commit()
    conn.close()
    with _lock:
        for job in _cache.values():
            if job["status"] == "pending":
                job["status"] = "error"
                job["error"] = "Backend restarted during execution"


# ── Public API ──────────────────────────────────────────────────────────────


def new_job() -> str:
    """Create a new job and return its id."""
    job_id = str(uuid.uuid4())
    now = time.time()
    job: dict[str, Any] = {
        "status": "pending",
        "progress": 0,
        "logs": [],
        "result": None,
        "error": None,
    }
    with _lock:
        _cache[job_id] = job

    conn = _connect()
    conn.execute(
        "INSERT INTO jobs (job_id, status, progress, logs, result, error, created_at, updated_at) "
        "VALUES (?, 'pending', 0, '[]', NULL, NULL, ?, ?)",
        (job_id, now, now),
    )
    conn.commit()
    conn.close()
    return job_id


def get(job_id: str) -> dict | None:
    """Return the job dict or None."""
    with _lock:
        return _cache.get(job_id)


def update(job_id: str, **fields: Any) -> None:
    """Update one or more fields on a job and persist to SQLite."""
    with _lock:
        job = _cache.get(job_id)
        if job is None:
            return
        job.update(fields)

    _persist(job_id)


def append_log(job_id: str, msg: str) -> None:
    """Append a log line (in-memory only — flushed on next persist)."""
    with _lock:
        job = _cache.get(job_id)
        if job is not None:
            job["logs"].append(msg)


def set_progress(job_id: str, pct: int) -> None:
    """Update progress percentage (in-memory only — flushed on next persist)."""
    with _lock:
        job = _cache.get(job_id)
        if job is not None:
            job["progress"] = pct


def finish(job_id: str, *, status: str, result: Any = None, error: str | None = None) -> None:
    """Mark a job as done or error and persist immediately."""
    with _lock:
        job = _cache.get(job_id)
        if job is None:
            return
        job["status"] = status
        job["progress"] = 100 if status == "done" else job["progress"]
        if result is not None:
            job["result"] = result
        if error is not None:
            job["error"] = error
    _persist(job_id)


def is_cancelled(job_id: str) -> bool:
    with _lock:
        job = _cache.get(job_id)
        return bool(job and job.get("cancelled"))


def cancel(job_id: str) -> bool:
    with _lock:
        job = _cache.get(job_id)
        if job is None:
            return False
        job["cancelled"] = True
    return True


def flush_logs(job_id: str) -> None:
    """Persist current logs/progress to SQLite (call periodically in long jobs)."""
    _persist(job_id)


# ── Internal ────────────────────────────────────────────────────────────────


def _persist(job_id: str) -> None:
    with _lock:
        job = _cache.get(job_id)
        if job is None:
            return
        snapshot = {
            "status": job["status"],
            "progress": job["progress"],
            "logs": list(job["logs"]),
            "result": job.get("result"),
            "error": job.get("error"),
        }

    now = time.time()
    try:
        conn = _connect()
        conn.execute(
            "UPDATE jobs SET status=?, progress=?, logs=?, result=?, error=?, updated_at=? WHERE job_id=?",
            (
                snapshot["status"],
                snapshot["progress"],
                json.dumps(snapshot["logs"], ensure_ascii=False),
                json.dumps(snapshot["result"], ensure_ascii=False) if snapshot["result"] is not None else None,
                snapshot["error"],
                now,
                job_id,
            ),
        )
        conn.commit()
        conn.close()
    except Exception:
        logger.exception("job_store: failed to persist job %s", job_id)
