# PixelTranscritor - Guia Tecnico

## Objetivo

Workspace principal do produto com:

- `frontend/`: aplicacao Next.js/React que concentra interface, editor, timeline, preview, renderizacao local e integracoes com a API
- `backend/`: API Python usada para transcricao, projetos, historico, processamento de audio e exportacoes auxiliares

O editor atual do produto esta dentro de `frontend/`. Ele e codigo ativo e nao deve ser tratado como legado.

## Arquitetura Atual

### Frontend principal

- `frontend/` e a aplicacao principal do produto
- Usa Next.js App Router, React, Zustand, TanStack Query, Radix UI e Tailwind
- Contem paginas do produto, stores, servicos de renderizacao, integracoes com a API Python e o editor atualmente aberto pelos usuarios
- A rota `/editor/:project_id` redireciona internamente para `/edit/:project_id`
- O fluxo hoje montado na rota `/edit` passa por `frontend/src/editor_runtime/`

### Editor atual em uso

- O editor atualmente aberto dentro do app esta em `frontend/src/editor_runtime/`
- Apesar do nome interno `editor_runtime`, esse codigo e o editor atual do produto
- O editor possui hoje:
  - timeline por trilhas com comandos de adicionar, remover, mover, cortar, duplicar e mutar elementos
  - suporte a video, audio, texto, stickers, efeitos e captions
  - player/runtime baseado em Remotion para a experiencia atual de edicao aberta em `/edit`
  - upload local e rotas auxiliares conectadas ao proprio frontend

### Stack de edicao e renderizacao existente no frontend

- `frontend/src/editor_runtime/`: runtime ativo do editor aberto hoje
- `frontend/src/core/`, `frontend/src/components/editor/`, `frontend/src/services/renderer/`: stack mais nova de editor nativo no frontend
- Tecnologias presentes no codigo atual:
  - Remotion e `@remotion/player` no runtime aberto hoje
  - timeline e primitives de `@designcombo/*`
  - PixiJS v8 para composicao GPU no preview nativo mais novo
  - WebGL + shaders GLSL para efeitos
  - `mediabunny` para decode/cache/export e extracao de audio
  - Web Workers para decode de video e transcricao
  - captions com backend Python e presets/templates no frontend

### Backend Python

- `backend/main.py`: inicializacao da aplicacao
- `backend/server.py`: endpoints principais da API
- `backend/transcription.py`: transcricao
- `backend/diarization.py`: diarizacao
- `backend/audio.py`: processamento de audio
- `backend/downloader.py`: download de midia
- `backend/history.py`: historico local
- `backend/compiler.py`: compilacao/exportacao
- `backend/projects.py`: operacoes de projeto
- `backend/documents.py`: fluxos de documentos

### Legado real

- `editor/` existe no repositorio como artefato separado/herdado, mas nao e o fluxo principal aberto hoje pelo `frontend`
- Ao falar em "legado", a referencia correta e o OpenCut e derivados antigos, nao o editor atual embutido em `frontend/`

## Execucao

### A partir da raiz

```bash
npm run backend:dev
npm run frontend:dev
npm run backend:test
npm run frontend:build
```

### Backend

```bash
cd backend
python main.py
```

API padrao: `http://127.0.0.1:8000`

### Frontend

```bash
cd frontend
bun install
bun run dev --port 3000
```

Frontend padrao: `http://localhost:3000`

## Diretrizes de Leitura do Codigo

- Considere `frontend/` e `backend/` como as fontes principais da verdade
- Considere o editor dentro de `frontend/` como codigo ativo de producao
- Nao assumir que nomes como `editor_runtime` significam codigo morto ou fluxo descontinuado
- Antes de remover algo do editor, verificar rotas do App Router, imports reais e integracoes de upload, transcricao e timeline
- Antes de tratar um modulo como legado, confirmar se ele esta montado por alguma rota ativa do `frontend`

## Qualidade

- Testes backend: `cd backend && python -m pytest -q`
- Build frontend: `cd frontend && bun run build`
- O repositorio ainda contem rastros de migracoes anteriores, entao decisoes de limpeza devem ser guiadas por uso real no `frontend/` atual

## Seguranca (Repositorio Publico)

- Este repositorio e publico. Nao expor segredos em nenhum arquivo, commit, issue, PR, log ou resposta.
- Nunca commitar credenciais reais: `API_KEY`, `SESSION_SECRET`, `BETTER_AUTH_SECRET`, tokens OAuth, senhas, URLs com token, cookies, headers `Authorization`.
- Nunca commitar `.env`, `.env.local`, dumps de banco, artefatos de producao ou logs com dados sensiveis.
- Em exemplos/documentacao, usar apenas placeholders (ex.: `troque_por_uma_string_aleatoria_longa`).
- Se for necessario mostrar logs/comandos, mascarar valores sensiveis (`****`) antes de publicar.
- Se algum segredo for exposto acidentalmente: rotacionar imediatamente e remover do historico quando aplicavel.

## Deploy em Producao (Traefik)

- Este projeto deve usar o Traefik ja existente no VPS como reverse proxy.
- Nao publicar portas `80/443` neste stack do OpenClyp.
- O servico `frontend` deve ser roteado por labels do Traefik e rede Docker externa compartilhada.
- Variaveis obrigatorias para esse modo: `TRAEFIK_HOST`, `TRAEFIK_ENTRYPOINT`, `TRAEFIK_CERTRESOLVER`, `TRAEFIK_DOCKER_NETWORK`.
- `TRAEFIK_DOCKER_NETWORK` deve ser o nome real da rede do Traefik no host (ex.: `traefik_public`).

## Operacao de Transcricao

- A API usa `PIXEL_API_KEY` para proteger endpoints de transcricao/processamento; frontend e backend devem usar a mesma chave.
- Em transcricoes longas, o backend divide audio em chunks automaticamente para reduzir pico de memoria.
- Ajustes de chunking por ambiente:
  - `PIXEL_TRANSCRIBE_CHUNK_SECONDS` (padrao `300`)
  - `PIXEL_TRANSCRIBE_CHUNK_OVERLAP_SECONDS` (padrao `1.0`)
- Arquivos temporarios de audio/chunks sao removidos apos o processamento; o resultado textual permanece salvo.
- Jobs em memoria podem ser perdidos apos restart do backend; nesse caso o frontend pode receber `404` ao consultar `/api/jobs/{id}` antigo.
