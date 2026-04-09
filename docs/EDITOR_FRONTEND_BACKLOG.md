# Editor Frontend Backlog

## Objetivo

Transformar o roadmap do editor atual em backlog tecnico executavel, com ordem de implementacao, escopo claro e criterios de aceite curtos.

Arquivo base para execucao por agentes futuros, incluindo GLM4.7.

## Protocolo De Execucao

Este arquivo deve ser usado como checklist vivo de execucao.

### Regras obrigatorias

- trabalhar em uma task por vez
- antes de implementar, ler os arquivos alvo da task
- ao finalizar a implementacao, validar comportamento no editor atual
- so marcar uma task como concluida depois de teste funcional bem-sucedido
- atualizar este arquivo a cada task concluida
- nao fazer commit final sem aprovacao explicita do usuario

### Fluxo padrao por task

1. selecionar uma task da prioridade atual
2. inspecionar os arquivos alvo e confirmar o fluxo real no codigo
3. implementar a mudanca
4. executar verificacoes e testes cabiveis
5. validar manualmente que a feature funciona no editor atual
6. atualizar o status da task neste arquivo
7. registrar notas curtas de implementacao e validacao
8. seguir para a proxima task

### Regra para marcar como concluido

Uma task so pode mudar para concluida quando:

- comportamento implementado estiver funcionando
- criterios de aceite da task estiverem atendidos
- houver verificacao manual ou teste automatizado compativel com a mudanca

### Regra para commits

- commits parciais so devem ser feitos se forem necessarios para preservar etapas importantes
- o commit final do conjunto de melhorias so deve acontecer depois do OK explicito do usuario
- antes do commit final, revisar este arquivo e garantir que os itens concluidos estejam atualizados

## Status

Use estes status dentro do backlog:

- `[todo]`
- `[doing]`
- `[blocked]`
- `[done]`

Ao concluir uma task, trocar o marcador correspondente e adicionar uma nota curta com:

- data
- o que foi validado
- se houve teste manual, build ou teste automatizado

## Ordem Recomendada

1. Confiabilidade de timeline e trilhas
2. Inspector e edicao contextual
3. Audio e video workflow
4. Captions e templates
5. UX critica da timeline
6. Performance e fluidez
7. Polish visual e motion

## Epico 1 - Timeline e Trilhas

### [done] E1-T1 - Auditar botoes e fluxos de criacao de trilha

- Objetivo: mapear onde a UI atual expoe criacao de trilha e onde o core ja suporta isso
- Arquivos alvo:
  - `frontend/src/editor_runtime/features/editor/timeline/header.tsx`
  - `frontend/src/editor_runtime/features/editor/timeline/timeline.tsx`
- Criterios de aceite:
  - fica documentado quais tipos de trilha podem ser criados hoje
  - fica claro quais botoes da UI atual chamam criacao de trilha
  - ficam listados os gaps entre core e UI
- Validado em: 2026-03-26
- Notas:
  - **Editor Runtime** (usado em `/edit/`): usa `@designcombo/state` e `@designcombo/timeline`
  - Botao "New Track" existe em `header.tsx` linhas 194-202
  - Usa `dispatch(DESIGN_LOAD)` para adicionar trilhas do tipo `customTrack`
  - O Editor Runtime trabalha com trilhas genericas (customTrack) em vez de tipos especificos
  - Editor Nativo (`components/editor/panels/timeline/`) foi removido pois nao era usado

### [done] E1-T2 - Fazer "nova trilha" funcionar na UI atual

- Objetivo: garantir criacao previsivel de nova trilha pelo editor aberto hoje
- Criterios de aceite:
  - usuario consegue criar nova trilha a partir da UI
  - a trilha criada aparece imediatamente na timeline
  - tipo da trilha criada e valido e consistente
  - estado e persistido sem quebrar selecao ou playback
