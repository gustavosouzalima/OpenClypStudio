"""Integracao local com YouTube Data API via OAuth desktop."""

from __future__ import annotations

import os
from pathlib import Path

from env_loader import load_local_env

load_local_env()

YOUTUBE_DIR = Path(os.getenv("PIXEL_YOUTUBE_DIR", Path.home() / ".transcritor" / "youtube"))
DEFAULT_CLIENT_SECRETS = YOUTUBE_DIR / "client_secret.json"
DEFAULT_TOKEN_FILE = YOUTUBE_DIR / "token.json"
YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def ensure_youtube_dir() -> None:
    YOUTUBE_DIR.mkdir(parents=True, exist_ok=True)


def get_client_secrets_path() -> Path:
    ensure_youtube_dir()
    custom = os.getenv("YOUTUBE_CLIENT_SECRETS_FILE", "").strip()
    return Path(custom).expanduser() if custom else DEFAULT_CLIENT_SECRETS


def get_token_path() -> Path:
    ensure_youtube_dir()
    custom = os.getenv("YOUTUBE_TOKEN_FILE", "").strip()
    return Path(custom).expanduser() if custom else DEFAULT_TOKEN_FILE


def save_client_secrets(contents: bytes) -> str:
    path = get_client_secrets_path()
    path.write_bytes(contents)
    return str(path.resolve())


def _import_google_client():
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
        from googleapiclient.errors import HttpError
        from googleapiclient.http import MediaFileUpload
    except ImportError as exc:
        raise RuntimeError(
            "Dependencias do YouTube nao instaladas. Rode: pip install google-api-python-client google-auth-oauthlib google-auth-httplib2"
        ) from exc
    return Request, Credentials, InstalledAppFlow, build, HttpError, MediaFileUpload


def _load_credentials(interactive: bool = False, open_browser: bool = True):
    Request, Credentials, InstalledAppFlow, _build, _HttpError, _MediaFileUpload = _import_google_client()
    token_path = get_token_path()
    client_secrets_path = get_client_secrets_path()

    if not client_secrets_path.exists():
        raise RuntimeError(
            f"Arquivo OAuth do YouTube nao encontrado em {client_secrets_path}. "
            "Baixe um client OAuth Desktop no Google Cloud e envie para a plataforma."
        )

    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), YOUTUBE_SCOPES)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_path.write_text(creds.to_json(), encoding="utf-8")
        return creds

    if not interactive:
        return None

    flow = InstalledAppFlow.from_client_secrets_file(str(client_secrets_path), YOUTUBE_SCOPES)
    creds = flow.run_local_server(
        host="127.0.0.1",
        port=0,
        authorization_prompt_message="Abra o navegador para autorizar o canal no YouTube.",
        success_message="Autorizacao concluida. Pode fechar esta aba e voltar para o app.",
        open_browser=open_browser,
    )
    token_path.write_text(creds.to_json(), encoding="utf-8")
    return creds


def get_service(interactive: bool = False, open_browser: bool = True):
    _Request, _Credentials, _InstalledAppFlow, build, _HttpError, _MediaFileUpload = _import_google_client()
    creds = _load_credentials(interactive=interactive, open_browser=open_browser)
    if creds is None:
        raise RuntimeError("Canal YouTube ainda nao conectado.")
    return build("youtube", "v3", credentials=creds)


def get_status() -> dict:
    client_path = get_client_secrets_path()
    token_path = get_token_path()
    status = {
        "connected": False,
        "has_client_secrets": client_path.exists(),
        "client_secrets_path": str(client_path.resolve()),
        "token_path": str(token_path.resolve()),
        "channel_title": None,
        "channel_id": None,
    }
    try:
        service = get_service(interactive=False, open_browser=False)
    except RuntimeError:
        return status

    response = service.channels().list(part="snippet", mine=True).execute()
    items = response.get("items") or []
    if items:
        snippet = items[0].get("snippet") or {}
        status["connected"] = True
        status["channel_title"] = snippet.get("title")
        status["channel_id"] = items[0].get("id")
    return status


def connect(open_browser: bool = True) -> dict:
    service = get_service(interactive=True, open_browser=open_browser)
    response = service.channels().list(part="snippet", mine=True).execute()
    items = response.get("items") or []
    if not items:
        raise RuntimeError("Autenticacao concluida, mas nenhum canal foi encontrado na conta.")
    snippet = items[0].get("snippet") or {}
    return {
        "connected": True,
        "channel_title": snippet.get("title"),
        "channel_id": items[0].get("id"),
        "token_path": str(get_token_path().resolve()),
    }


def disconnect() -> None:
    token_path = get_token_path()
    if token_path.exists():
        token_path.unlink()


def upload_video(
    video_path: str,
    title: str,
    description: str,
    tags: list[str] | None = None,
    privacy_status: str = "private",
    category_id: str = "22",
    made_for_kids: bool = False,
    notify_subscribers: bool = False,
    progress_cb=None,
) -> dict:
    _Request, _Credentials, _InstalledAppFlow, _build, HttpError, MediaFileUpload = _import_google_client()
    service = get_service(interactive=False, open_browser=False)

    body = {
        "snippet": {
            "title": title,
            "description": description,
            "categoryId": category_id,
        },
        "status": {
            "privacyStatus": privacy_status,
            "selfDeclaredMadeForKids": bool(made_for_kids),
        },
    }
    clean_tags = [tag.strip() for tag in (tags or []) if tag and tag.strip()]
    if clean_tags:
        body["snippet"]["tags"] = clean_tags

    request = service.videos().insert(
        part="snippet,status",
        body=body,
        notifySubscribers=bool(notify_subscribers),
        media_body=MediaFileUpload(video_path, chunksize=-1, resumable=True),
    )

    response = None
    while response is None:
        try:
            status, response = request.next_chunk()
        except HttpError as exc:
            raise RuntimeError(f"Falha no upload para YouTube: {exc}") from exc
        if status and progress_cb:
            progress_cb(int(status.progress() * 100))

    return {
        "video_id": response.get("id"),
        "title": title,
        "privacy_status": privacy_status,
        "url": f"https://www.youtube.com/watch?v={response.get('id')}",
    }
