"""Gerenciamento de projetos de compilacao de video (SQLite)."""

import json
import os
import sqlite3
import uuid
from datetime import datetime


def _default_db_path() -> str:
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(backend_dir)
    candidates = [
        os.getenv("PIXEL_DATA_DIR", "").strip(),
        os.path.join(repo_root, ".pixeltranscritor"),
        os.path.join(backend_dir, ".pixeltranscritor"),
        os.path.join(os.path.expanduser("~"), ".transcritor"),
    ]
    for base in candidates:
        if not base:
            continue
        try:
            os.makedirs(base, exist_ok=True)
            probe = os.path.join(base, ".write_probe")
            with open(probe, "w", encoding="utf-8") as f:
                f.write("ok")
            os.remove(probe)
            return os.path.join(base, "projects.db")
        except OSError:
            continue
    raise RuntimeError("Nao foi possivel determinar um caminho gravavel para projects.db")


DB_PATH = _default_db_path()


def _get_conn(db_path: str = DB_PATH) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str = DB_PATH) -> None:
    """Cria as tabelas se nao existirem."""
    with _get_conn(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS compilation_projects (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                topic       TEXT DEFAULT '',
                status      TEXT DEFAULT 'draft',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL,
                config      TEXT DEFAULT '{}',
                script      TEXT,
                output_path TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS project_videos (
                id              TEXT PRIMARY KEY,
                project_id      TEXT NOT NULL,
                source_url      TEXT DEFAULT '',
                local_path      TEXT DEFAULT '',
                title           TEXT DEFAULT '',
                duration        REAL,
                thumbnail_path  TEXT,
                status          TEXT DEFAULT 'pending',
                transcription   TEXT,
                order_idx       INTEGER DEFAULT 0,
                added_at        TEXT NOT NULL,
                error_msg       TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS channel_presets (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL,
                config      TEXT DEFAULT '{}'
            )
        """)
        conn.commit()


def create_project(
    name: str,
    topic: str = "",
    config: dict = None,
    db_path: str = DB_PATH,
) -> dict:
    """Cria um novo projeto. Retorna o projeto criado como dict."""
    project_id = str(uuid.uuid4())
    now = datetime.now().isoformat(timespec="microseconds")
    cfg = json.dumps(config or {})
    with _get_conn(db_path) as conn:
        conn.execute(
            "INSERT INTO compilation_projects (id, name, topic, status, created_at, updated_at, config) "
            "VALUES (?, ?, ?, 'draft', ?, ?, ?)",
            (project_id, name, topic, now, now, cfg),
        )
        conn.commit()
    return get_project(project_id, db_path)


def list_projects(db_path: str = DB_PATH) -> list[dict]:
    """Retorna todos os projetos ordenados pelo mais recente."""
    with _get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM compilation_projects ORDER BY created_at DESC"
        ).fetchall()
    return [_parse_project(dict(r)) for r in rows]


def get_project(project_id: str, db_path: str = DB_PATH) -> dict | None:
    """Retorna um projeto pelo ID ou None se nao encontrado."""
    with _get_conn(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM compilation_projects WHERE id = ?", (project_id,)
        ).fetchone()
    if row is None:
        return None
    return _parse_project(dict(row))


def update_project(project_id: str, db_path: str = DB_PATH, **fields) -> dict | None:
    """Atualiza campos de um projeto. Retorna o projeto atualizado ou None."""
    allowed = {"name", "topic", "status", "config", "script", "output_path"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_project(project_id, db_path)
    now = datetime.now().isoformat(timespec="microseconds")
    if "config" in updates and isinstance(updates["config"], dict):
        updates["config"] = json.dumps(updates["config"])
    if "script" in updates and not isinstance(updates["script"], str):
        updates["script"] = json.dumps(updates["script"])
    set_clause = ", ".join(f"{k} = ?" for k in updates) + ", updated_at = ?"
    values = list(updates.values()) + [now, project_id]
    with _get_conn(db_path) as conn:
        conn.execute(
            f"UPDATE compilation_projects SET {set_clause} WHERE id = ?", values
        )
        conn.commit()
    return get_project(project_id, db_path)


def delete_project(project_id: str, db_path: str = DB_PATH) -> None:
    """Remove o projeto e todos os seus videos."""
    with _get_conn(db_path) as conn:
        conn.execute("DELETE FROM project_videos WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM compilation_projects WHERE id = ?", (project_id,))
        conn.commit()


def add_video(
    project_id: str,
    source_url: str = "",
    local_path: str = "",
    title: str = "",
    db_path: str = DB_PATH,
) -> dict:
    """Adiciona um video ao projeto. Retorna o video criado."""
    video_id = str(uuid.uuid4())
    now = datetime.now().isoformat(timespec="microseconds")
    with _get_conn(db_path) as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM project_videos WHERE project_id = ?", (project_id,)
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO project_videos "
            "(id, project_id, source_url, local_path, title, order_idx, added_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                video_id,
                project_id,
                source_url,
                local_path,
                title or source_url or local_path,
                count,
                now,
            ),
        )
        conn.commit()
    return get_video(video_id, db_path)


def get_video(video_id: str, db_path: str = DB_PATH) -> dict | None:
    """Retorna um video pelo ID ou None."""
    with _get_conn(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM project_videos WHERE id = ?", (video_id,)
        ).fetchone()
    if row is None:
        return None
    return _parse_video(dict(row))


def list_project_videos(project_id: str, db_path: str = DB_PATH) -> list[dict]:
    """Retorna todos os videos de um projeto ordenados por order_idx."""
    with _get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM project_videos WHERE project_id = ? ORDER BY order_idx ASC",
            (project_id,),
        ).fetchall()
    return [_parse_video(dict(r)) for r in rows]


def update_video(video_id: str, db_path: str = DB_PATH, **fields) -> dict | None:
    """Atualiza campos de um video. Retorna o video atualizado ou None."""
    allowed = {
        "local_path", "title", "duration", "thumbnail_path",
        "status", "transcription", "order_idx", "error_msg",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_video(video_id, db_path)
    if "transcription" in updates and not isinstance(updates["transcription"], str):
        updates["transcription"] = json.dumps(updates["transcription"])
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [video_id]
    with _get_conn(db_path) as conn:
        conn.execute(
            f"UPDATE project_videos SET {set_clause} WHERE id = ?", values
        )
        conn.commit()
    return get_video(video_id, db_path)


def remove_video(video_id: str, db_path: str = DB_PATH) -> None:
    """Remove um video do projeto."""
    with _get_conn(db_path) as conn:
        conn.execute("DELETE FROM project_videos WHERE id = ?", (video_id,))
        conn.commit()


def create_channel_preset(name: str, config: dict | None = None, db_path: str = DB_PATH) -> dict:
    preset_id = str(uuid.uuid4())
    now = datetime.now().isoformat(timespec="microseconds")
    with _get_conn(db_path) as conn:
        conn.execute(
            "INSERT INTO channel_presets (id, name, created_at, updated_at, config) VALUES (?, ?, ?, ?, ?)",
            (preset_id, name, now, now, json.dumps(config or {})),
        )
        conn.commit()
    return get_channel_preset(preset_id, db_path)


def list_channel_presets(db_path: str = DB_PATH) -> list[dict]:
    with _get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM channel_presets ORDER BY updated_at DESC, created_at DESC"
        ).fetchall()
    return [_parse_channel_preset(dict(r)) for r in rows]


def get_channel_preset(preset_id: str, db_path: str = DB_PATH) -> dict | None:
    with _get_conn(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM channel_presets WHERE id = ?",
            (preset_id,),
        ).fetchone()
    if row is None:
        return None
    return _parse_channel_preset(dict(row))


def update_channel_preset(
    preset_id: str,
    db_path: str = DB_PATH,
    *,
    name: str | None = None,
    config: dict | None = None,
) -> dict | None:
    updates = {}
    if name is not None:
        updates["name"] = name
    if config is not None:
        updates["config"] = json.dumps(config)
    if not updates:
        return get_channel_preset(preset_id, db_path)
    now = datetime.now().isoformat(timespec="microseconds")
    set_clause = ", ".join(f"{k} = ?" for k in updates) + ", updated_at = ?"
    values = list(updates.values()) + [now, preset_id]
    with _get_conn(db_path) as conn:
        conn.execute(
            f"UPDATE channel_presets SET {set_clause} WHERE id = ?",
            values,
        )
        conn.commit()
    return get_channel_preset(preset_id, db_path)


def delete_channel_preset(preset_id: str, db_path: str = DB_PATH) -> None:
    with _get_conn(db_path) as conn:
        conn.execute("DELETE FROM channel_presets WHERE id = ?", (preset_id,))
        conn.commit()


def _parse_project(data: dict) -> dict:
    data["config"] = json.loads(data.get("config") or "{}")
    raw = data.get("script")
    data["script"] = json.loads(raw) if raw else None
    return data


def _parse_video(data: dict) -> dict:
    raw = data.get("transcription")
    data["transcription"] = json.loads(raw) if raw else None
    return data


def _parse_channel_preset(data: dict) -> dict:
    data["config"] = json.loads(data.get("config") or "{}")
    return data


# Inicializa DB ao importar
init_db()