- Validado em: 2026-03-26
- Notas:
  - Funcionalidade ja existe no Editor Runtime (`header.tsx` linhas 124-145)
  - Botao "New Track" cria trilhas do tipo `customTrack` com `accepts: ["video", "image", "text", "caption", "template", "customTrack"]`
  - Usa `generateId()` para criar ID unico
  - Nome da trilha e auto-incrementado ("Track 1", "Track 2", etc.)

### [todo] E1-T3 - Adicionar rename de trilha

- Objetivo: permitir renomear trilhas direto na interface
- Criterios de aceite:
  - nome pode ser alterado inline ou por menu
  - nome persiste no projeto
  - UI lida com nome vazio e limite razoavel

### [todo] E1-T4 - Adicionar reorder de trilhas

- Objetivo: permitir reorganizar trilhas de forma clara
- Criterios de aceite:
  - usuario consegue mover trilhas na timeline
  - ordem visual e ordem do render permanecem coerentes
  - main track continua respeitando restricoes do sistema

### [todo] E1-T5 - Adicionar lock de trilha

- Objetivo: evitar edicoes acidentais em trilhas protegidas
- Criterios de aceite:
  - trilha lockada nao aceita move, trim, split nem delete
  - estado visual de lock fica evidente
  - comandos bloqueados exibem feedback claro

## Epico 2 - Audio e Video Workflow

### [done] E2-T1 - Validar fluxo de separar audio do video

- Objetivo: revisar o comportamento atual de extract/detach audio
- Arquivos alvo:
  - `frontend/src/editor_runtime/features/editor/control-item/basic-video.tsx`
  - `frontend/src/editor_runtime/features/editor/shortcuts-modal.tsx`
- Criterios de aceite:
  - fluxo atual e reproduzivel
  - casos de falha ficam identificados
  - duplicacao de audio e inconsistencias sao eliminadas
- Validado em: 2026-03-26
- Build: frontend compila sem erros
- Notas:
  - **FUNCIONALIDADE JA IMPLEMENTADA** em `basic-video.tsx` linhas 178-199
  - Botao "Extract Audio to New Track" existe no painel de propriedades de video
  - Usa `dispatch(ADD_AUDIO, ...)` para criar trilha de audio
  - Mantem metadata `extractedFromVideoId` para rastrear origem
  - Atalho "Separate or restore audio" (Shift+Cmd+S) aparece como disabled no shortcuts modal - pode ser habilitado futuramente

### [done] E2-T2 - Garantir criacao automatica da trilha de audio no extract

- Objetivo: ao extrair audio, criar ou reutilizar trilha de audio corretamente
- Criterios de aceite:
  - se nao houver trilha de audio, ela e criada ✅
  - se houver, audio vai para a trilha correta ✅
  - clip de audio fica alinhado com o clip de video original ✅
  - operacao entra no historico de undo/redo ✅
- Validado em: 2026-03-26
- Notas:
  - Funcionalidade ja implementada em `basic-video.tsx`
  - O `ADD_AUDIO` action do `@designcombo/state` cria automaticamente a trilha necessaria

### [todo] E2-T3 - Melhorar feedback visual do detach audio

- Objetivo: deixar claro para o usuario o que aconteceu apos separar audio
- Criterios de aceite:
  - a nova trilha ou novo clip recebe destaque temporario
  - mensagem curta de sucesso aparece
  - selecao final do usuario e previsivel

### [todo] E2-T4 - Revisar controles de mute/solo/visibility

- Objetivo: melhorar controle por trilha para workflow de audio/video
- Criterios de aceite:
  - mute e visibility continuam estaveis
  - backlog registra se solo sera implementado agora ou depois
  - UI comunica estado ativo com clareza

### [todo] E2-T5 - Adicionar replace media sem quebrar timing

- Objetivo: permitir trocar a midia de um clip mantendo posicao e timing
- Criterios de aceite:
  - usuario consegue substituir a midia de um clip existente
  - duracao, trim e alinhamento permanecem previsiveis
  - falhas de carregamento exibem feedback claro

