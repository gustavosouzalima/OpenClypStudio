# PixelTranscritor Workspace

Estrutura oficial do projeto:

- `frontend/` -> aplicação Next.js principal (páginas, recursos do produto e editor)
- `backend/` -> API Python/FastAPI (transcrição, projetos, histórico, compilação)

## Executar em desenvolvimento

### Backend

```bash
cd backend
python main.py
```

API padrão: `http://127.0.0.1:8000`

### Frontend

```bash
cd frontend
bun install
bun run dev --port 3000
```

Frontend padrão: `http://localhost:3000`

## Scripts rápidos (raiz)

```bash
npm run backend:dev
npm run frontend:dev
npm run backend:test
npm run frontend:build
```

## Observações

- A rota `/editor/:project_id` é interna do próprio `frontend` e redireciona para `/edit/:project_id` no mesmo servidor.
- O backend Python e testes foram consolidados em `backend/`.
- `OpenCut/` permanece no repositório apenas como referência legada durante a transição.
