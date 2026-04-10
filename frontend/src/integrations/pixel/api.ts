import type {
  PixelAiStatus,
  PixelAiKeysSettings,
  PixelChannelPreset,
  PixelDocumentProject,
  PixelDownloadResult,
  PixelEditorTranscriptionResult,
  PixelGeneratedDocument,
  PixelHistoryItem,
  PixelJobStatus,
  PixelMediaLibrary,
  PixelProject,
  PixelSystemDeps,
  PixelTemplate,
  PixelTranscriptionRequest,
  PixelTranscriptionResult,
  PixelYouTubeConfig,
  PixelYouTubeStatus,
} from "./types";

const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    return "/api/pixel-proxy";
  }

  const envValue = process.env.NEXT_PUBLIC_PIXEL_API_BASE_URL?.trim();
  if (envValue) {
    return envValue.replace(/\/$/, "");
  }
  return "http://127.0.0.1:8000";
};

const PIXEL_API_BASE_URL = getBaseUrl();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PIXEL_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function requestFormData<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const response = await fetch(`${PIXEL_API_BASE_URL}${path}`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

type CreateProjectPayload = {
  name: string;
  topic?: string;
  config?: Record<string, unknown>;
};

type AddVideoPayload = {
  source_url?: string;
  local_path?: string;
  title?: string;
};

type ProcessProjectPayload = {
  model?: string;
  language?: string;
  beam_size?: number;
  diarize?: boolean;
};

type GenerateYouTubePackagePayload = {
  model: string;
  provider: string;
  config?: Record<string, unknown>;
  max_tokens?: number | null;
};

type PublishToYouTubePayload = {
  title?: string;
  description?: string;
  tags?: string[];
  privacy_status?: string;
  category_id?: string;
  made_for_kids?: boolean;
  notify_subscribers?: boolean;
};

type GenerateScriptPayload = {
  model: string;
  provider: string;
  config?: Record<string, unknown>;
  max_duration?: number;
  min_duration?: number;
  max_tokens?: number | null;
};

type CreateDocumentProjectPayload = {
  name: string;
  description?: string;
};

type SaveDocumentPayload = {
  project_id: string;
  title: string;
  content: string;
  template_key?: string;
  provider?: string;
  model?: string;
  prompt_observation?: string;
  source_history_ids?: string[];
  source_files?: Array<Record<string, unknown>>;
};

export const pixelApi = {
  baseUrl: PIXEL_API_BASE_URL,
  createProject: (payload: CreateProjectPayload) =>
    request<PixelProject>("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        topic: payload.topic ?? "",
        config: payload.config ?? {},
      }),
    }),
  addVideoToProject: (projectId: string, payload: AddVideoPayload) =>
    request<PixelProject["videos"] extends (infer V)[] ? V : unknown>(
      `/api/projects/${projectId}/videos`,
      {
        method: "POST",
        body: JSON.stringify({
          source_url: payload.source_url ?? "",
          local_path: payload.local_path ?? "",
          title: payload.title ?? "",
        }),
      },
    ),
  uploadFile: async (file: File | File[]) => {
    const formData = new FormData();
    const files = Array.isArray(file) ? file : [file];
    files.forEach((entry) => {
      formData.append("files", entry);
    });
    return await requestFormData<{ paths: string[] }>("/api/upload", formData);
  },
  removeVideoFromProject: (projectId: string, videoId: string) =>
    request<void>(`/api/projects/${projectId}/videos/${videoId}`, {
      method: "DELETE",
    }),
  cancelJob: (jobId: string) =>
    request<{ cancelled: boolean }>(`/api/jobs/${jobId}`, {
      method: "DELETE",
    }),
  listProjects: () => request<PixelProject[]>("/api/projects"),
  getProject: (projectId: string) =>
    request<PixelProject>(`/api/projects/${projectId}`),
  syncEditorState: (
    projectId: string,
    payload: {
      name?: string;
      editor_state?: Record<string, unknown>;
    },
  ) =>
    request<PixelProject>(`/api/projects/${projectId}/sync-editor-state`, {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        editor_state: payload.editor_state ?? {},
      }),
    }),
  getAiDefaults: () =>
    request<{
      preferred_provider: string;
      preferred_model: string;
      source?: string;
    }>("/api/ai/defaults"),
  getAiKeysSettings: () =>
    request<PixelAiKeysSettings>("/api/settings/ai-keys"),
  updateAiKeysSettings: (payload: {
    gemini_api_key?: string | null;
    openai_api_key?: string | null;
  }) =>
    request<PixelAiKeysSettings>("/api/settings/ai-keys", {
      method: "POST",
      body: JSON.stringify({
        gemini_api_key: payload.gemini_api_key ?? null,
        openai_api_key: payload.openai_api_key ?? null,
      }),
    }),
  listDocumentProjects: () =>
    request<PixelDocumentProject[]>("/api/document-projects"),
  getMediaLibrary: () => request<PixelMediaLibrary>("/api/media-library"),
  updateMediaLibraryPath: (rootDir: string) =>
    request<PixelMediaLibrary>("/api/settings/media-library", {
      method: "POST",
      body: JSON.stringify({ root_dir: rootDir }),
    }),
  getYouTubeStatus: () => request<PixelYouTubeStatus>("/api/youtube/status"),
  connectYouTube: () =>
    request<Record<string, unknown>>("/api/youtube/connect", {
      method: "POST",
    }),
  disconnectYouTube: () =>
    request<Record<string, unknown>>("/api/youtube/disconnect", {
      method: "POST",
    }),
  listEditorPresets: () =>
    request<Record<string, Record<string, unknown>>>("/api/editor-presets"),
  listChannelPresets: () =>
    request<PixelChannelPreset[]>("/api/channel-presets"),
  createDocumentProject: (payload: CreateDocumentProjectPayload) =>
    request<PixelDocumentProject>("/api/document-projects", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        description: payload.description ?? "",
      }),
    }),
  getDocumentProject: (projectId: string) =>
    request<PixelDocumentProject>(`/api/document-projects/${projectId}`),
  deleteDocumentProject: (projectId: string) =>
    request<void>(`/api/document-projects/${projectId}`, {
      method: "DELETE",
    }),
  createDocument: (projectId: string, payload: SaveDocumentPayload) =>
    request<PixelGeneratedDocument>(
      `/api/document-projects/${projectId}/documents`,
      {
        method: "POST",
        body: JSON.stringify({
          project_id: payload.project_id,
          title: payload.title,
          content: payload.content,
          template_key: payload.template_key ?? "",
          provider: payload.provider ?? "",
          model: payload.model ?? "",
          prompt_observation: payload.prompt_observation ?? "",
          source_history_ids: payload.source_history_ids ?? [],
          source_files: payload.source_files ?? [],
        }),
      },
    ),
  getDocument: (documentId: string) =>
    request<PixelGeneratedDocument>(`/api/documents/${documentId}`),
  updateDocument: (
    documentId: string,
    payload: Omit<SaveDocumentPayload, "project_id">,
  ) =>
    request<PixelGeneratedDocument>(`/api/documents/${documentId}/update`, {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        content: payload.content,
        template_key: payload.template_key ?? "",
        provider: payload.provider ?? "",
        model: payload.model ?? "",
        prompt_observation: payload.prompt_observation ?? "",
        source_history_ids: payload.source_history_ids ?? [],
        source_files: payload.source_files ?? [],
      }),
    }),
  deleteDocument: (documentId: string) =>
    request<void>(`/api/documents/${documentId}`, {
      method: "DELETE",
    }),
  generateBacklog: (
    documentId: string,
    payload: {
      model: string;
      provider: string;
      config?: Record<string, unknown>;
      max_tokens?: number | null;
    },
  ) =>
    request<{ items: Array<Record<string, unknown>> }>(
      `/api/documents/${documentId}/generate-backlog`,
      {
        method: "POST",
        body: JSON.stringify({
          model: payload.model,
          provider: payload.provider,
          config: payload.config ?? {},
          max_tokens: payload.max_tokens ?? null,
        }),
      },
    ),
  listTemplates: () => request<PixelTemplate[]>("/api/templates"),
  uploadMediaLibraryFile: async ({
    kind,
    file,
  }: {
    kind: "intro" | "music";
    file: File;
  }) => {
    const formData = new FormData();
    formData.append("kind", kind);
    formData.append("file", file);
    return await requestFormData<PixelMediaLibrary>(
      "/api/media-library/upload",
      formData,
    );
  },
  uploadYouTubeCredentials: async ({ file }: { file: File }) => {
    const formData = new FormData();
    formData.append("file", file);
    return await requestFormData<Record<string, unknown>>(
      "/api/youtube/credentials",
      formData,
    );
  },
  getJob: (jobId: string) => request<PixelJobStatus>(`/api/jobs/${jobId}`),
  downloadSource: (projectId: string, sourceUrl: string) =>
    request<{ job_id: string }>(`/api/projects/${projectId}/download-source`, {
      method: "POST",
      body: JSON.stringify({ source_url: sourceUrl }),
    }),
  processProject: (projectId: string, payload: ProcessProjectPayload = {}) =>
    request<{ job_id: string }>(`/api/projects/${projectId}/process`, {
      method: "POST",
      body: JSON.stringify({
        model: payload.model ?? "small",
        language: payload.language ?? "auto",
        beam_size: payload.beam_size ?? 1,
        diarize: payload.diarize ?? false,
      }),
    }),
  generateScript: (projectId: string, payload: GenerateScriptPayload) =>
    request<{ script: Record<string, unknown>; warnings?: string[] }>(
      `/api/projects/${projectId}/generate-script`,
      {
        method: "POST",
        body: JSON.stringify({
          model: payload.model,
          provider: payload.provider,
          config: payload.config ?? {},
          max_duration: payload.max_duration ?? 300,
          min_duration: payload.min_duration ?? 60,
          max_tokens: payload.max_tokens ?? null,
        }),
      },
    ),
  compileProject: (projectId: string) =>
    request<{ job_id: string }>(`/api/projects/${projectId}/compile`, {
      method: "POST",
    }),
  deleteProject: (projectId: string) =>
    request<void>(`/api/projects/${projectId}`, {
      method: "DELETE",
    }),
  videoMediaUrl: (projectId: string, videoId: string) =>
    `${PIXEL_API_BASE_URL}/api/projects/${projectId}/videos/${videoId}/media`,
  videoThumbnailUrl: (projectId: string, videoId: string) =>
    `${PIXEL_API_BASE_URL}/api/projects/${projectId}/videos/${videoId}/thumbnail`,
  downloadProjectUrl: (projectId: string) =>
    `${PIXEL_API_BASE_URL}/api/projects/${projectId}/download`,
  exportDocumentProjectUrl: (projectId: string) =>
    `${PIXEL_API_BASE_URL}/api/document-projects/${projectId}/export`,
  exportDocumentUrl: (documentId: string) =>
    `${PIXEL_API_BASE_URL}/api/documents/${documentId}/export`,
  exportSrtUrl: (projectId: string) =>
    `${PIXEL_API_BASE_URL}/api/projects/${projectId}/export-srt`,
  selectedClipsExportUrl: (projectId: string) =>
    `${PIXEL_API_BASE_URL}/api/projects/${projectId}/clips/export`,
  clipDownloadUrl: (projectId: string, clipId: string) =>
    `${PIXEL_API_BASE_URL}/api/projects/${projectId}/clips/${clipId}/download`,
  generateYouTubePackage: (
    projectId: string,
    payload: GenerateYouTubePackagePayload,
  ) =>
    request<{ script: Record<string, unknown>; youtube: PixelYouTubeConfig }>(
      `/api/projects/${projectId}/generate-youtube-package`,
      {
        method: "POST",
        body: JSON.stringify({
          model: payload.model,
          provider: payload.provider,
          config: payload.config ?? {},
          max_tokens: payload.max_tokens ?? null,
        }),
      },
    ),
  publishToYouTube: (projectId: string, payload: PublishToYouTubePayload) =>
    request<{ job_id: string }>(`/api/projects/${projectId}/youtube/publish`, {
      method: "POST",
      body: JSON.stringify({
        title: payload.title ?? null,
        description: payload.description ?? null,
        tags: payload.tags ?? null,
        privacy_status: payload.privacy_status ?? "private",
        category_id: payload.category_id ?? "22",
        made_for_kids: payload.made_for_kids ?? false,
        notify_subscribers: payload.notify_subscribers ?? false,
      }),
    }),
  getSystemDeps: () => request<PixelSystemDeps>("/api/system/deps"),
  getAiStatus: (provider: string, config: Record<string, unknown> = {}) =>
    request<PixelAiStatus>(
      `/api/ai/status?provider=${encodeURIComponent(provider)}&config=${encodeURIComponent(JSON.stringify(config))}`,
    ),
  createChannelPreset: (payload: { name: string; config?: Record<string, unknown> }) =>
    request<PixelChannelPreset>("/api/channel-presets", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        config: payload.config ?? {},
      }),
    }),
  deleteChannelPreset: (presetId: string) =>
    request<void>(`/api/channel-presets/${presetId}`, { method: "DELETE" }),
  listHistory: () => request<PixelHistoryItem[]>("/api/history"),
  getHistoryItem: (recordId: string) =>
    request<PixelHistoryItem>(`/api/history/${recordId}`),
  deleteHistoryItem: (recordId: string, deleteFile: boolean = false) =>
    request<void>(`/api/history/${recordId}?delete_file=${deleteFile}`, {
      method: "DELETE",
    }),
  deleteHistoryItems: (recordIds: string[]) =>
    request<{
      requested: number;
      deleted: number;
      deleted_ids: string[];
      failed: Array<{ id: string; reason: string }>;
    }>("/api/history/delete-batch", {
      method: "POST",
      body: JSON.stringify({ record_ids: recordIds }),
    }),
  exportHistoryUrl: () => `${PIXEL_API_BASE_URL}/api/history/export`,
  downloadUrl: (url: string, audioOnly: boolean = true) =>
    request<{ job_id: string }>("/api/download", {
      method: "POST",
      body: JSON.stringify({
        url,
        audio_only: audioOnly,
      }),
    }),
  transcribeFiles: (files: string[], config: PixelTranscriptionRequest) =>
    request<{ job_id: string }>("/api/transcribe", {
      method: "POST",
      body: JSON.stringify({
        files,
        model: config.model,
        language: config.language,
        beam_size: config.beam_size,
        batch_size: config.batch_size,
        diarize: config.diarize,
        num_speakers: config.num_speakers,
        auto_detect_speakers: config.auto_detect_speakers,
        speaker_names: config.speaker_names,
        output_format: config.output_format,
      }),
    }),
  transcribeUrl: (
    url: string,
    config: PixelTranscriptionRequest,
  ) =>
    request<{ job_id: string }>("/api/transcribe-url", {
      method: "POST",
      body: JSON.stringify({
        url,
        audio_only: true,
        model: config.model,
        language: config.language,
        beam_size: config.beam_size,
        batch_size: config.batch_size,
        diarize: config.diarize,
        num_speakers: config.num_speakers,
        auto_detect_speakers: config.auto_detect_speakers,
        speaker_names: config.speaker_names,
        output_format: config.output_format,
      }),
    }),
  saveRecordingToHistory: (recording: {
    filepath: string;
    filename: string;
    content: string;
  }) =>
    request<PixelHistoryItem>("/api/history/recording", {
      method: "POST",
      body: JSON.stringify(recording),
    }),
  saveTextTranscription: (text: {
    filename: string;
    content: string;
  }) =>
    request<PixelHistoryItem>("/api/history/text", {
      method: "POST",
      body: JSON.stringify(text),
    }),
  /**
   * Transcribe audio from the OpenCut editor timeline.
   * Accepts a WAV audio blob and returns transcription segments for caption generation.
   */
  transcribeEditorAudio: async (audioBlob: Blob, config: {
    model?: string;
    language?: string;
    beam_size?: number;
    batch_size?: number;
  } = {}) => {
    const formData = new FormData();
    formData.append("audio_file", audioBlob, "editor_audio.wav");
    formData.append("model", config.model ?? "small");
    formData.append("language", config.language ?? "auto");
    formData.append("beam_size", String(config.beam_size ?? 1));
    formData.append("batch_size", String(config.batch_size ?? 16));

    const response = await fetch(`${PIXEL_API_BASE_URL}/api/editor/transcribe`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed with status ${response.status}`);
    }

    return await response.json() as PixelEditorTranscriptionResult;
  },
};