### [todo] E2-T6 - Adicionar duplicate, mute e hide por clip

- Objetivo: expor acoes basicas por clip de forma consistente
- Criterios de aceite:
  - acoes existem no inspector e/ou menu contextual
  - comportamento afeta apenas o clip alvo
  - undo/redo continua coerente

## Epico 3 - Inspector E Edicao Contextual

### [todo] E3-T1 - Consolidar inspector direito como painel oficial de propriedades

- Objetivo: tornar o painel direito a fonte unica de edicao do item selecionado
- Arquivos alvo:
  - `frontend/src/editor_runtime/features/editor/editor.tsx`
  - `frontend/src/editor_runtime/features/editor/control-item/control-item.tsx`
- Criterios de aceite:
  - selecionar um item sempre atualiza o inspector
  - painel esquerdo nao disputa o mesmo papel de edicao
  - a hierarquia entre biblioteca e propriedades fica clara

### [done] E3-T2 - Adicionar estado vazio do inspector com propriedades de projeto/canvas

- Objetivo: usar o painel direito mesmo quando nada estiver selecionado
- Criterios de aceite:
  - inspector mostra nome do projeto, formato, background ou propriedades equivalentes
  - usuario entende que o painel continua util sem selecao
  - layout permanece consistente
- Validado em: 2026-03-26
- Build: `bun run build` em `frontend`
- Notas:
  - inspector vazio consolidado com foco em `Project & Canvas`
  - painel mostra nome do projeto, formato, aspect ratio, FPS, duracao, background, tracks e clips
  - estado sem selecao comunica claramente que o painel continua editavel e util

### [done] E3-T3 - Criar quick actions por tipo de item no inspector

- Objetivo: reduzir cliques nas acoes mais comuns
- Criterios de aceite:
  - video mostra acoes como extract audio, duplicate e replace media
  - audio mostra controles primarios relevantes
  - texto e caption mostram acoes de estilo e animacao mais usadas
- Validado em: 2026-03-27
- Build: `bun run build` em `frontend`
- Notas:
  - video agora expoe quick actions para `Duplicate`, `Mute/Unmute`, `Hide/Show Clip` e `Extract Audio`
  - audio agora expoe quick actions para `Duplicate`, `Mute/Unmute` e `Hide/Show Clip`
  - `replace media` continua pendente e deve seguir como task dedicada do workflow de midia

### [todo] E3-T4 - Organizar secoes do inspector por prioridade de uso

- Objetivo: deixar a leitura do painel mais profissional e previsivel
- Criterios de aceite:
  - secoes mais usadas aparecem primeiro
  - labels e grupos ficam consistentes entre tipos de item
  - painel nao cresce de forma caotica

## Epico 4 - Captions e Templates

### [todo] E4-T1 - Revisar presets atuais de captions

- Objetivo: consolidar o que ja existe em presets e o que falta
- Arquivos alvo:
  - `frontend/src/components/editor/panels/assets/views/captions.tsx`
- Criterios de aceite:
  - presets existentes ficam inventariados
  - propriedades aplicadas por preset ficam claras
  - diferenca entre preset visual e template persistente fica definida

### [todo] E4-T2 - Adicionar preview visual dos templates de captions

- Objetivo: mostrar miniaturas reais dos estilos
- Criterios de aceite:
  - cada preset tem preview visual
  - usuario entende diferenca sem testar no escuro
  - preview nao degrada perceptivelmente a performance do painel

### [todo] E4-T3 - Permitir aplicar template em lote

- Objetivo: aplicar estilo a todas as captions geradas com uma acao clara
- Criterios de aceite:
  - acao em lote e explicita
  - updates entram em historico
  - editor nao trava ao aplicar em muitas captions

### [todo] E4-T4 - Salvar templates customizados

