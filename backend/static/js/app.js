/* Transcritor Local — Alpine.js App */

document.addEventListener('alpine:init', () => {

  // ── WAV encoder (Web Audio API → arquivo .wav) ────────────────────────────
  function encodeWAV(audioBuffer) {
    const numCh = audioBuffer.numberOfChannels;
    const sr    = audioBuffer.sampleRate;
    const len   = audioBuffer.length;
    const buf   = new ArrayBuffer(44 + len * numCh * 2);
    const v     = new DataView(buf);
    const ws    = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    ws(0, 'RIFF');  v.setUint32(4, 36 + len * numCh * 2, true);
    ws(8, 'WAVE');  ws(12, 'fmt ');
    v.setUint32(16, 16, true);  v.setUint16(20, 1, true);   // PCM
    v.setUint16(22, numCh, true);
    v.setUint32(24, sr, true);  v.setUint32(28, sr * numCh * 2, true);
    v.setUint16(32, numCh * 2, true);  v.setUint16(34, 16, true);
    ws(36, 'data'); v.setUint32(40, len * numCh * 2, true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let ch = 0; ch < numCh; ch++) {
        const s = audioBuffer.getChannelData(ch)[i];
        v.setInt16(off, Math.max(-1, Math.min(1, s)) * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  function getStoredApiKey() {
    try {
      const raw = localStorage.getItem('pixel_transcript_v3_settings');
      if (!raw) return '';
      const data = JSON.parse(raw);
      return data?.security?.apiKey || '';
    } catch (_) {
      return '';
    }
  }

  function getPreferredCloudProvider() {
    return AppSettings?.ai?.cloud?.provider || 'gemini';
  }

  function authHeaders(extra = {}) {
    const headers = { ...extra };
    const apiKey = getStoredApiKey().trim();
    if (apiKey) headers['X-API-Key'] = apiKey;
    return headers;
  }

  const api = {
    get:    (url)       => fetch(url, { headers: authHeaders() }).then(r => r.json()),
    post:   (url, body) => fetch(url, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }),
    delete: (url)       => fetch(url, { method: 'DELETE', headers: authHeaders() }).then(r => r.ok),
  };

  function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1048576).toFixed(1)} MB`;
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function openWs(jobId, onMsg) {
    const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${wsProtocol}://${location.host}/ws/${jobId}`);
    ws.onmessage = e => onMsg(JSON.parse(e.data));
    ws.onerror = () => onMsg({ type: 'error', message: 'Conexão WebSocket perdida' });
    return ws;
  }

  function playDoneTone() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.15;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    } catch (_) {}
  }

  // ── Centralized Settings ───────────────────────────────────────────────────
  const DEFAULT_SETTINGS = {
    whisper: {
      model: 'large-v3-turbo',
      language: 'pt',
      beam_size: 5,
      batch_size: 32,
      diarize: false,
      num_speakers: 2,
      auto_detect_speakers: false,
      speaker_names: {},
      output_format: 'txt',
      device: 'cuda',
      vadFilter: true,
      computeType: 'float32'
    },
    ai: {
      provider: 'gemini',
      lm_studio: { host: 'http://localhost:1234' },
      ollama:   { host: 'http://localhost:11434', model: 'llama3' },
      cloud:    { 
        provider: 'gemini', 
        model: 'gemini-3.1-flash-lite-preview', 
        customModel: '', 
        token: '' 
      },
      max_tokens: 8192,
      template: 'reuniao',
      model: '' // Active model in chat
    },
    security: {
      apiKey: ''
    },
    notifications: {
      transcriptionDoneSound: true
    },
  };

  function deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  // Global reactive settings
  const StoredSettingsSnapshot = JSON.parse(localStorage.getItem('pixel_transcript_v3_settings') || 'null');
  let AppSettings = StoredSettingsSnapshot || DEFAULT_SETTINGS;
  AppSettings = deepMerge(DEFAULT_SETTINGS, AppSettings);

  // Compatibilidade com schema antigo salvo em versões anteriores.
  if (AppSettings.cloud && !AppSettings.ai?.cloud) {
    AppSettings.ai = AppSettings.ai || {};
    AppSettings.ai.cloud = AppSettings.cloud;
  }
  if (AppSettings.lm_studio && !AppSettings.ai?.lm_studio) {
    AppSettings.ai = AppSettings.ai || {};
    AppSettings.ai.lm_studio = AppSettings.lm_studio;
  }
  if (AppSettings.ollama && !AppSettings.ai?.ollama) {
    AppSettings.ai = AppSettings.ai || {};
    AppSettings.ai.ollama = AppSettings.ollama;
  }
  if (AppSettings.whisper?.modelSize && !AppSettings.whisper?.model) {
    AppSettings.whisper.model = AppSettings.whisper.modelSize;
  }
  if (AppSettings.ai?.provider === 'openai' || AppSettings.ai?.provider === 'gemini') {
    AppSettings.ai.provider = AppSettings.ai.cloud?.provider || 'gemini';
  }

  function hasStoredAiPreference() {
    const raw = StoredSettingsSnapshot;
    return Boolean(
      raw?.ai?.provider
      || raw?.ai?.model
      || raw?.ai?.cloud?.provider
      || raw?.ai?.cloud?.model
      || raw?.ai?.cloud?.customModel
    );
  }

  const saveAllSettings = () => {
    localStorage.setItem('pixel_transcript_v3_settings', JSON.stringify(AppSettings));
    window.dispatchEvent(new CustomEvent('app-settings-changed'));
  };

  /**
   * Retorna a configuracao ativa de IA com base em AppSettings.
   * Fonte unica de verdade usada por todas as abas (Co-Piloto, Compilador, etc).
   */
  function getActiveAiConfig() {
    let provider = AppSettings.ai.provider || getPreferredCloudProvider();
    if (provider === 'openai' || provider === 'gemini') {
      provider = getPreferredCloudProvider();
    }

    let config;
    if (provider === 'openai' || provider === 'gemini') {
      config = { api_key: AppSettings.ai.cloud?.token || '' };
    } else if (provider === 'lm_studio') {
      config = { base_url: AppSettings.ai.lm_studio?.host || 'http://localhost:1234/v1' };
    } else if (provider === 'ollama') {
      config = { base_url: AppSettings.ai.ollama?.host || 'http://localhost:11434' };
    } else {
      config = AppSettings.ai[provider] || {};
    }

    // Modelo: customModel tem prioridade, depois cloud.model, depois ai.model
    let model = AppSettings.ai.model || '';
    if (provider === 'openai' || provider === 'gemini') {
      if (AppSettings.ai.cloud?.customModel) {
        model = AppSettings.ai.cloud.customModel;
      } else if (!model && AppSettings.ai.cloud?.model) {
        model = AppSettings.ai.cloud.model;
      }
    }

    return {
      provider,
      model,
      config,
      max_tokens: AppSettings.ai.max_tokens || null,
    };
  }

  // ── Aba: Transcrever ─────────────────────────────────────────────────────
  Alpine.data('transcribeTab', () => ({
    files: [],
    url: '',
    audioOnly: true,
    config: AppSettings.whisper,
    configOpen: false,
    running: false,
    downloading: false,
    downloadProgress: 0,
    progress: 0,
    logs: [],
    ws: null,
    jobId: null,

    init() {
      this.$watch('config', () => saveAllSettings());
      window.addEventListener('add-to-transcribe', e => this.addFiles([e.detail.file]));
      this.ensureSpeakerNameKeys();
      this.$watch('config.num_speakers', () => this.ensureSpeakerNameKeys());
    },

    speakerLabel(idx) {
      return `SPEAKER_${String(idx).padStart(2, '0')}`;
    },

    speakerIndexes() {
      const count = Math.max(1, Number(this.config.num_speakers || 1));
      return Array.from({ length: count }, (_, i) => i + 1);
    },

    ensureSpeakerNameKeys() {
      if (!this.config.speaker_names || typeof this.config.speaker_names !== 'object') {
        this.config.speaker_names = {};
      }
      for (const idx of this.speakerIndexes()) {
        const key = this.speakerLabel(idx);
        if (this.config.speaker_names[key] === undefined) {
          this.config.speaker_names[key] = '';
        }
      }
    },

    addFiles(fileList) {
      for (const f of fileList) {
        if (!this.files.find(x => x.path === f.name)) {
          this.files.push({ name: f.name, path: f.name, _file: f, transcribed: false });
        }
      }
    },

    removeFile(idx) { this.files.splice(idx, 1); },
    onDrop(e) { e.preventDefault(); this.$el.classList.remove('dragover'); this.addFiles(e.dataTransfer.files); },
    onDragover(e) { e.preventDefault(); this.$el.classList.add('dragover'); },
    onDragleave()  { this.$el.classList.remove('dragover'); },
    triggerPicker() { this.$refs.filePicker.click(); },
    onPick(e)       { this.addFiles(e.target.files); e.target.value = ''; },

    async downloadUrl() {
      if (!this.url.trim()) return;
      this.downloading = true;
      this.downloadProgress = 0;
      const res = await api.post('/api/download', { url: this.url, audio_only: this.audioOnly });
      if (!res.ok) { this.logs.push(`❌ ${(await res.json()).detail}`); this.downloading = false; return; }
      const { job_id } = await res.json();
      openWs(job_id, msg => {
        if (msg.type === 'progress') this.downloadProgress = msg.value;
        if (msg.type === 'log')      this.logs.push(msg.message);
        if (msg.type === 'done') {
          this.files.push({ name: msg.filename, path: msg.filepath, _file: null, transcribed: false });
          this.url = ''; this.downloading = false; this.downloadProgress = 0;
          this.logs.push(`✅ Baixado: ${msg.filename}`);
        }
        if (msg.type === 'error') { this.logs.push(`❌ ${msg.message}`); this.downloading = false; }
      });
    },

    hasUntranscribed() { return this.files.some(f => !f.transcribed); },

    async startTranscription() {
      const toTranscribe = this.files.filter(f => !f.transcribed);
      if (!toTranscribe.length) return;
      const formData = new FormData();
      for (const f of toTranscribe) { if (f._file) formData.append('files', f._file); }
      const paths = toTranscribe.filter(f => !f._file).map(f => f.path);
      this.running = true; this.progress = 0; this.logs = [];
      let uploadedPaths = [...paths];
      if (formData.has('files')) {
        const up = await fetch('/api/upload', { method: 'POST', headers: authHeaders(), body: formData });
        if (up.ok) { const { paths: p } = await up.json(); uploadedPaths = [...uploadedPaths, ...p]; }
      }
      const res = await api.post('/api/transcribe', {
        files: uploadedPaths,
        model: this.config.model,
        language: this.config.language,
        beam_size: this.config.beam_size,
        batch_size: this.config.batch_size,
        diarize: this.config.diarize,
        num_speakers: this.config.num_speakers,
        auto_detect_speakers: this.config.auto_detect_speakers,
        speaker_names: this.config.speaker_names,
        output_format: this.config.output_format,
        vad_filter: this.config.vadFilter !== false,
      });
      if (!res.ok) { this.logs.push(`❌ ${(await res.json()).detail}`); this.running = false; return; }
      const { job_id } = await res.json();
      this.jobId = job_id;
      this.ws = openWs(job_id, msg => {
        if (msg.type === 'progress') this.progress = msg.value;
        if (msg.type === 'log')      this.logs.push(msg.message);
        if (msg.type === 'done')  {
          this.running = false; this.jobId = null;
          for (const f of toTranscribe) f.transcribed = true;
          if (AppSettings.notifications?.transcriptionDoneSound !== false) {
            playDoneTone();
          }
          window.dispatchEvent(new CustomEvent('history-updated'));
          if (msg.ids && msg.ids.length) window.dispatchEvent(new CustomEvent('transcription-done', { detail: { ids: msg.ids } }));
        }
        if (msg.type === 'error') { this.running = false; this.jobId = null; }
        this.$nextTick(() => { const el = this.$refs.logPanel; if (el) el.scrollTop = el.scrollHeight; });
      });
    },

    async cancelTranscription() {
      if (this.jobId) await api.delete(`/api/jobs/${this.jobId}`);
      if (this.ws) this.ws.close();
    },

    clearLog() { this.logs = []; },

    // Configurações unificadas
    settings: AppSettings,
    saveSettings() { saveAllSettings(); alert('✅ Configurações salvas!'); }
  }));

  // ── Aba: IA ──────────────────────────────────────────────────────────────
  Alpine.data('iaTab', () => ({
    provider: AppSettings.ai.provider,
    connected: false,
    models: [],
    selectedModel: AppSettings.ai.model,
    checking: false,
    maxTokens: AppSettings.ai.max_tokens,
    iaFiles: [],
    selectedText: '',
    templates: [],
    selectedTemplate: AppSettings.ai.template,
    customPrompt: '',
    observation: '',
    processing: false,
    result: '',
    resultHtml: '',
    logs: [],
    historyItems: [],
    historySearch: '',
    historyPreview: null,
    documentProjects: [],
    currentDocumentProject: null,
    newDocumentProjectName: '',
    newDocumentProjectDescription: '',
    generatedDocumentTitle: '',
    isCreatingDocumentProject: false,
    isSavingDocument: false,
    aiDefaults: { preferred_provider: 'gemini', preferred_model: '', source: '.env.local/.env' },

    get providerConfig() {
      return getActiveAiConfig().config;
    },

    async init() {
      await this.loadAiDefaults();
      await this.loadTemplates();
      await this.checkProvider();
      await this.loadHistory();
      await this.loadDocumentProjects();
      this.$watch('provider', async (val) => {
        AppSettings.ai.provider = val;
        saveAllSettings();
        this.models = [];
        this.selectedModel = '';
        await this.checkProvider();
      });
      this.$watch('selectedTemplate', val => { AppSettings.ai.template = val; saveAllSettings(); });
      this.$watch('selectedModel',   val => { AppSettings.ai.model = val; saveAllSettings(); });
      this.$watch('maxTokens',      val => { AppSettings.ai.max_tokens = val; saveAllSettings(); });
      
      window.addEventListener('app-settings-changed', () => {
          this.provider = AppSettings.ai.provider;
          this.checkProvider();
      });

      window.addEventListener('send-to-ia', e => this._addFile(e.detail.filename, e.detail.content, e.detail.historyId || null));
      window.addEventListener('history-updated', () => this.loadHistory());
      window.addEventListener('transcription-done', async e => {
        for (const id of (e.detail.ids || [])) {
          const data = await api.get(`/api/history/${id}`);
          if (data && data.content) this._addFile(data.filename, data.content, data.id || null);
        }
      });
    },

    async loadAiDefaults() {
      try {
        this.aiDefaults = await api.get('/api/ai/defaults');
        if (!hasStoredAiPreference()) {
          if (this.aiDefaults.preferred_provider) {
            AppSettings.ai.provider = this.aiDefaults.preferred_provider;
            AppSettings.ai.cloud.provider = this.aiDefaults.preferred_provider;
            this.provider = this.aiDefaults.preferred_provider;
          }
          if (this.aiDefaults.preferred_model) {
            AppSettings.ai.cloud.model = this.aiDefaults.preferred_model;
            if (!AppSettings.ai.model) {
              AppSettings.ai.model = this.aiDefaults.preferred_model;
            }
            if (!this.selectedModel) {
              this.selectedModel = this.aiDefaults.preferred_model;
            }
          }
          saveAllSettings();
        }
      } catch (_) {}
    },

    async loadTemplates() {
      this.templates = await api.get('/api/templates');
      const validKeys = this.templates.map(t => t.key);
      if (!validKeys.includes(this.selectedTemplate)) this.selectedTemplate = 'reuniao';
    },

    async checkProvider() {
      this.checking = true;
      try {
        const cfg = JSON.stringify(this.providerConfig);
        const response = await fetch(`/api/ai/status?provider=${this.provider}&config=${encodeURIComponent(cfg)}`, { headers: authHeaders() });
        if (!response.ok) {
          throw new Error(`Erro HTTP ${response.status}`);
        }
        const data = await response.json();
        this.connected = data.connected;
        this.models = data.models || [];
        if (this.models.length) {
          const preferred = AppSettings.ai.model || this.aiDefaults?.preferred_model || '';
          this.selectedModel = this.models.includes(preferred) ? preferred : this.models[0];
        }
      } catch (e) {
        this.connected = false;
        this.models = [];
        console.error('Erro ao verificar provedor:', e);
      }
      this.checking = false;
    },

    onDropIa(e) {
      e.preventDefault(); this.$el.classList.remove('dragover');
      for (const f of e.dataTransfer.files) {
        if (f.name.match(/\.(txt|srt)$/i)) {
          const reader = new FileReader();
          reader.onload = ev => this._addFile(f.name, ev.target.result);
          reader.readAsText(f, 'utf-8');
        }
      }
    },

    onDragoverIa(e) { e.preventDefault(); this.$el.classList.add('dragover'); },
    onDragleaveIa()  { this.$el.classList.remove('dragover'); },
    triggerIaPicker() { this.$refs.iaPicker.click(); },
    triggerPicker() { this.triggerIaPicker(); },
    onIaPick(e) {
      for (const f of e.target.files) {
        const reader = new FileReader();
        reader.onload = ev => this._addFile(f.name, ev.target.result);
        reader.readAsText(f, 'utf-8');
      }
      e.target.value = '';
    },
    onPick(e) { this.onIaPick(e); },

    selectIaFile(item) { this.selectedText = item.content; },
    removeIaFile(idx) {
      const removed = this.iaFiles.splice(idx, 1)[0];
      this.selectedText = this.iaFiles[0]?.content || '';
      if (removed) window.dispatchEvent(new CustomEvent('ia-file-removed', { detail: { filename: removed.name } }));
    },

    _addFile(filename, content, historyId = null) {
      if (!this.iaFiles.find(f => f.name === filename)) {
        this.iaFiles.push({ name: filename, content, historyId });
      }
      this.selectedText = content;
      // Força update do Alpine reativo
      this.$nextTick(() => {
        console.log(`Arquivo adicionado à IA: ${filename}`);
      });
    },

    async loadHistory() {
      this.historyItems = await api.get('/api/history');
    },

    async loadDocumentProjects() {
      this.documentProjects = await api.get('/api/document-projects');
      if (!this.currentDocumentProject && this.documentProjects.length) {
        this.currentDocumentProject = this.documentProjects[0];
      } else if (this.currentDocumentProject) {
        const fresh = this.documentProjects.find(project => project.id === this.currentDocumentProject.id);
        if (fresh) this.currentDocumentProject = fresh;
      }
    },

    async openDocumentProject(project) {
      this.currentDocumentProject = await api.get(`/api/document-projects/${project.id}`);
    },

    async createDocumentProject() {
      if (!this.newDocumentProjectName.trim()) return;
      this.isCreatingDocumentProject = true;
      try {
        const res = await api.post('/api/document-projects', {
          name: this.newDocumentProjectName,
          description: this.newDocumentProjectDescription,
        });
        if (!res.ok) {
          const err = await res.json();
          alert('Erro ao criar projeto documental: ' + (err.detail || 'Erro desconhecido'));
          return;
        }
        const created = await res.json();
        this.newDocumentProjectName = '';
        this.newDocumentProjectDescription = '';
        await this.loadDocumentProjects();
        await this.openDocumentProject(created);
      } finally {
        this.isCreatingDocumentProject = false;
      }
    },

    filteredHistory() {
      if (!this.historySearch.trim()) return this.historyItems;
      const q = this.historySearch.toLowerCase();
      return this.historyItems.filter(item => item.filename.toLowerCase().includes(q));
    },

    historyIsAttached(item) {
      return this.iaFiles.some(file =>
        (item.id && file.historyId && String(file.historyId) === String(item.id))
        || String(file.name) === String(item.filename)
      );
    },

    async attachHistoryItem(item) {
      const data = item.content !== undefined ? item : await api.get(`/api/history/${item.id}`);
      this._addFile(data.filename, data.content, data.id || item.id || null);
    },

    async previewHistoryItem(item) {
      const data = item.content !== undefined ? item : await api.get(`/api/history/${item.id}`);
      this.historyPreview = data;
    },

    closeHistoryPreview() {
      this.historyPreview = null;
    },

    documentCountLabel() {
      return `${this.iaFiles.length} documento(s) anexado(s)`;
    },

    attachedHistoryIds() {
      return this.iaFiles
        .filter(file => file.historyId)
        .map(file => file.historyId);
    },

    async saveGeneratedDocument() {
      if (!this.result.trim()) return;
      if (!this.currentDocumentProject) {
        alert('Crie ou selecione um projeto documental antes de salvar.');
        return;
      }
      this.isSavingDocument = true;
      try {
        const aiCfg = getActiveAiConfig();
        const title = this.generatedDocumentTitle.trim()
          || this.result.match(/^#\s+(.+)$/m)?.[1]
          || `Documento ${new Date().toLocaleString('pt-BR')}`;
        const res = await api.post(`/api/document-projects/${this.currentDocumentProject.id}/documents`, {
          project_id: this.currentDocumentProject.id,
          title,
          content: this.result,
          template_key: this.selectedTemplate,
          provider: aiCfg.provider,
          model: aiCfg.model || this.selectedModel,
          prompt_observation: this.selectedTemplate === 'livre' ? this.customPrompt : this.observation,
          source_history_ids: this.attachedHistoryIds(),
          source_files: this.iaFiles.map(file => ({
            name: file.name,
            history_id: file.historyId || null,
          })),
        });
        if (!res.ok) {
          const err = await res.json();
          alert('Erro ao salvar documento: ' + (err.detail || 'Erro desconhecido'));
          return;
        }
        this.generatedDocumentTitle = title;
        await this.loadDocumentProjects();
        await this.openDocumentProject(this.currentDocumentProject);
      } finally {
        this.isSavingDocument = false;
      }
    },

    async process() {
      if (!this.iaFiles.length && !this.selectedText.trim()) return;
      this.processing = true;
      this.result = ''; this.resultHtml = '';
      this.logs = [];

      this.logs.push(`🚀 Iniciando processamento com ${this.provider} (${this.selectedModel})...`);
      this.logs.push(`📝 Template: ${this.selectedTemplate}`);
      
      // Concatena todos os arquivos anexados para enviar como um contexto rico
      const combinedText = this.iaFiles.length > 0 
        ? this.iaFiles.map(f => `--- Documento: ${f.name} ---\n${f.content}`).join('\n\n')
        : this.selectedText;

      this.logs.push(`📊 Tamanho do texto combinado: ${combinedText.length} caracteres em ${this.iaFiles.length} arquivo(s)`);

      const aiCfg = getActiveAiConfig();

      const body = {
        text: combinedText,
        template: this.selectedTemplate,
        model: aiCfg.model || this.selectedModel,
        provider: aiCfg.provider,
        custom_prompt: this.selectedTemplate === 'livre' ? this.customPrompt : null,
        observation: this.observation.trim() || null,
        config: aiCfg.config,
        max_tokens: this.maxTokens,
      };

      this.logs.push(`🌐 Enviando requisição para a API...`);

      try {
        const res = await api.post('/api/ai/process', body);
        const data = await res.json();

        if (!res.ok) {
          this.logs.push(`❌ Erro: ${data.detail}`);
          this.result = `Erro: ${data.detail}`;
          this.resultHtml = `<p style="color:var(--danger)">${data.detail}</p>`;
        } else {
          this.logs.push(`✅ Resposta recebida: ${data.result.length} caracteres`);
          this.result = data.result;
          this.resultHtml = marked.parse(data.result);
          this.generatedDocumentTitle = data.result.match(/^#\s+(.+)$/m)?.[1] || '';
          this.logs.push(`✨ Processamento concluído!`);
          this._playDone();
        }
      } catch (e) {
        this.logs.push(`❌ Erro de conexão: ${e.message}`);
        this.result = `Erro de conexão: ${e.message}`;
        this.resultHtml = `<p style="color:var(--danger)">${e.message}</p>`;
      }

      this.processing = false;
    },

    clearLogs() { this.logs = []; },

    _playDone() {
      playDoneTone();
    },

    copyResult() {
      navigator.clipboard.writeText(this.result);
      this.logs.push(`📋 [Sucesso] Resposta copiada para a área de transferência!`); 
    },
    saveResult() {
      const blob = new Blob([this.result], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `resultado_${this.selectedTemplate}_${Date.now()}.md`;
      a.click();
    },
    printPdfResult() {
      const win = window.open('', '_blank');
      win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Resultado — ${this.selectedTemplate}</title><style>body{font-family:system-ui,sans-serif;max-width:820px;margin:2rem auto;line-height:1.7;color:#1a1a1a}h1,h2,h3{color:#111}code{background:#f1f5f9;padding:.1em .35em;border-radius:4px;font-size:.9em}pre{background:#f1f5f9;padding:1rem;border-radius:6px;overflow-x:auto}blockquote{border-left:3px solid #cbd5e1;margin:0;padding-left:1rem;color:#64748b}@media print{body{margin:1cm}}</style></head><body>${this.resultHtml}</body></html>`);
      win.document.close();
      win.print();
      this.logs.push(`🖨️ [Sucesso] Janela de Exportação PDF / Impressão aberta!`); 
    },
    fmtDate,
  }));

  // ── Aba: Histórico ───────────────────────────────────────────────────────
  Alpine.data('historyTab', () => ({
    items: [],
    preview: null,
    search: '',
    iaFilenames: [],

    async init() {
      await this.load();
      window.addEventListener('history-updated', () => this.load());
      window.addEventListener('ia-file-removed', e => {
        const idx = this.iaFilenames.indexOf(e.detail.filename);
        if (idx !== -1) this.iaFilenames.splice(idx, 1);
      });
    },

    async load() { this.items = await api.get('/api/history'); },
    filteredItems() {
      if (!this.search.trim()) return this.items;
      return this.items.filter(i => i.filename.toLowerCase().includes(this.search.toLowerCase()));
    },

    async openPreview(item) {
      const data = await api.get(`/api/history/${item.id}`);
      this.preview = data;
    },

    closePreview() { this.preview = null; },
    async deleteItem(item, deleteFile = false) {
      const label = deleteFile ? 'do histórico E do disco' : 'do histórico';
      if (!confirm(`Remover "${item.filename}" ${label}?`)) return;
      const url = `/api/history/${item.id}` + (deleteFile ? '?delete_file=true' : '');
      await api.delete(url);
      await this.load();
      if (this.preview?.id === item.id) this.preview = null;
    },

    exportZip() {
      window.location.href = '/api/history/export';
    },

    async sendToIa(item) {
      const data = item.content !== undefined ? item : await api.get(`/api/history/${item.id}`);
      window.dispatchEvent(new CustomEvent('send-to-ia', { detail: { content: data.content, filename: data.filename, historyId: data.id || item.id } }));
      if (!this.iaFilenames.includes(data.filename)) this.iaFilenames.push(data.filename);
    },

    fmtDate, fmtSize,
  }));

  // ── Aba: Gravar ──────────────────────────────────────────────────────────
  Alpine.data('recordTab', () => ({
    devices: [],
    selectedDevice: '',
    recording: false,
    paused: false,
    mediaRecorder: null,
    audioChunks: [],
    audioUrl: '',
    audioBlob: null,
    timer: 0,
    timerInterval: null,
    level: 0,
    _animFrame: null,
    _audioCtx: null,
    // Editor de áudio (WaveSurfer)
    ws: null,
    wsPlaying: false,
    wsDuration: 0,
    wsCurrentTime: 0,
    trimRegion: null,
    trimming: false,

    async init() {
      await this.loadDevices();
      navigator.mediaDevices?.addEventListener('devicechange', () => this.loadDevices());
      // Inicializa WaveSurfer quando o áudio fica pronto
      this.$watch('audioUrl', val => {
        if (val) this.$nextTick(() => setTimeout(() => this._initWaveSurfer(), 80));
        else if (this.ws) { this.ws.destroy(); this.ws = null; }
      });
    },

    async loadDevices() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach(t => t.stop());
      } catch (_) {}
      const all = await navigator.mediaDevices.enumerateDevices();
      this.devices = all.filter(d => d.kind === 'audioinput');
      if (this.devices.length && !this.selectedDevice) this.selectedDevice = this.devices[0].deviceId;
    },

    fmtTimer(s) {
      const m = Math.floor(s / 60);
      return `${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
    },

    fmtTime(s) {
      if (!s && s !== 0) return '0:00';
      const m = Math.floor(s / 60);
      return `${m}:${String(Math.floor(s % 60)).padStart(2,'0')}`;
    },

    async startRecording() {
      // Descarta gravação anterior
      this._destroyWaveSurfer();
      if (this.audioUrl) { URL.revokeObjectURL(this.audioUrl); this.audioUrl = ''; }
      this.audioChunks = []; this.timer = 0;
      this.trimRegion = null; this.wsPlaying = false; this.wsDuration = 0; this.wsCurrentTime = 0;

      const constraints = { audio: this.selectedDevice ? { deviceId: { exact: this.selectedDevice } } : true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      this._audioCtx = new AudioContext();
      const src      = this._audioCtx.createMediaStreamSource(stream);
      const analyser = this._audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        this.level = Math.round(buf.reduce((a, b) => a + b, 0) / buf.length / 2.55);
        this._animFrame = requestAnimationFrame(tick);
      };
      tick();

      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = e => { if (e.data.size) this.audioChunks.push(e.data); };
      this.mediaRecorder.onstop = () => {
        this.audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.audioUrl  = URL.createObjectURL(this.audioBlob);
        stream.getTracks().forEach(t => t.stop());
        cancelAnimationFrame(this._animFrame);
        this._audioCtx?.close();
        this.level = 0;
      };
      this.mediaRecorder.start(200);
      this.recording = true; this.paused = false;
      this.timerInterval = setInterval(() => this.timer++, 1000);
    },

    togglePause() {
      if (this.paused) { this.mediaRecorder.resume(); this.timerInterval = setInterval(() => this.timer++, 1000); }
      else             { this.mediaRecorder.pause();  clearInterval(this.timerInterval); }
      this.paused = !this.paused;
    },

    stopRecording() {
      this.mediaRecorder?.stop();
      clearInterval(this.timerInterval);
      this.recording = false; this.paused = false;
    },

    // ── WaveSurfer ───────────────────────────────────────────────────────────

    _initWaveSurfer() {
      const container = this.$refs.waveform;
      if (!container || typeof WaveSurfer === 'undefined') return;
      if (this.ws) { this.ws.destroy(); }

      this.ws = WaveSurfer.create({
        container,
        waveColor:     '#00E3B5',
        progressColor: '#F9C62C',
        cursorColor:   '#ff3366',
        height: 70,
        barWidth: 2,
        barGap: 1,
        plugins: [
          WaveSurfer.regions.create({
            dragSelection: { slop: 5 },
            color: 'rgba(249, 198, 44, 0.3)',
          }),
        ],
      });

      this.ws.on('ready',        () => { this.wsDuration = this.ws.getDuration(); });
      this.ws.on('audioprocess', () => { this.wsCurrentTime = this.ws.getCurrentTime(); });
      this.ws.on('play',         () => { this.wsPlaying = true; });
      this.ws.on('pause',        () => { this.wsPlaying = false; });
      this.ws.on('finish',       () => { this.wsPlaying = false; this.wsCurrentTime = 0; });

      this.ws.on('region-created', region => {
        // Mantém apenas a última região
        Object.values(this.ws.regions.list).forEach(r => { if (r.id !== region.id) r.remove(); });
        this.trimRegion = { start: region.start, end: region.end };
      });
      this.ws.on('region-updated', region => {
        this.trimRegion = { start: region.start, end: region.end };
      });
      this.ws.on('region-removed', () => { this.trimRegion = null; });

      this.ws.load(this.audioUrl);
    },

    _destroyWaveSurfer() {
      if (this.ws) { this.ws.destroy(); this.ws = null; }
    },

    wsPlayPause() { this.ws?.playPause(); },

    // ── Trim ─────────────────────────────────────────────────────────────────

    async trimAudio() {
      if (!this.trimRegion || !this.audioBlob) return;
      this.trimming = true;
      const { start, end } = this.trimRegion;
      try {
        const arrayBuffer = await this.audioBlob.arrayBuffer();
        const audioCtx    = new AudioContext();
        const decoded     = await audioCtx.decodeAudioData(arrayBuffer);
        const sr     = decoded.sampleRate;
        const s0     = Math.floor(start * sr);
        const s1     = Math.floor(end   * sr);
        const length = s1 - s0;
        if (length <= 0) { await audioCtx.close(); this.trimming = false; return; }

        const trimmed = audioCtx.createBuffer(decoded.numberOfChannels, length, sr);
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
          trimmed.copyToChannel(decoded.getChannelData(ch).slice(s0, s1), ch);
        }
        await audioCtx.close();

        // Substitui o blob atual pelo WAV cortado
        URL.revokeObjectURL(this.audioUrl);
        this.audioBlob = encodeWAV(trimmed);
        this.audioUrl  = URL.createObjectURL(this.audioBlob);
        this.trimRegion = null;

        // Recarrega o waveform com o áudio cortado
        this.ws?.load(this.audioUrl);
      } catch (e) {
        console.error('Erro ao cortar áudio:', e);
      }
      this.trimming = false;
    },

    resetTrim() {
      this.trimRegion = null;
      if (this.ws) Object.values(this.ws.regions.list).forEach(r => r.remove());
    },

    // ── Ações finais ─────────────────────────────────────────────────────────

    discardRecording() {
      this._destroyWaveSurfer();
      if (this.audioUrl) { URL.revokeObjectURL(this.audioUrl); this.audioUrl = ''; }
      this.audioBlob = null; this.audioChunks = []; this.timer = 0;
      this.trimRegion = null; this.wsPlaying = false; this.wsDuration = 0; this.wsCurrentTime = 0;
    },

    downloadRecording() {
      if (!this.audioUrl) return;
      const ext = this.audioBlob?.type?.includes('wav') ? 'wav' : 'webm';
      const a = document.createElement('a');
      a.href = this.audioUrl;
      a.download = `gravacao_${Date.now()}.${ext}`;
      a.click();
    },

    sendToTranscribe() {
      if (!this.audioBlob) return;
      const ext      = this.audioBlob?.type?.includes('wav') ? 'wav' : 'webm';
      const filename = `gravacao_${Date.now()}.${ext}`;
      const file     = new File([this.audioBlob], filename, { type: this.audioBlob.type });
      window.dispatchEvent(new CustomEvent('add-to-transcribe', { detail: { file } }));
      this.discardRecording();
    },
  }));

  // ── Settings Tab ─────────────────────────────────────────────────────────────
  Alpine.data('settingsTab', () => ({
    settings: AppSettings,

    init() {
      // Já inicializado via referência global
    },

    save() {
      saveAllSettings();
      // Feedback visual
      const btn = this.$event.target;
      const originalText = btn.innerHTML;
      btn.innerHTML = '💾 SALVO!';
      btn.classList.replace('btn-primary', 'btn-success');
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.replace('btn-success', 'btn-primary');
      }, 1500);
    },

    async cleanupUploads() {
      const r = await fetch('/api/system/cleanup-uploads', { method: 'POST', headers: authHeaders() });
      if (r.ok) {
        const { removed } = await r.json();
        alert(`🧹 ${removed} arquivo(s) removido(s) de uploads antigos!`);
      }
    },
  }));

  // ── Compilador ───────────────────────────────────────────────────────────
  Alpine.data('compiladorTab', () => ({
    projects: [],
    currentProject: null,
    activeSegmentId: null,
    newProjectName: '',
    newProjectTopic: '',
    newVideoUrl: '',
    isCreating: false,
    isAddingVideo: false,
    isProcessing: false,
    isGeneratingScript: false,
    isCompiling: false,
    scriptWarnings: [],
    availableTransitions: ['none'],
    availableOutputFormats: {},
    availableFrameFitModes: {},
    availableOverlayStyles: {},
    defaultTransition: null,
    jobLogs: [],
    jobProgress: 0,
    compileJobLogs: [],
    compileJobProgress: 0,
    scriptConfig: { min_duration: 60, max_duration: 300 },
    compileConfig: { quality: 'medium', output_format: 'landscape', frame_fit_mode: 'contain' },

    async init() {
      await this.loadProjects();
      try {
        this.availableTransitions = await api.get('/api/transitions');
      } catch (_) {}
      try {
        this.availableOutputFormats = await api.get('/api/output-formats');
      } catch (_) {}
      try {
        this.availableFrameFitModes = await api.get('/api/frame-fit-modes');
      } catch (_) {}
      try {
        this.availableOverlayStyles = await api.get('/api/overlay-styles');
      } catch (_) {}
    },

    initSortable(el) {
      if (typeof Sortable === 'undefined') return;
      Sortable.create(el, {
        animation: 150,
        handle: '.ti-grip-vertical',
        draggable: '.segment-item',
        onEnd: () => {
          const items = el.querySelectorAll('.segment-item');
          const segs = this.currentProject.script.segments;
          const segsById = Object.fromEntries(segs.map(s => [String(s.id), s]));
          const reordered = [];
          items.forEach((item, idx) => {
            const segId = item.dataset.segId;
            const found = segsById[segId];
            if (found) reordered.push(found);
          });
          if (reordered.length === segs.length) {
            // Reset transition_in: first segment has none, others keep their value
            reordered.forEach((seg, idx) => {
              if (idx === 0) seg.transition_in = null;
            });
            this.currentProject.script.segments = reordered;
            this.saveScript();
          }
        },
      });
    },

    async loadProjects() {
      try {
        this.projects = await api.get('/api/projects');
      } catch (_) {}
    },

    async createProject() {
      if (!this.newProjectName.trim()) return;
      this.isCreating = true;
      try {
        const res = await api.post('/api/projects', {
          name: this.newProjectName,
          topic: this.newProjectTopic,
        });
        if (!res.ok) return;
        const p = await res.json();
        this.projects.unshift(p);
        this.newProjectName = '';
        this.newProjectTopic = '';
        this.openProject(p);
      } finally {
        this.isCreating = false;
      }
    },

    async openProject(p) {
      const full = await api.get(`/api/projects/${p.id}`);
      this.currentProject = full;
      this.syncCurrentProjectState();
    },

    async refreshProject() {
      if (!this.currentProject) return;
      const full = await api.get(`/api/projects/${this.currentProject.id}`);
      this.currentProject = full;
      this.syncCurrentProjectState();
    },

    async addVideo() {
      if (!this.newVideoUrl.trim()) return;
      this.isAddingVideo = true;
      try {
        const isUrl = this.newVideoUrl.startsWith('http');
        const body = isUrl
          ? { source_url: this.newVideoUrl }
          : { local_path: this.newVideoUrl };
        const res = await api.post(`/api/projects/${this.currentProject.id}/videos`, body);
        if (res.ok) {
          this.newVideoUrl = '';
          await this.refreshProject();
        }
      } finally {
        this.isAddingVideo = false;
      }
    },

    async removeVideo(videoId) {
      await api.delete(`/api/projects/${this.currentProject.id}/videos/${videoId}`);
      await this.refreshProject();
    },

    async processAll() {
      this.isProcessing = true;
      this.jobLogs = [];
      this.jobProgress = 0;
      try {
        const res = await api.post(`/api/projects/${this.currentProject.id}/process`, {});
        if (!res.ok) {
          this.jobLogs.push('Erro ao iniciar processamento.');
          return;
        }
        const { job_id } = await res.json();
        await new Promise(resolve => {
          const ws = openWs(job_id, msg => {
            if (msg.type === 'log')      this.jobLogs.push(msg.message);
            if (msg.type === 'progress') this.jobProgress = msg.value;
            if (msg.type === 'done' || msg.type === 'error') {
              ws.close();
              resolve();
            }
          });
        });
        await this.refreshProject();
      } finally {
        this.isProcessing = false;
      }
    },

    hasTranscribedVideos() {
      return this.currentProject &&
        this.currentProject.videos &&
        this.currentProject.videos.some(v => v.status === 'transcribed');
    },

    async generateScript() {
      this.isGeneratingScript = true;
      try {
        const { provider, model, config, max_tokens } = getActiveAiConfig();
        const aiConfig = {
          provider,
          model,
          config,
          min_duration: this.scriptConfig.min_duration,
          max_duration: this.scriptConfig.max_duration,
          max_tokens,
        };
        const res = await api.post(
          `/api/projects/${this.currentProject.id}/generate-script`,
          aiConfig,
        );
        if (!res.ok) {
          const err = await res.json();
          alert('Erro ao gerar roteiro: ' + (err.detail || 'Erro desconhecido'));
          return;
        }
        const data = await res.json();
        this.currentProject.script = data.script;
        this.scriptWarnings = data.warnings || [];
        await this.refreshProject();
        this.ensureActiveSegment();
      } finally {
        this.isGeneratingScript = false;
      }
    },

    async saveScript() {
      if (!this.currentProject.script) return;
      await api.post(
        `/api/projects/${this.currentProject.id}/update-script`,
        { script: this.currentProject.script },
      );
    },

    async updateScriptMeta(field, value) {
      if (!this.currentProject?.script) return;
      this.currentProject.script[field] = value;
      await this.saveScript();
    },

    async saveCompileConfig() {
      if (!this.currentProject) return;
      await api.post(`/api/projects/${this.currentProject.id}/update-config`, {
        config: {
          ...((this.currentProject.config) || {}),
          quality: this.compileConfig.quality,
          output_format: this.compileConfig.output_format,
          frame_fit_mode: this.compileConfig.frame_fit_mode,
        },
      });
    },

    async copyScriptMeta() {
      const script = this.currentProject?.script;
      if (!script) return;
      const title = script.title || '';
      const description = script.description || '';
      const text = [title, description].filter(Boolean).join('\n\n');
      try {
        await navigator.clipboard.writeText(text);
        alert('Título e descrição copiados para o clipboard!');
      } catch (_) {
        prompt('Copie o texto abaixo:', text);
      }
    },

    applyTransitionToAll() {
      const segs = this.currentProject?.script?.segments;
      if (!segs) return;
      const t = this.defaultTransition === 'none' ? null : this.defaultTransition;
      segs.forEach((seg, idx) => {
        if (idx > 0) seg.transition_in = t;
      });
      this.saveScript();
    },

    async compile() {
      this.isCompiling = true;
      this.compileJobLogs = [];
      this.compileJobProgress = 0;
      try {
        const res = await api.post(`/api/projects/${this.currentProject.id}/compile`);
        if (!res.ok) {
          const err = await res.json();
          alert('Erro ao compilar: ' + (err.detail || 'Erro desconhecido'));
          return;
        }
        const { job_id } = await res.json();
        await new Promise(resolve => {
          const ws = openWs(job_id, msg => {
            if (msg.type === 'log')      this.compileJobLogs.push(msg.message);
            if (msg.type === 'progress') this.compileJobProgress = msg.value;
            if (msg.type === 'done' || msg.type === 'error') {
              ws.close();
              resolve();
            }
          });
        });
        await this.refreshProject();
        playDoneTone();
      } finally {
        this.isCompiling = false;
      }
    },

    async deleteProject(id) {
      if (!confirm('Excluir este projeto e todos os seus dados?')) return;
      await api.delete(`/api/projects/${id}`);
      this.projects = this.projects.filter(p => p.id !== id);
      if (this.currentProject && this.currentProject.id === id) {
        this.currentProject = null;
      }
    },

    back() {
      this.currentProject = null;
      this.activeSegmentId = null;
      this.jobLogs = [];
      this.jobProgress = 0;
      this.compileJobLogs = [];
      this.compileJobProgress = 0;
      this.loadProjects();
    },

    statusBadge(status) {
      return { draft: 'secondary', processing: 'warning', transcribed: 'info',
               scripted: 'purple', compiling: 'warning', done: 'success', error: 'danger' }[status] || 'secondary';
    },

    videoStatusBadge(status) {
      return { pending: 'secondary', downloading: 'warning', downloaded: 'info',
               transcribing: 'warning', transcribed: 'success', error: 'danger' }[status] || 'secondary';
    },

    videoThumbnail(videoId) {
      if (!videoId || !this.currentProject) return null;
      const vid = (this.currentProject.videos || []).find(v => v.id === videoId);
      if (!vid || !vid.thumbnail_path) return null;
      return `/api/projects/${this.currentProject.id}/videos/${vid.id}/thumbnail`;
    },

    fmtTime(secs) {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    },

    syncCurrentProjectState() {
      const quality = this.currentProject?.config?.quality;
      if (quality) {
        this.compileConfig.quality = quality;
      }
      const outputFormat = this.currentProject?.config?.output_format;
      if (outputFormat) {
        this.compileConfig.output_format = outputFormat;
      }
      const frameFitMode = this.currentProject?.config?.frame_fit_mode;
      if (frameFitMode) {
        this.compileConfig.frame_fit_mode = frameFitMode;
      }
      this.ensureActiveSegment();
    },

    ensureActiveSegment() {
      const segments = this.currentProject?.script?.segments || [];
      if (!segments.length) {
        this.activeSegmentId = null;
        return;
      }
      const stillExists = segments.some(seg => String(seg.id || '') === String(this.activeSegmentId || ''));
      if (!stillExists) {
        const firstSelected = segments.find(seg => seg.selected !== false);
        this.activeSegmentId = String((firstSelected || segments[0]).id || '');
      }
    },

    selectSegment(seg) {
      this.activeSegmentId = String(seg?.id || '');
    },

    activeSegment() {
      const segments = this.currentProject?.script?.segments || [];
      return segments.find(seg => String(seg.id || '') === String(this.activeSegmentId || '')) || null;
    },

    selectedSegments() {
      return (this.currentProject?.script?.segments || []).filter(seg => seg.selected !== false);
    },

    selectedSegmentsCount() {
      return this.selectedSegments().length;
    },

    totalSelectedDuration() {
      return this.selectedSegments().reduce((total, seg) => total + this.clipDuration(seg), 0);
    },

    clipWidthPercent(seg) {
      const total = this.totalSelectedDuration();
      if (!total) return 0;
      return Math.max(8, (this.clipDuration(seg) / total) * 100);
    },

    clipDuration(seg) {
      if (!seg) return 0;
      return Math.max(0, Number(seg.end || 0) - Number(seg.start || 0));
    },

    clampClipTimes(seg) {
      if (!seg) return;
      const minGap = 0.2;
      let start = Math.max(0, Number(seg.start || 0));
      let end = Math.max(0, Number(seg.end || 0));
      if (end <= start) {
        end = start + minGap;
      }
      if (end - start < minGap) {
        end = start + minGap;
      }
      seg.start = Number(start.toFixed(2));
      seg.end = Number(end.toFixed(2));
    },

    updateSegmentTime(field, rawValue) {
      const seg = this.activeSegment();
      if (!seg) return;
      const value = Number(rawValue);
      if (Number.isNaN(value)) return;
      seg[field] = value;
      this.clampClipTimes(seg);
      this.saveScript();
    },

    nudgeSegmentTime(field, delta) {
      const seg = this.activeSegment();
      if (!seg) return;
      const current = Number(seg[field] || 0);
      seg[field] = current + delta;
      this.clampClipTimes(seg);
      this.saveScript();
    },

    fmtDuration(secs) {
      const total = Math.max(0, Math.round(Number(secs || 0)));
      const m = Math.floor(total / 60);
      const s = total % 60;
      if (m >= 60) {
        const h = Math.floor(m / 60);
        const rm = m % 60;
        return `${h}h ${String(rm).padStart(2, '0')}m`;
      }
      return `${m}m ${String(s).padStart(2, '0')}s`;
    },

    clipScore(seg, idx = 0) {
      if (!seg) return 0;
      const duration = this.clipDuration(seg);
      const hasReason = (seg.reason || '').trim().length > 0 ? 7 : 0;
      const hasOverlay = (seg.text_overlay || '').trim().length > 0 ? 4 : 0;
      const selectedBonus = seg.selected !== false ? 8 : 0;
      const durationWindow = Math.max(0, 28 - Math.abs(32 - duration));
      const rankBonus = Math.max(0, 18 - idx * 2);
      return Math.min(99, 42 + hasReason + hasOverlay + selectedBonus + durationWindow + rankBonus);
    },

    clipScoreTone(score) {
      if (score >= 80) return 'success';
      if (score >= 68) return 'warning';
      return 'secondary';
    },

    clipEnergyLabel(score) {
      if (score >= 80) return 'Alta chance';
      if (score >= 68) return 'Bom potencial';
      return 'Precisa revisar';
    },

    projectStatCards() {
      const videos = this.currentProject?.videos || [];
      const processed = videos.filter(v => v.status === 'transcribed').length;
      const segments = this.currentProject?.script?.segments || [];
      return [
        {
          label: 'Fontes',
          value: String(videos.length),
          meta: processed ? `${processed} transcritos` : 'Aguardando ingestao',
        },
        {
          label: 'Clips',
          value: String(this.selectedSegmentsCount()),
          meta: segments.length ? `${segments.length} sugeridos pela IA` : 'Sem roteiro ainda',
        },
        {
          label: 'Duracao',
          value: this.fmtDuration(this.totalSelectedDuration()),
          meta: 'Tempo total selecionado',
        },
      ];
    },

    sourceVideoForSegment(seg) {
      if (!seg) return null;
      return (this.currentProject?.videos || []).find(v => v.id === seg.video_id) || null;
    },

    sourceVideoLabel(seg) {
      const video = this.sourceVideoForSegment(seg);
      return video?.title || video?.source_url || video?.local_path || 'Fonte original';
    },

    sourceVideoMediaUrl(seg) {
      const video = this.sourceVideoForSegment(seg);
      if (!video || !this.currentProject) return null;
      const start = Number(seg?.start || 0);
      const end = Number(seg?.end || 0);
      return `/api/projects/${this.currentProject.id}/videos/${video.id}/media#t=${start},${end}`;
    },

    clipDownloadUrl(seg) {
      if (!seg || !this.currentProject || !seg.id) return '#';
      return `/api/projects/${this.currentProject.id}/clips/${seg.id}/download`;
    },

    selectedClipsZipUrl() {
      if (!this.currentProject) return '#';
      return `/api/projects/${this.currentProject.id}/clips/export`;
    },

    previewStageClass() {
      return this.compileConfig.output_format === 'portrait' ? 'is-portrait' : 'is-landscape';
    },

    outputFormatLabel() {
      const key = this.compileConfig.output_format || 'landscape';
      const format = this.availableOutputFormats?.[key];
      return format ? `${format.label} · ${format.aspect_ratio}` : key;
    },

    async applyOutputPreset(preset) {
      const presets = {
        youtube: { output_format: 'landscape', frame_fit_mode: 'contain', quality: 'high' },
        shorts: { output_format: 'portrait', frame_fit_mode: 'cover', quality: 'high' },
        reels: { output_format: 'portrait', frame_fit_mode: 'blur', quality: 'medium' },
      };
      const config = presets[preset];
      if (!config) return;
      this.compileConfig.output_format = config.output_format;
      this.compileConfig.frame_fit_mode = config.frame_fit_mode;
      this.compileConfig.quality = config.quality;
      await this.saveCompileConfig();
    },
  }));

  // ── Root App ─────────────────────────────────────────────────────────────
  Alpine.data('rootApp', () => ({
    tab: 'transcribe',
    dark: false,
    device: null,
    gpuName: null,
    vramMb: null,

    async init() {
      const savedTheme = localStorage.getItem('pixelTheme');
      if (savedTheme) {
        this.dark = (savedTheme === 'dark');
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        this.dark = true;
      }
      document.documentElement.setAttribute('data-bs-theme', this.dark ? 'dark' : 'light');

      window.addEventListener('add-to-transcribe', () => { this.tab = 'transcribe'; });
      window.addEventListener('send-to-ia', () => { this.tab = 'documents'; });
      try {
        const info = await api.get('/api/system-info');
        this.device  = info.device;
        this.gpuName = info.gpu_name;
        this.vramMb  = info.vram_mb;
        AppSettings.whisper.device = (info.device === 'cuda') ? 'cuda' : 'cpu';
        saveAllSettings();
      } catch (_) {}
    },

    tabLabel() {
      return {
        transcribe: 'Transcrever',
        record: 'Gravar',
        history: 'Historico',
        documents: 'Documentos IA',
        settings: 'Configuracoes',
        compilador: 'Compilador',
      }[this.tab] || this.tab;
    },

    toggleDark() {
      this.dark = !this.dark;
      document.documentElement.setAttribute('data-bs-theme', this.dark ? 'dark' : 'light');
      localStorage.setItem('pixelTheme', this.dark ? 'dark' : 'light');
    },
  }));

});
