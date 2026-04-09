# OpenClyp Studio

AI-powered video editor with automatic transcription, speaker diarization, and timeline-based editing. Designed for content creators who want to produce short-form videos from long-form content — fast.

## What it does

- **Automatic transcription** — upload audio/video or paste a YouTube URL and get word-level transcripts with speaker labels (powered by faster-whisper)
- **Timeline editor** — multi-track timeline with video, audio, text, captions, stickers, and effects
- **Smart clip selection** — mark highlights on the transcript and turn them into ready-to-export clips
- **Captions & subtitles** — auto-generated captions with styling presets, fully customizable
- **Direct publishing** — upload straight to YouTube via OAuth integration
- **TTS** — text-to-speech for voiceover generation
- **AI scripting** — optional Gemini/OpenAI integration for script and viral package generation

## Architecture

```
├── frontend/          Next.js 16 · React 19 · TypeScript · Tailwind
│   ├── src/
│   │   ├── app/              App Router pages & API routes
│   │   ├── editor_runtime/   Active timeline editor (Remotion + designcombo)
│   │   ├── core/             Native editor primitives (PixiJS v8, WebGL)
│   │   ├── components/       UI component library (Radix + shadcn)
│   │   ├── lib/              Auth, DB (Drizzle), services, stores (Zustand)
│   │   └── packages/         Internal packages (env, ui)
│   └── public/
│
├── backend/           Python 3.11 · FastAPI · Uvicorn
│   ├── server.py          REST + WebSocket API
│   ├── transcription.py   faster-whisper transcription
│   ├── diarization.py     Speaker identification
│   ├── audio.py           Audio processing & normalization
│   ├── compiler.py        Video compilation/export
│   ├── youtube_api.py     YouTube OAuth upload
│   ├── projects.py        Project CRUD & management
│   ├── documents.py       Document workflows
│   └── ai_providers.py    Optional Gemini/OpenAI integration
│
├── docker-compose.openclyp.yml   Production deployment
└── .env.openclyp.example         Environment template
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, Radix UI, shadcn/ui, Framer Motion |
| State & data | Zustand, TanStack Query, Drizzle ORM |
| Editor runtime | Remotion, designcombo timeline, PixiJS v8 |
| Media processing | FFmpeg (WASM + backend), mediabunny, Web Workers |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Transcription | faster-whisper (offline, CPU/GPU) |
| Diarization | resemblyzer + scikit-learn |
| Deployment | Docker, Docker Compose |

## Quick Start (Development)

### Prerequisites

- [Bun](https://bun.sh/) >= 1.x
- Python >= 3.11
- FFmpeg installed system-wide

### 1. Install dependencies

```bash
# Frontend
cd frontend && bun install

# Backend
cd backend && pip install -r requirements.txt
```

### 2. Set up environment

```bash
# Frontend
cp frontend/.env.example frontend/.env.local

# Backend
cp backend/.env.example backend/.env
```

### 3. Run both servers

```bash
# Terminal 1 — Backend (API on :8000)
python backend/main.py

# Terminal 2 — Frontend (App on :3000)
cd frontend && bun run dev --port 3000
```

Or from the workspace root:

```bash
bun run backend:dev    # Python backend on :8000
bun run frontend:dev   # Next.js on :3000
```

## Production Deployment (Docker)

Runs both backend and frontend on a single VPS. The backend is only accessible internally through the Docker network.

### 1. Clone and configure

```bash
git clone <your-repo-url> && cd openclypstudio

cp .env.openclyp.example .env.openclyp
# Edit .env.openclyp — set SESSION_SECRET and ADMIN_PASSWORD
```

Generate a session secret:

```bash
openssl rand -hex 32
```

### 2. Deploy

```bash
docker compose -f docker-compose.openclyp.yml --env-file .env.openclyp up -d --build
```

The app will be available at `http://<your-vps-ip>:4711`.

### 3. Reverse proxy (recommended)

Place Nginx or Caddy in front for HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:4711;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## Environment Variables

See `.env.openclyp.example` for all variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SITE_URL` | Public URL of the app | Yes |
| `SESSION_SECRET` | Signs session cookies (use `openssl rand -hex 32`) | Yes |
| `ADMIN_PASSWORD` | Workspace access password | Yes |
| `PIXEL_API_KEY` | Optional — protects backend API endpoints | No |
| `GEMINI_API_KEY` | Optional — AI script generation | No |
| `OPENAI_API_KEY` | Optional — AI script generation | No |

## Scripts

```bash
bun run frontend:dev       # Start Next.js dev server
bun run frontend:build     # Production build
bun run backend:dev        # Start Python backend
bun run backend:test       # Run backend tests (pytest)
```

## License

Private project. All rights reserved.
