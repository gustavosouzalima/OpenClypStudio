"""Histórico de transcrições em SQLite."""

import sqlite3
import os
import uuid
from datetime import datetime


def _default_data_dir() -> str:
    env_dir = os.getenv("PIXEL_DATA_DIR")
    if env_dir:
        return env_dir
    return os.path.join(os.path.expanduser("~"), ".transcritor")


def _resolve_default_db_path() -> str:
    preferred_dir = _default_data_dir()
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(backend_dir)
    try:
        os.makedirs(preferred_dir, exist_ok=True)
        probe = os.path.join(preferred_dir, ".write_probe")
        with open(probe, "w", encoding="utf-8") as f:
            f.write("ok")
        os.remove(probe)
        return os.path.join(preferred_dir, "history.db")
    except OSError:
        fallback_candidates = [
            os.path.join(repo_root, ".pixeltranscritor"),
            os.path.join(backend_dir, ".pixeltranscritor"),
            os.path.join(os.path.expanduser("~"), ".transcritor"),
        ]
        for fallback_dir in fallback_candidates:
            try:
                os.makedirs(fallback_dir, exist_ok=True)
                return os.path.join(fallback_dir, "history.db")
            except OSError:
                continue
        raise RuntimeError("Nao foi possivel determinar caminho gravavel para history.db")


DB_PATH = _resolve_default_db_path()


def _get_conn(db_path: str = DB_PATH) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str = DB_PATH) -> None:
    """Cria as tabelas se não existirem."""
    with _get_conn(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transcriptions (
                id          TEXT PRIMARY KEY,
                filename    TEXT NOT NULL,
                filepath    TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                size_bytes  INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.commit()


def save(filepath: str, db_path: str = DB_PATH) -> str:
    """Registra uma transcrição no histórico. Retorna o id gerado."""
    record_id = str(uuid.uuid4())
    size = os.path.getsize(filepath) if os.path.exists(filepath) else 0
    with _get_conn(db_path) as conn:
        conn.execute(
            "INSERT INTO transcriptions (id, filename, filepath, created_at, size_bytes) "
            "VALUES (?, ?, ?, ?, ?)",
            (record_id, os.path.basename(filepath), filepath,
             datetime.now().isoformat(timespec="microseconds"), size),
        )
        conn.commit()
    return record_id


def list_all(db_path: str = DB_PATH) -> list[dict]:
    """Retorna todas as transcrições ordenadas pela mais recente."""
    with _get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM transcriptions ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def get(record_id: str, db_path: str = DB_PATH) -> dict | None:
    """Retorna metadados + conteúdo de uma transcrição."""
    with _get_conn(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM transcriptions WHERE id = ?", (record_id,)
        ).fetchone()
    if row is None:
        return None
    data = dict(row)
    try:
        with open(data["filepath"], encoding="utf-8") as f:
            data["content"] = f.read()
    except OSError:
        data["content"] = ""
    return data


def delete(record_id: str, db_path: str = DB_PATH) -> None:
    """Remove uma transcrição do histórico (não deleta o arquivo)."""
    with _get_conn(db_path) as conn:
        conn.execute("DELETE FROM transcriptions WHERE id = ?", (record_id,))
        conn.commit()


def delete_many(record_ids: list[str], db_path: str = DB_PATH) -> int:
    """Remove várias transcrições do histórico. Retorna quantidade afetada."""
    if not record_ids:
        return 0
    with _get_conn(db_path) as conn:
        cursor = conn.executemany(
            "DELETE FROM transcriptions WHERE id = ?",
            [(record_id,) for record_id in record_ids],
        )
        conn.commit()
        return cursor.rowcount if cursor.rowcount is not None else 0


# Inicializa DB ao importar
init_db()
