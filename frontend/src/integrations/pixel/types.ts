export interface PixelVideo {
  id: string;
  project_id: string;
  source_url?: string;
  local_path?: string;
  title?: string;
  duration?: number | null;
  thumbnail_path?: string | null;
  status?: string;
  transcription?: Array<{
    start?: number;
    end?: number;
    text?: string;
    speaker?: string;
  }> | null;
}

export interface PixelSegment {
  id: string;
  label?: string;
  video_id?: string;
  start?: number;
  end?: number;
  selected?: boolean;
  timeline_start?: number;
  track?: number;
  reason?: string;
  text_overlay?: string;
}

export interface PixelMediaAsset {
  id: string;
  video_id: string;
  label?: string;
  start?: number;
  duration?: number;
  track?: number;
}

export interface PixelScript {
  title?: string;
  description?: string;
  segments?: PixelSegment[];
  media_assets?: PixelMediaAsset[];
  narration_plan?: Array<Record<string, unknown>>;
  viral_markers?: Array<Record<string, unknown>>;
}

export interface PixelProject {
  id: string;
  name: string;
  topic?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  config?: Record<string, unknown>;
  script?: PixelScript | null;
  videos?: PixelVideo[];
  output_path?: string | null;
}

export interface PixelJobStatus {
  job_id: string;
  status: string;
  progress: number;
  logs: string[];
  result?: unknown;
  error?: string | null;
  cancelled?: boolean;
}

export interface PixelDocumentRevision {
  id: string;
  document_id: string;
  revision_number: number;
  title: string;
  content: string;
  template_key?: string;
  provider?: string;
  model?: string;
  prompt_observation?: string;
  created_at?: string;
}

export interface PixelGeneratedDocument {
  id: string;
  project_id: string;
  title: string;
  content: string;
  template_key?: string;
  provider?: string;
  model?: string;
  prompt_observation?: string;
  source_history_ids?: string[];
  source_files?: Array<Record<string, unknown>>;
  created_at?: string;
  updated_at?: string;
  revisions?: PixelDocumentRevision[];
}

export interface PixelBacklogItem {
  id: string;
  project_id: string;
  source_document_id?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  order_idx?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PixelDocumentProject {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  documents?: PixelGeneratedDocument[];
  documents_count?: number;
  backlog_items?: PixelBacklogItem[];
}

export interface PixelTemplate {
  key: string;
  label: string;
  description?: string;
}

export interface PixelMediaLibraryEntry {
  name: string;
  path: string;
  size_bytes: number;
  modified_at: number;
}

export interface PixelMediaLibrary {
  directories: {
    root: string;
    intro: string;
    music: string;
  };
  intros: PixelMediaLibraryEntry[];
  music: PixelMediaLibraryEntry[];
  free_sources: Array<{
    id: string;
    label: string;
    site_url: string;
    license?: string;
    best_for?: string;
  }>;
}

export interface PixelYouTubeStatus {
  connected: boolean;
  has_client_secrets: boolean;
  client_secrets_path: string;
  token_path: string;
  channel_title?: string | null;
  channel_id?: string | null;
}

export interface PixelSystemDeps {
  ffmpeg: {
    available: boolean;
    version?: string | null;
  };
  gpu: {
    device: "cpu" | "cuda" | string;
    name?: string | null;
    vram_mb?: number | null;
  };
}

export interface PixelAiStatus {
  connected: boolean;
  models: string[];
}

export interface PixelAiKeyState {
  has_key: boolean;
  source: "env" | "settings" | "none" | string;
}

export interface PixelAiKeysSettings {
  gemini: PixelAiKeyState;
  openai: PixelAiKeyState;
}

export interface PixelChannelPreset {
  id: string;
  name: string;
  config: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface PixelHistoryItem {
  id: string;
  filename: string;
  filepath: string;
  created_at: string;
  size_bytes: number;
  content?: string;
}

export interface PixelYouTubeUpload {
  url?: string;
  video_id?: string;
  title?: string;
  [key: string]: unknown;
}

export interface PixelYouTubeConfig {
  title?: string;
  description?: string;
  tags?: string[];
  hashtags?: string[];
  pinned_comment?: string;
  intro_hook?: string;
  privacy_status?: string;
  category_id?: string;
  made_for_kids?: boolean;
  notify_subscribers?: boolean;
  last_upload?: PixelYouTubeUpload | null;
}

export interface PixelTranscriptionRequest {
  model: string;
  language: string;
  beam_size: number;
  batch_size: number;
  diarize: boolean;
  num_speakers: number;
  auto_detect_speakers: boolean;
  speaker_names: Record<string, string>;
  output_format: "txt" | "srt" | "ambos";
}

export interface PixelTranscriptionResult {
  job_id: string;
  history_ids: string[];
  files: string[];
}

/** Segments returned by the editor transcription endpoint */
export interface PixelEditorTranscriptionSegment {
  text: string;
  start: number;
  end: number;
}

/** Result of editor transcription - compatible with TranscriptionResult */
export interface PixelEditorTranscriptionResult {
  text: string;
  segments: PixelEditorTranscriptionSegment[];
  language: string;
  detected_language?: string | null;
}

/** Request options for editor transcription */
export interface PixelEditorTranscriptionRequest {
  model?: string;
  language?: string;
  beam_size?: number;
  batch_size?: number;
}

export interface PixelDownloadResult {
  job_id: string;
  filepath?: string;
  filename?: string;
}
