"""Templates de prompt para processamento com IA."""

# Instrução de idioma adicionada a todos os templates
LANGUAGE_INSTRUCTION = "Responda sempre em **português do Brasil**. "

TEMPLATES: dict[str, dict] = {
    "reuniao": {
        "label": "📋 Reunião",
        "description": "Ata com decisões, participantes e próximos passos",
        "prompt": (
            LANGUAGE_INSTRUCTION +
            "Você recebeu a transcrição de uma reunião. "
            "Analise o conteúdo e gere uma ata estruturada em Markdown. "
            "Se a data ou duração forem mencionadas, inclua-as no cabeçalho.\n\n"
            "## Resumo Executivo\n"
            "Breve resumo da reunião em 2-3 frases.\n\n"
            "## Participantes\n"
            "Liste os participantes identificados. Quando possível, indique quem conduziu ou facilitou.\n\n"
            "## Tópicos Discutidos\n"
            "Organize os principais assuntos abordados em ordem cronológica.\n\n"
            "## Decisões Tomadas\n"
            "Liste as decisões concretas. Para cada uma, indique o responsável quando mencionado.\n\n"
            "## Próximos Passos\n"
            "Liste as ações definidas no formato: **[Responsável]** — ação — prazo (se mencionado).\n\n"
            "## Pontos em Aberto\n"
            "Questões levantadas que ficaram sem resolução.\n\n"
            "Transcrição:\n"
        ),
    },

    "entrevista": {
        "label": "🎤 Entrevista",
        "description": "Perfil do entrevistado, tópicos, citações e insights",
        "prompt": (
            LANGUAGE_INSTRUCTION +
            "Você recebeu a transcrição de uma entrevista. "
            "Analise o conteúdo e gere um relatório estruturado em Markdown:\n\n"
            "## Perfil do Entrevistado\n"
            "Nome, cargo, área de atuação e contexto — conforme mencionado na entrevista.\n\n"
            "## Contexto e Objetivo\n"
            "Qual é o tema central e por que essa entrevista foi realizada.\n\n"
            "## Principais Tópicos Abordados\n"
            "Organize os assuntos discutidos em blocos temáticos.\n\n"
            "## Citações Marcantes\n"
            "Transcreva as frases mais relevantes ou impactantes ditas pelo entrevistado (entre aspas).\n\n"
            "## Insights e Análises\n"
            "Pontos de vista, opiniões e perspectivas únicas que o entrevistado expressou.\n\n"
            "## Conclusões\n"
            "O que ficou de mais importante desta conversa.\n\n"
            "Transcrição:\n"
        ),
    },

    "brainstorming": {
        "label": "💡 Brainstorming",
        "description": "Ideias organizadas por tema com priorização e oportunidades",
        "prompt": (
            LANGUAGE_INSTRUCTION +
            "Você recebeu a transcrição de uma sessão de brainstorming ou conversa criativa. "
            "Analise e organize o conteúdo em Markdown:\n\n"
            "## Desafio ou Oportunidade Central\n"
            "Qual é o problema ou oportunidade que motivou a discussão.\n\n"
            "## Ideias Identificadas\n"
            "Liste todas as ideias mencionadas, agrupadas por tema ou categoria.\n\n"
            "## Priorização (Impacto × Esforço)\n"
            "Classifique as ideias mais concretas em:\n"
            "- **Alto impacto, baixo esforço** — faça agora\n"
            "- **Alto impacto, alto esforço** — planeje\n"
            "- **Baixo impacto** — descarte ou deixe para depois\n\n"
            "## Conexões e Oportunidades\n"
            "Aponte padrões, combinações interessantes entre ideias e oportunidades percebidas.\n\n"
            "## Riscos e Pontos de Atenção\n"
            "Obstáculos, dúvidas ou alertas levantados durante a discussão.\n\n"
            "## Próximas Explorações\n"
            "O que vale aprofundar ou validar primeiro.\n\n"
            "Transcrição:\n"
        ),
    },

    "podcast": {
        "label": "🎙️ Podcast / Redes Sociais",
        "description": "Sumário do episódio, capítulos, destaques e material para divulgação",
        "prompt": (
            LANGUAGE_INSTRUCTION +
            "Você recebeu a transcrição de um episódio de podcast ou conteúdo de áudio. "
            "Gere o material completo para publicação e divulgação em Markdown:\n\n"
            "## Título Sugerido\n"
            "Proponha 3 opções de título para o episódio (chamativos e com foco em SEO).\n\n"
            "## Descrição do Episódio\n"
            "Texto de 3-5 linhas para usar nas plataformas de podcast (Spotify, Apple Podcasts etc).\n\n"
            "## Capítulos / Sumário\n"
            "Liste os blocos temáticos do episódio. Se houver indicações de tempo na transcrição, inclua.\n\n"
            "## Frases de Destaque\n"
            "5 a 8 citações impactantes que podem virar posts nas redes sociais (entre aspas).\n\n"
            "## Post para Instagram / LinkedIn\n"
            "Texto pronto para publicação (até 300 palavras), com chamada para ouvir o episódio.\n\n"
            "## Tags e Palavras-Chave\n"
            "Lista de hashtags e keywords para SEO.\n\n"
            "Transcrição:\n"
        ),
    },

    "aula": {
        "label": "🎓 Aula / Palestra",
        "description": "Resumo, conceitos-chave, exemplos e pontos para revisão",
        "prompt": (
            LANGUAGE_INSTRUCTION +
            "Você recebeu a transcrição de uma aula, palestra ou webinar. "
            "Gere um material de estudo estruturado em Markdown:\n\n"
            "## Tema e Objetivo\n"
            "O que foi ensinado e qual resultado de aprendizado foi proposto.\n\n"
            "## Resumo Geral\n"
            "Síntese do conteúdo em um parágrafo.\n\n"
            "## Conceitos-Chave\n"
            "Liste e explique brevemente cada conceito importante apresentado.\n\n"
            "## Exemplos e Analogias Usados\n"
            "Registre os exemplos práticos e comparações que o professor/palestrante usou para explicar.\n\n"
            "## Perguntas Levantadas\n"
            "Questões feitas pelo público ou pelo próprio apresentador durante a aula.\n\n"
            "## Referências e Leituras Mencionadas\n"
            "Livros, artigos, ferramentas ou links citados.\n\n"
            "## Pontos para Revisão\n"
            "Os 5-10 pontos mais importantes que um aluno deve fixar.\n\n"
            "Transcrição:\n"
        ),
    },

    "youtube": {
        "label": "▶️ Roteiro YouTube",
        "description": "Roteiro estruturado com hook, capítulos, CTA e descrição para o canal",
        "prompt": (
            LANGUAGE_INSTRUCTION +
            "Você recebeu a transcrição de um conteúdo que será transformado em vídeo para o YouTube. "
            "Gere um roteiro profissional e completo em Markdown:\n\n"
            "## Títulos Sugeridos\n"
            "Proponha 3 opções de título otimizados para SEO e cliques (use números, perguntas ou promessas claras).\n\n"
            "## Thumbnail — Ideia Visual\n"
            "Descreva o conceito visual ideal para a miniatura: texto em destaque, expressão, cores e elemento principal.\n\n"
            "## Roteiro Estruturado\n\n"
            "### Hook (0–30 segundos)\n"
            "A abertura que prende o espectador imediatamente. Deve apresentar o problema ou promessa central.\n\n"
            "### Introdução (30s–2min)\n"
            "Apresentação do tema, do apresentador (se aplicável) e o que o espectador vai aprender/ver.\n\n"
            "### Desenvolvimento (corpo do vídeo)\n"
            "Divida o conteúdo em seções/capítulos numerados, cada um com um subtítulo claro.\n\n"
            "### Conclusão\n"
            "Síntese dos pontos principais abordados.\n\n"
            "### Call to Action (CTA)\n"
            "O que pedir ao espectador: curtir, comentar, se inscrever, acessar link — baseado no que foi mencionado.\n\n"
            "## Descrição para YouTube\n"
            "Texto completo para a caixa de descrição: resumo, capítulos com timestamps (estimados), links mencionados e hashtags.\n\n"
            "## Tags Sugeridas\n"
            "Lista de tags relevantes para o algoritmo do YouTube.\n\n"
            "Transcrição:\n"
        ),
    },

    "produto": {
        "label": "📦 Projeto / Produto",
        "description": "Documentação completa: visão, público, funcionalidades, stack e roadmap",
        "prompt": (
            LANGUAGE_INSTRUCTION +
            "Você recebeu a transcrição de uma conversa sobre um projeto, produto ou negócio. "
            "Gere uma documentação completa e estruturada em Markdown:\n\n"
            "## Visão e Proposta de Valor\n"
            "O que é, qual problema resolve e qual é o diferencial competitivo.\n\n"
            "## Público-Alvo\n"
            "Quem são os usuários ou clientes principais. Descreva o perfil quando possível.\n\n"
            "## Objetivos e Metas\n"
            "O que se deseja alcançar. Use bullet points com métricas quando mencionadas.\n\n"
            "## Funcionalidades / Escopo\n"
            "Liste o que está incluído no produto/projeto, agrupado por categoria ou módulo.\n\n"
            "## Stack Tecnológica / Modelo de Negócio\n"
            "Tecnologias, ferramentas ou como o produto/serviço funciona operacionalmente.\n\n"
            "## Fases e Cronograma\n"
            "Etapas de desenvolvimento ou lançamento identificadas na conversa.\n\n"
            "## Riscos e Desafios\n"
            "Pontos de atenção, incertezas e obstáculos levantados.\n\n"
            "## Próximos Passos\n"
            "Ações imediatas e concretas para avançar.\n\n"
            "## Perguntas em Aberto\n"
            "Pontos que precisam ser definidos ou validados.\n\n"
            "Transcrição:\n"
        ),
    },

    "livre": {
        "label": "✏️ Livre",
        "description": "Você escreve o prompt completo",
        "prompt": None,
    },
}


def get_system_prompt(template_key: str, custom_prompt: str | None = None) -> str:
    """Retorna o prompt completo para o template escolhido."""
    template = TEMPLATES.get(template_key)
    if template is None:
        raise ValueError(f"Template desconhecido: {template_key}")
    if template["prompt"] is None:
        if not custom_prompt:
            raise ValueError("Template 'livre' requer um prompt customizado.")
        return custom_prompt
    return template["prompt"]