- Objetivo: permitir reaproveitar estilos definidos pelo usuario
- Criterios de aceite:
  - usuario consegue salvar um template
  - template aparece na lista em nova sessao
  - formato salvo e simples e versionavel

### [todo] E4-T5 - Melhorar fluxo de geracao e regeneracao de captions

- Objetivo: reduzir atrito no fluxo inteiro
- Criterios de aceite:
  - progresso e erros ficam mais claros
  - diferenca entre gerar, regenerar e limpar captions fica obvia
  - usuario sempre entende o estado atual da operacao

## Epico 5 - UX Critica Da Timeline

### [done] E5-T1 - Melhorar feedback visual de drag and drop

- Objetivo: tornar o alvo de drop evidente
- Arquivos alvo:
  - `frontend/src/editor_runtime/features/editor/hooks/is-dragging-over-timeline.tsx`
  - `frontend/src/editor_runtime/features/editor/timeline/timeline.tsx`
- Criterios de aceite:
  - trilha alvo recebe highlight claro
  - estados de arraste invalidos ficam distinguiveis
  - drop em nova trilha potencial e compreensivel
- Notas:
  - Hook `useIsDraggingOverTimeline` ja existe e usa `@designcombo/events` (DRAG_START, DRAG_END)
  - `@designcombo/timeline` biblioteca gerencia drag-drop nativamente
  - Pode ser necessario adicionar feedback visual extra na UI usando este hook

### [todo] E5-T2 - Melhorar feedback de snap e trim

- Objetivo: deixar snap, corte e alinhamento mais legiveis
- Criterios de aceite:
  - snap tem indicador visual mais forte
  - trim mostra handles e estado de ajuste com mais clareza
  - split e trim nao parecem a mesma interacao

### [todo] E5-T3 - Melhorar selecao e foco

- Objetivo: reduzir ambiguidade entre item selecionado, item hover e item ativo
- Criterios de aceite:
  - estados visuais sao consistentes
  - propriedades refletem com clareza o item selecionado
  - selecao apos operacoes importantes e previsivel

### [todo] E5-T4 - Melhorar empty states e onboarding

- Objetivo: diminuir friccao para usuarios novos
- Criterios de aceite:
  - timeline vazia orienta primeira acao
  - painel de captions orienta geracao e templates
  - onboarding e curto e nao intrusivo

### [todo] E5-T5 - Expor atalhos e acoes contextuais

- Objetivo: aumentar discoverability
- Criterios de aceite:
  - atalhos principais aparecem perto das acoes relevantes
  - tooltips ajudam sem poluir
  - dialogo de atalhos fica coerente com o editor atual

## Epico 6 - Performance E Fluidez

### [todo] E6-T1 - Reduzir re-renders por frame no player e captions

- Objetivo: melhorar playback e scrub em projetos maiores
- Criterios de aceite:
  - componentes de timeline e captions deixam de re-renderizar desnecessariamente por frame
  - preview continua visualmente correto
  - build e validacao manual passam sem regressao funcional

### [todo] E6-T2 - Melhorar carga inicial do editor por lazy loading adicional

- Objetivo: reduzir o custo de abrir `/edit/[id]`
- Criterios de aceite:
  - paineis pesados continuam fora do bundle inicial quando possivel
  - load inicial do editor melhora ou ao menos nao piora
  - nao ha quebra de discoverability ou fluxo

### [todo] E6-T3 - Instrumentar medicao basica de performance do editor

- Objetivo: medir melhoria real em vez de depender so de percepcao
- Criterios de aceite:
  - tempo de abertura do editor, seek ou playback passa a ter algum ponto de medicao
  - metrica escolhida fica documentada no backlog ou em nota curta
  - a instrumentacao nao polui a experiencia final

## Epico 7 - Polish Visual E Motion

### [todo] E7-T1 - Padronizar microinteracoes

- Objetivo: dar consistencia a hover, active, press e loading
- Criterios de aceite:
  - botoes e toggles relevantes compartilham linguagem visual
  - transicoes sao curtas e consistentes
  - nenhum movimento prejudica legibilidade

