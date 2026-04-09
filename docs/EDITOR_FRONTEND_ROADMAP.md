# Editor Frontend Roadmap

## Objetivo

Registrar o estado atual do editor que roda dentro de `frontend/`, as lacunas mais importantes de funcionalidade e UX, e uma lista priorizada de melhorias para implementacao incremental.

Este arquivo serve como base para execucao futura por outros agentes e modelos, incluindo GLM4.7.

## Estado Atual

O editor atualmente aberto pelo app esta no fluxo:

- `/editor/:project_id`
- redireciona para `/edit/:project_id`
- monta o runtime em `frontend/src/editor_runtime/`

O repositorio tambem contem uma stack mais nova de editor nativo em:

- `frontend/src/core/`
- `frontend/src/components/editor/`
- `frontend/src/services/renderer/`

Essa stack ja possui infraestrutura importante de timeline, preview, renderer, efeitos, captions e exportacao, mas o fluxo principal aberto hoje continua sendo o editor de `editor_runtime`.

## Tecnologias Atuais Identificadas No Codigo

### UI e arquitetura

- Next.js App Router
- React
- Zustand
- TanStack Query
- Radix UI
- Tailwind CSS

### Editor e timeline

- `@designcombo/timeline`
- `@designcombo/state`
- `@designcombo/events`
- `@designcombo/animations`
- `@designcombo/transitions`
- `@designcombo/frames`

### Preview, render e efeitos

- Remotion no runtime atual aberto em `/edit`
- PixiJS v8 na stack nova de preview nativo
- WebGL + GLSL para efeitos
- `mediabunny` para decode, audio extraction e export
- Web Workers para decode de video e transcricao

### Captions e transcricao

- transcricao via backend Python no fluxo principal de captions
- presets/templates de caption ja existem no frontend
- geracao de trilha automatica de captions

## O Que Ja Existe No Editor Atual

### Timeline e edicao

- adicionar/remover trilhas no core de timeline
- mover elementos entre trilhas
- split normal, split-left e split-right
- duplicar e deletar elementos
- mute/visibility por trilha e por elemento
- snapping e ripple editing
- bookmarks

### Audio e video

- suporte a video e audio na timeline
- comando para separar audio de video existe na toolbar do timeline
- extracao de audio da timeline para captions existe
- mixagem e coleta de audio ja existem no core

### Captions

- geracao de captions a partir do audio da timeline
- criacao automatica de track de captions
- presets visuais de captions ja implementados
- limpeza e regeneracao de captions

### Render e preview

- preview baseado em player/runtime no editor atual
- stack nova com Pixi/WebGL para preview mais avancado
- cache de video, decode em worker e export com `mediabunny`

## Gaps Funcionais Mais Importantes

### P0 - Funcionalidade central do editor

- garantir que "separar audio do video" funcione de ponta a ponta em todos os casos
- garantir que o botao de nova trilha funcione de forma previsivel na UI atual, nao apenas no core
- expor melhor a criacao de trilhas de audio, video, texto e efeitos
- melhorar a descoberta e a edicao da trilha criada apos detach de audio
- revisar fluxo de mover elementos entre trilhas e validacao visual da operacao

### P1 - Produtividade e recursos de edicao

- presets/templates de captions mais completos, com categorias e previews
- aplicar template de caption a selecao atual ou a todas as captions geradas
- suporte mais claro a tracks de efeitos, stickers e texto
- melhores acoes de timeline: lock track, rename track, duplicate track, reorder track
- freeze frame ainda esta marcado como `coming soon`

### P2 - Workflow e acabamento

- presets de projeto para shorts, reels, TikTok, YouTube
- salvar estilos de caption como templates reutilizaveis
- melhor integracao entre editor atual e stack nova de renderer
- reduzir ambiguidades entre o runtime atual e os modulos novos do editor nativo

## Gaps De UX E UI

### Timeline

- feedback visual mais forte para drag, drop, split, trim e snap
- destaque melhor da trilha alvo ao mover elementos
- indicacao clara quando uma acao vai criar nova trilha
- estados de hover, selected e disabled mais consistentes
- affordances mais fortes para lock/mute/visibility se esses controles forem expandidos

### Captions

- previews visuais reais dos templates, nao apenas nome e descricao
- comparacao rapida entre estilos de caption
- fluxo de aplicacao em lote mais explicito
- feedback de progresso e erro ja existe, mas pode ficar mais claro e polido

### Discoverability

- onboarding curto para primeiras acoes do editor
- empty states melhores em painel, timeline e propriedades
- atalhos mais visiveis no contexto certo
- dicas contextuais para recursos importantes como split, detach audio e captions

### Motion e polish

- microinteracoes mais intencionais na timeline e nos paineis
- animacoes de entrada/saida mais consistentes entre paines e overlays
- transicoes de estado mais suaves em loading, drag e selecao
- indicadores de acao bem-sucedida com menor ruido visual

## Lista Basica Do Que Ainda Falta No Editor Atual

### Funcionalidade

- validar e consolidar o fluxo de separar audio em nova trilha
- consolidar o fluxo de criar nova trilha pela UI atual
- adicionar rename/reorder/lock de trilha
- concluir freeze frame
- ampliar templates de caption com preview e persistencia
- melhorar a insercao de elementos em trilhas especificas

### Usabilidade

- reforcar feedback visual de timeline
- simplificar painel de propriedades para acoes mais frequentes
- melhorar estados vazios e onboarding
- melhorar leitura visual de selecao, foco e alvo de drop

### UI motion

- animacoes de painel mais coesas
- microinteracoes de botao, toggle e toolbar
- feedback de sucesso/erro mais refinado
- transicoes melhores ao gerar captions e ao aplicar templates

## Priorizacao Recomendada

### P0

- separar audio do video funcionar com confiabilidade
- nova trilha funcionar e ser compreensivel na UI
- corrigir lacunas de timeline que impedem fluxo basico

### P1

- templates de caption com preview
- rename/reorder/lock track
- freeze frame
- melhorias fortes de timeline UX

### P2

- onboarding
- polish visual
- harmonizacao entre editor atual e stack nova de renderer/editor

## Sugestao De Execucao Para Outro Modelo

Se outro modelo for implementar esse roadmap, trabalhar em etapas pequenas:

1. auditar fluxo real da feature escolhida no `frontend/`
2. corrigir comportamento no core antes de polir UI
3. adicionar testes ou verificacoes manuais claras
4. documentar impacto na UX
5. so depois avancar para motion e acabamento visual

## Arquivos Relevantes

- `frontend/src/editor_runtime/`
- `frontend/src/core/managers/timeline-manager.ts`
- `frontend/src/components/editor/panels/timeline/timeline-toolbar.tsx`
- `frontend/src/components/editor/panels/assets/views/captions.tsx`
- `frontend/src/services/renderer/`
- `frontend/src/lib/timeline/`
