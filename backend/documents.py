"""Persistencia de projetos documentais e documentos gerados por IA."""

from __future__ import annotations

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
            return os.path.join(base, "documents.db")
        except OSError:
            continue
    raise RuntimeError("Nao foi possivel determinar um caminho gravavel para documents.db")


DB_PATH = _default_db_path()


def _get_conn(db_path: str = DB_PATH) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str = DB_PATH) -> None:
    with _get_conn(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS document_projects (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                description TEXT DEFAULT '',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS generated_documents (
                id                  TEXT PRIMARY KEY,
                project_id          TEXT NOT NULL,
                title               TEXT NOT NULL,
                template_key        TEXT DEFAULT '',
                provider            TEXT DEFAULT '',
                model               TEXT DEFAULT '',
                prompt_observation  TEXT DEFAULT '',
                content             TEXT NOT NULL,
                source_history_ids  TEXT DEFAULT '[]',
                source_files        TEXT DEFAULT '[]',
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS document_revisions (
                id                  TEXT PRIMARY KEY,
                document_id         TEXT NOT NULL,
                revision_number     INTEGER NOT NULL,
                title               TEXT NOT NULL,
                content             TEXT NOT NULL,
                template_key        TEXT DEFAULT '',
                provider            TEXT DEFAULT '',
                model               TEXT DEFAULT '',
                prompt_observation  TEXT DEFAULT '',
                created_at          TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS backlog_items (
                id                  TEXT PRIMARY KEY,
                project_id          TEXT NOT NULL,
                source_document_id  TEXT DEFAULT '',
                title               TEXT NOT NULL,
                description         TEXT DEFAULT '',
                status              TEXT DEFAULT 'todo',
                priority            TEXT DEFAULT 'medium',
                order_idx           INTEGER DEFAULT 0,
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL
            )
            """
        )
        conn.commit()


def create_project(name: str, description: str = "", db_path: str = DB_PATH) -> dict:
    project_id = str(uuid.uuid4())
    now = datetime.now().isoformat(timespec="microseconds")
    with _get_conn(db_path) as conn:
        conn.execute(
            "INSERT INTO document_projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (project_id, name, description, now, now),
        )
        conn.commit()
    return get_project(project_id, db_path)


def list_projects(db_path: str = DB_PATH) -> list[dict]:
    with _get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM document_projects ORDER BY updated_at DESC, created_at DESC"
        ).fetchall()
    return [_parse_project(dict(row), db_path) for row in rows]


def get_project(project_id: str, db_path: str = DB_PATH) -> dict | None:
    with _get_conn(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM document_projects WHERE id = ?",
            (project_id,),
        ).fetchone()
    if row is None:
        return None
    return _parse_project(dict(row), db_path)


def update_project(project_id: str, db_path: str = DB_PATH, **fields) -> dict | None:
    allowed = {"name", "description"}
    updates = {key: value for key, value in fields.items() if key in allowed}
    if not updates:
        return get_project(project_id, db_path)
    updates["updated_at"] = datetime.now().isoformat(timespec="microseconds")
    set_clause = ", ".join(f"{key} = ?" for key in updates)
    values = list(updates.values()) + [project_id]
    with _get_conn(db_path) as conn:
        conn.execute(f"UPDATE document_projects SET {set_clause} WHERE id = ?", values)
        conn.commit()
    return get_project(project_id, db_path)


def delete_project(project_id: str, db_path: str = DB_PATH) -> None:
    with _get_conn(db_path) as conn:
        conn.execute(
            "DELETE FROM document_revisions WHERE document_id IN (SELECT id FROM generated_documents WHERE project_id = ?)",
            (project_id,),
        )
        conn.execute("DELETE FROM backlog_items WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM generated_documents WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM document_projects WHERE id = ?", (project_id,))
        conn.commit()


def create_document(
    project_id: str,
    title: str,
    content: str,
    template_key: str = "",
    provider: str = "",
    model: str = "",
    prompt_observation: str = "",
    source_history_ids: list[str] | None = None,
    source_files: list[dict] | None = None,
    db_path: str = DB_PATH,
) -> dict:
    document_id = str(uuid.uuid4())
    now = datetime.now().isoformat(timespec="microseconds")
    with _get_conn(db_path) as conn:
        conn.execute(
            """
            INSERT INTO generated_documents
            (id, project_id, title, template_key, provider, model, prompt_observation, content,
             source_history_ids, source_files, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                document_id,
                project_id,
                title,
                template_key,
                provider,
                model,
                prompt_observation,
                content,
                json.dumps(source_history_ids or []),
                json.dumps(source_files or []),
                now,
                now,
            ),
        )
        conn.execute(
            "UPDATE document_projects SET updated_at = ? WHERE id = ?",
            (now, project_id),
        )
        conn.commit()
    _create_revision_snapshot(document_id, db_path=db_path)
    return get_document(document_id, db_path)


def list_documents(project_id: str, db_path: str = DB_PATH) -> list[dict]:
    with _get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM generated_documents WHERE project_id = ? ORDER BY updated_at DESC, created_at DESC",
            (project_id,),
        ).fetchall()
    return [_parse_document(dict(row)) for row in rows]


def get_document(document_id: str, db_path: str = DB_PATH) -> dict | None:
    with _get_conn(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM generated_documents WHERE id = ?",
            (document_id,),
        ).fetchone()
    if row is None:
        return None
    return _parse_document(dict(row))


def update_document(document_id: str, db_path: str = DB_PATH, **fields) -> dict | None:
    allowed = {
        "title",
        "content",
        "template_key",
        "provider",
        "model",
        "prompt_observation",
        "source_history_ids",
        "source_files",
    }
    updates = {key: value for key, value in fields.items() if key in allowed}
    if not updates:
        return get_document(document_id, db_path)
    if "source_history_ids" in updates:
        updates["source_history_ids"] = json.dumps(updates["source_history_ids"] or [])
    if "source_files" in updates:
        updates["source_files"] = json.dumps(updates["source_files"] or [])
    updates["updated_at"] = datetime.now().isoformat(timespec="microseconds")
    set_clause = ", ".join(f"{key} = ?" for key in updates)
    values = list(updates.values()) + [document_id]
    with _get_conn(db_path) as conn:
        conn.execute(f"UPDATE generated_documents SET {set_clause} WHERE id = ?", values)
        conn.commit()
    _create_revision_snapshot(document_id, db_path=db_path)
    return get_document(document_id, db_path)


def delete_document(document_id: str, db_path: str = DB_PATH) -> None:
    with _get_conn(db_path) as conn:
        conn.execute("DELETE FROM document_revisions WHERE document_id = ?", (document_id,))
        conn.execute("DELETE FROM generated_documents WHERE id = ?", (document_id,))
        conn.commit()


def list_revisions(document_id: str, db_path: str = DB_PATH) -> list[dict]:
    with _get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM document_revisions WHERE document_id = ? ORDER BY revision_number DESC",
            (document_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_revision(revision_id: str, db_path: str = DB_PATH) -> dict | None:
    with _get_conn(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM document_revisions WHERE id = ?",
            (revision_id,),
        ).fetchone()
    return dict(row) if row else None


def restore_revision(document_id: str, revision_id: str, db_path: str = DB_PATH) -> dict | None:
    revision = get_revision(revision_id, db_path)
    if revision is None or revision["document_id"] != document_id:
        return None
    return update_document(
        document_id,
        db_path=db_path,
        title=revision["title"],
        content=revision["content"],
        template_key=revision.get("template_key", ""),
        provider=revision.get("provider", ""),
        model=revision.get("model", ""),
        prompt_observation=revision.get("prompt_observation", ""),
    )


def replace_backlog_items(
    project_id: str,
    source_document_id: str,
    items: list[dict],
    db_path: str = DB_PATH,
) -> list[dict]:
    now = datetime.now().isoformat(timespec="microseconds")
    with _get_conn(db_path) as conn:
        conn.execute(
            "DELETE FROM backlog_items WHERE project_id = ? AND source_document_id = ?",
            (project_id, source_document_id),
        )
        for idx, item in enumerate(items):
            conn.execute(
                """
                INSERT INTO backlog_items
                (id, project_id, source_document_id, title, description, status, priority, order_idx, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    project_id,
                    source_document_id,
                    item.get("title") or f"Item {idx + 1}",
                    item.get("description") or "",
                    item.get("status") or "todo",
                    item.get("priority") or "medium",
                    idx,
                    now,
                    now,
                ),
            )
        conn.execute(
            "UPDATE document_projects SET updated_at = ? WHERE id = ?",
            (now, project_id),
        )
        conn.commit()
    return list_backlog_items(project_id, db_path)


def list_backlog_items(project_id: str, db_path: str = DB_PATH) -> list[dict]:
    with _get_conn(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM backlog_items WHERE project_id = ? ORDER BY order_idx ASC, created_at ASC",
            (project_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def _parse_project(data: dict, db_path: str = DB_PATH) -> dict:
    data["documents"] = list_documents(data["id"], db_path)
    data["documents_count"] = len(data["documents"])
    data["backlog_items"] = list_backlog_items(data["id"], db_path)
    return data


def _parse_document(data: dict) -> dict:
    data["source_history_ids"] = json.loads(data.get("source_history_ids") or "[]")
    data["source_files"] = json.loads(data.get("source_files") or "[]")
    data["revisions"] = list_revisions(data["id"])
    return data


def _create_revision_snapshot(document_id: str, db_path: str = DB_PATH) -> None:
    document = get_document(document_id, db_path)
    if document is None:
        return
    with _get_conn(db_path) as conn:
        current = conn.execute(
            "SELECT MAX(revision_number) FROM document_revisions WHERE document_id = ?",
            (document_id,),
        ).fetchone()[0] or 0
        conn.execute(
            """
            INSERT INTO document_revisions
            (id, document_id, revision_number, title, content, template_key, provider, model, prompt_observation, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                document_id,
                int(current) + 1,
                document["title"],
                document["content"],
                document.get("template_key", ""),
                document.get("provider", ""),
                document.get("model", ""),
                document.get("prompt_observation", ""),
                datetime.now().isoformat(timespec="microseconds"),
            ),
        )
        conn.commit()


init_db()