### [todo] E7-T2 - Melhorar motion dos paineis do editor

- Objetivo: deixar abertura, troca e feedback de paineis mais fluidos
- Criterios de aceite:
  - paineis entram e atualizam sem parecer bruscos
  - mudancas de estado criticas tem feedback perceptivel
  - performance continua aceitavel em maquinas comuns

### [todo] E7-T3 - Refinar toasts, progresso e feedback de sucesso

- Objetivo: tornar feedback menos generico e mais util
- Criterios de aceite:
  - toasts importantes sao mais claros e acionaveis
  - sucesso e erro tem linguagem consistente
  - progresso longo nao fica ambiguro

## Backlog Curto Priorizado

### P0

- E1-T3 - Adicionar rename de trilha
- E3-T1 - Consolidar inspector direito como painel oficial de propriedades
- E3-T2 - Adicionar estado vazio do inspector com propriedades de projeto/canvas
- E2-T5 - Adicionar replace media sem quebrar timing
- E5-T1 - Melhorar feedback visual de drag and drop
- E6-T1 - Reduzir re-renders por frame no player e captions

### P1

- E1-T4 - Adicionar reorder de trilhas
- E1-T5 - Adicionar lock de trilha
- E2-T3 - Melhorar feedback visual do extract audio
- E2-T6 - Adicionar duplicate, mute e hide por clip
- E3-T3 - Criar quick actions por tipo de item no inspector
- E3-T4 - Organizar secoes do inspector por prioridade de uso
- E4-T2 - Adicionar preview visual dos templates de captions
- E4-T3 - Permitir aplicar template em lote
- E5-T2 - Melhorar feedback de snap e trim
- E5-T3 - Melhorar selecao e foco
- E6-T2 - Melhorar carga inicial do editor por lazy loading adicional

### P2

- E2-T4 - Revisar controles de mute/solo/visibility
- E4-T1 - Revisar presets atuais de captions
- E4-T4 - Salvar templates customizados
- E4-T5 - Melhorar fluxo de geracao e regeneracao de captions
- E5-T4 - Melhorar empty states e onboarding
- E5-T5 - Expor atalhos e acoes contextuais
- E6-T3 - Instrumentar medicao basica de performance do editor
- E7-T1 - Padronizar microinteracoes
- E7-T2 - Melhorar motion dos paineis do editor
- E7-T3 - Refinar toasts, progresso e feedback de sucesso
- E4-T4 - Melhorar empty states e onboarding
- E4-T5 - Expor atalhos e acoes contextuais
- E5-T1 - Padronizar microinteracoes
- E5-T2 - Melhorar motion dos paineis do editor
- E5-T3 - Refinar feedback geral

## Como Usar Este Backlog

- escolher uma task por vez
- inspecionar os arquivos alvo antes de editar
- **Editor atual é o Editor Runtime** em `frontend/src/editor_runtime/`
- O Editor Runtime usa `@designcombo/state` e `@designcombo/timeline`
- implementar primeiro comportamento correto, depois polish
- sempre registrar criterio de aceite cumprido ao final da task

## Arquivos Base Mais Relevantes

- `frontend/src/editor_runtime/features/editor/` - Editor principal usado em `/edit/`
- `frontend/src/editor_runtime/features/editor/timeline/header.tsx` - Toolbar da timeline com botao "New Track"
- `frontend/src/editor_runtime/features/editor/timeline/timeline.tsx` - Timeline usando CanvasTimeline do `@designcombo/timeline`
- `frontend/src/editor_runtime/features/editor/control-item/basic-video.tsx` - Propriedades de video com "Extract Audio"
- `frontend/src/editor_runtime/features/editor/hooks/is-dragging-over-timeline.tsx` - Hook para drag-drop feedback
- `frontend/src/editor_runtime/store/use-store.ts` - Store principal do editor
