"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Header } from "@/components/header";
import { AlertCircle, X } from "lucide-react";
import { pixelApi } from "@/integrations/pixel/api";
import type {
  PixelAiKeysSettings,
  PixelAiStatus,
  PixelChannelPreset,
  PixelMediaLibrary,
  PixelSystemDeps,
  PixelYouTubeStatus,
} from "@/integrations/pixel/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "ai" | "system" | "youtube" | "media" | "presets";

const TABS: { id: Tab; label: string }[] = [
  { id: "ai", label: "AI Providers" },
  { id: "system", label: "System" },
  { id: "youtube", label: "YouTube" },
  { id: "media", label: "Media Library" },
  { id: "presets", label: "Presets" },
];

type AiProviderDef = {
  id: string;
  label: string;
  local: boolean;
  defaultUrl?: string;
  note?: string;
};

const AI_PROVIDERS: AiProviderDef[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    local: false,
    note: "Key can come from environment variable or Settings.",
  },
  {
    id: "openai",
    label: "OpenAI",
    local: false,
    note: "Key can come from environment variable or Settings.",
  },
  {
    id: "lm_studio",
    label: "LM Studio",
    local: true,
    defaultUrl: "http://localhost:1234",
  },
  {
    id: "ollama",
    label: "Ollama",
    local: true,
    defaultUrl: "http://localhost:11434",
  },
  {
    id: "zai",
    label: "Zai",
    local: true,
    defaultUrl: "http://localhost:8080",
  },
];

const QUALITY_OPTIONS = ["low", "medium", "high"];
const FORMAT_OPTIONS = ["landscape", "portrait", "square"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value?: number) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value * 1000));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground/80 ${className || ""}`}
    >
      {children}
    </div>
  );
}

function SubHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`text-xs font-bold uppercase tracking-widest text-muted-foreground/70 mb-4 ${className || ""}`}
    >
      {children}
    </h3>
  );
}

function StatusBadge({
  ok,
  label,
  warning,
}: {
  ok: boolean;
  label?: string;
  warning?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={
        ok
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
          : warning
            ? "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400"
            : "text-muted-foreground"
      }
    >
      {label ?? (ok ? "Connected" : "Not connected")}
    </Badge>
  );
}

// ─── AI Provider card ─────────────────────────────────────────────────────────

function AiProviderCard({
  provider,
  aiDefaults,
}: {
  provider: AiProviderDef;
  aiDefaults: { preferred_provider: string; preferred_model: string } | null;
}) {
  const [url, setUrl] = useState(provider.defaultUrl ?? "");
  const [status, setStatus] = useState<PixelAiStatus | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const isDefault = aiDefaults?.preferred_provider === provider.id;

  const handleTest = async () => {
    setIsTesting(true);
    setTestError(null);
    try {
      const config = provider.local && url ? { base_url: url } : {};
      const result = await pixelApi.getAiStatus(provider.id, config);
      setStatus(result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Connection failed");
      setStatus({ connected: false, models: [] });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/70 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{provider.label}</span>
          {isDefault && (
            <Badge variant="outline" className="text-xs">
              Default
            </Badge>
          )}
        </div>
        {status ? (
          <StatusBadge ok={status.connected} />
        ) : (
          <StatusBadge ok={false} warning label="Not Tested" />
        )}
      </div>

      {provider.local && (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">
            Base URL
          </Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={provider.defaultUrl}
            className="h-9 text-sm bg-muted/20"
          />
        </div>
      )}

      {provider.note && (
        <div className="text-[11px] leading-relaxed text-muted-foreground/80 italic">
          Tip: {provider.note}
        </div>
      )}

      {status?.connected && status.models.length > 0 && (
        <div className="space-y-2">
          <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-tight">
            Available Models
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {status.models.slice(0, 8).map((m) => (
              <Badge
                key={m}
                variant="secondary"
                className="text-[10px] font-mono py-0 px-1.5"
              >
                {m}
              </Badge>
            ))}
            {status.models.length > 8 && (
              <Badge
                variant="outline"
                className="text-[10px] text-muted-foreground"
              >
                +{status.models.length - 8} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {testError && (
        <div className="text-xs font-medium text-destructive/90">
          {testError}
        </div>
      )}

      <div className="pt-1 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={handleTest}
          disabled={isTesting}
          className="gap-2"
        >
          {isTesting ? "Testing..." : "Test Connection"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export function PixelSettingsShell() {
  const [activeTab, setActiveTab] = useState<Tab>("ai");

  // Data
  const [mediaLibrary, setMediaLibrary] = useState<PixelMediaLibrary | null>(
    null,
  );
  const [youtubeStatus, setYouTubeStatus] = useState<PixelYouTubeStatus | null>(
    null,
  );
  const [editorPresets, setEditorPresets] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [channelPresets, setChannelPresets] = useState<PixelChannelPreset[]>(
    [],
  );
  const [systemDeps, setSystemDeps] = useState<PixelSystemDeps | null>(null);
  const [aiDefaults, setAiDefaults] = useState<{
    preferred_provider: string;
    preferred_model: string;
    source?: string;
  } | null>(null);
  const [aiKeys, setAiKeys] = useState<PixelAiKeysSettings | null>(null);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState("");
  const [openAiApiKeyInput, setOpenAiApiKeyInput] = useState("");
  const [isSavingAiKeys, setIsSavingAiKeys] = useState(false);

  // Loading / error
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // YouTube actions
  const [isUploadingYoutube, setIsUploadingYoutube] = useState(false);
  const [isConnectingYoutube, setIsConnectingYoutube] = useState(false);

  // Media library uploads
  const [isUploadingIntro, setIsUploadingIntro] = useState(false);
  const [isUploadingMusic, setIsUploadingMusic] = useState(false);

  // Media library path configuration
  const [isUpdatingLibraryPath, setIsUpdatingLibraryPath] = useState(false);
  const [libraryPathError, setLibraryPathError] = useState<string | null>(null);
  const [editedLibraryPath, setEditedLibraryPath] = useState("");
  const [showEditLibraryPath, setShowEditLibraryPath] = useState(false);

  // Channel preset create form
  const [presetName, setPresetName] = useState("");
  const [presetQuality, setPresetQuality] = useState("medium");
  const [presetFormat, setPresetFormat] = useState("landscape");
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [isDeletingPreset, setIsDeletingPreset] = useState<string | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);

  // File input refs
  const introInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const ytCredsInputRef = useRef<HTMLInputElement>(null);

  // ─── Load ─────────────────────────────────────────────────────────────────

  const loadAll = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [library, youtube, presets, channels, deps, defaults, keys] =
        await Promise.all([
          pixelApi.getMediaLibrary(),
          pixelApi.getYouTubeStatus(),
          pixelApi.listEditorPresets(),
          pixelApi.listChannelPresets(),
          pixelApi.getSystemDeps(),
          pixelApi.getAiDefaults(),
          pixelApi.getAiKeysSettings(),
        ]);
      setMediaLibrary(library);
      setYouTubeStatus(youtube);
      setEditorPresets(presets);
      setChannelPresets(channels);
      setSystemDeps(deps);
      setAiDefaults(defaults);
      setAiKeys(keys);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to load settings",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleUploadLibrary = async (kind: "intro" | "music", file: File) => {
    if (kind === "intro") setIsUploadingIntro(true);
    if (kind === "music") setIsUploadingMusic(true);
    setError(null);
    try {
      const library = await pixelApi.uploadMediaLibraryFile({ kind, file });
      setMediaLibrary(library);
    } catch (nextError) {
      let errorMsg = "Upload failed";
      if (nextError instanceof Error) {
        if (nextError.message.includes("413")) {
          errorMsg = "File is too large. Please use a smaller file.";
        } else if (nextError.message.includes("415")) {
          errorMsg =
            "Unsupported file type. Please use MP3, WAV, or OGG audio files.";
        } else if (nextError.message.includes("500")) {
          errorMsg = "Server error while uploading. Please try again.";
        } else {
          errorMsg = nextError.message;
        }
      }
      setError(errorMsg);
    } finally {
      if (kind === "intro") setIsUploadingIntro(false);
      if (kind === "music") setIsUploadingMusic(false);
    }
  };

  const handleUpdateLibraryPath = async () => {
    if (!editedLibraryPath.trim()) return;
    setIsUpdatingLibraryPath(true);
    setLibraryPathError(null);
    setError(null);
    try {
      const library = await pixelApi.updateMediaLibraryPath(
        editedLibraryPath.trim(),
      );
      setMediaLibrary(library);
      setShowEditLibraryPath(false);
      setEditedLibraryPath("");
    } catch (nextError) {
      const errorMsg =
        nextError instanceof Error
          ? nextError.message
          : "Failed to update library path";
      setLibraryPathError(errorMsg);
    } finally {
      setIsUpdatingLibraryPath(false);
    }
  };

  const handleUploadYouTubeCredentials = async (file: File) => {
    setIsUploadingYoutube(true);
    setError(null);
    try {
      await pixelApi.uploadYouTubeCredentials({ file });
      setYouTubeStatus(await pixelApi.getYouTubeStatus());
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to upload credentials",
      );
    } finally {
      setIsUploadingYoutube(false);
    }
  };

  const handleConnectYouTube = async () => {
    setIsConnectingYoutube(true);
    setError(null);
    try {
      await pixelApi.connectYouTube();
      setYouTubeStatus(await pixelApi.getYouTubeStatus());
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to connect YouTube",
      );
    } finally {
      setIsConnectingYoutube(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    setError(null);
    try {
      await pixelApi.disconnectYouTube();
      setYouTubeStatus(await pixelApi.getYouTubeStatus());
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to disconnect YouTube",
      );
    }
  };

  const handleCreatePreset = async () => {
    if (!presetName.trim()) return;
    setIsCreatingPreset(true);
    setPresetError(null);
    try {
      const preset = await pixelApi.createChannelPreset({
        name: presetName.trim(),
        config: { quality: presetQuality, output_format: presetFormat },
      });
      setChannelPresets((prev) => [preset as PixelChannelPreset, ...prev]);
      setPresetName("");
    } catch (err) {
      setPresetError(
        err instanceof Error ? err.message : "Failed to create preset",
      );
    } finally {
      setIsCreatingPreset(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    setIsDeletingPreset(presetId);
    setPresetError(null);
    try {
      await pixelApi.deleteChannelPreset(presetId);
      setChannelPresets((prev) => prev.filter((p) => p.id !== presetId));
    } catch (err) {
      setPresetError(
        err instanceof Error ? err.message : "Failed to delete preset",
      );
    } finally {
      setIsDeletingPreset(null);
    }
  };

  const handleSaveAiKeys = async () => {
    setIsSavingAiKeys(true);
    setError(null);
    try {
      const updated = await pixelApi.updateAiKeysSettings({
        gemini_api_key: geminiApiKeyInput.trim() || null,
        openai_api_key: openAiApiKeyInput.trim() || null,
      });
      setAiKeys(updated);
      setGeminiApiKeyInput("");
      setOpenAiApiKeyInput("");
      setAiDefaults(await pixelApi.getAiDefaults());
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to save API keys",
      );
    } finally {
      setIsSavingAiKeys(false);
    }
  };

  // ─── Tab content ──────────────────────────────────────────────────────────

  const renderAI = () => (
    <div className="space-y-6">
      {aiDefaults && (
        <div className="rounded-xl border border-border/70 bg-muted/5 p-4 space-y-3">
          <SubHeader className="mb-2">Current Defaults</SubHeader>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-[11px]">
              Provider:{" "}
              <span className="ml-1 text-foreground font-semibold">
                {aiDefaults.preferred_provider || "—"}
              </span>
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              Model:{" "}
              <span className="ml-1 text-foreground font-semibold">
                {aiDefaults.preferred_model || "—"}
              </span>
            </Badge>
            {aiDefaults.source && (
              <Badge variant="outline" className="text-[11px]">
                Source: {aiDefaults.source}
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            These defaults are managed via environment variables for security.
            <span className="ml-1 opacity-70">
              (GEMINI_API_KEY, OPENAI_API_KEY, etc.)
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/70 bg-muted/5 p-4 space-y-4">
        <SubHeader className="mb-2">API Keys</SubHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">
              Gemini API Key
            </Label>
            <Input
              type="password"
              autoComplete="off"
              value={geminiApiKeyInput}
              onChange={(e) => setGeminiApiKeyInput(e.target.value)}
              placeholder={
                aiKeys?.gemini.has_key
                  ? "Configured (enter to replace)"
                  : "Paste GEMINI_API_KEY"
              }
              className="h-9 text-sm bg-muted/20"
            />
            <div className="text-[11px] text-muted-foreground/80">
              Current source: {aiKeys?.gemini.source ?? "unknown"}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">
              OpenAI API Key
            </Label>
            <Input
              type="password"
              autoComplete="off"
              value={openAiApiKeyInput}
              onChange={(e) => setOpenAiApiKeyInput(e.target.value)}
              placeholder={
                aiKeys?.openai.has_key
                  ? "Configured (enter to replace)"
                  : "Paste OPENAI_API_KEY"
              }
              className="h-9 text-sm bg-muted/20"
            />
            <div className="text-[11px] text-muted-foreground/80">
              Current source: {aiKeys?.openai.source ?? "unknown"}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-muted-foreground/80">
            Keys saved here are stored in app settings and used when env vars are missing.
          </div>
          <Button
            size="sm"
            onClick={() => void handleSaveAiKeys()}
            disabled={
              isSavingAiKeys ||
              (!geminiApiKeyInput.trim() && !openAiApiKeyInput.trim())
            }
          >
            {isSavingAiKeys ? "Saving..." : "Save Keys"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <SubHeader>AI Providers</SubHeader>
        <div className="grid gap-4">
          {AI_PROVIDERS.map((provider) => (
            <AiProviderCard
              key={provider.id}
              provider={provider}
              aiDefaults={aiDefaults}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const renderSystem = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 p-4 space-y-3 bg-muted/5 transition-colors hover:bg-muted/10">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">Backend Engine</span>
          <StatusBadge ok={!error} label={error ? "Disruption" : "Stable"} />
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          Endpoint: {pixelApi.baseUrl}
        </div>
      </div>

      <div className="rounded-xl border border-border/70 p-4 space-y-3 bg-muted/5 transition-colors hover:bg-muted/10">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">FFmpeg Pipeline</span>
          <StatusBadge
            ok={systemDeps?.ffmpeg.available ?? false}
            label={systemDeps?.ffmpeg.available ? "Ready" : "Not Found"}
          />
        </div>
        {systemDeps?.ffmpeg.version && (
          <div className="text-[11px] font-mono text-muted-foreground/80 truncate opacity-70">
            {systemDeps.ffmpeg.version}
          </div>
        )}
        {!systemDeps?.ffmpeg.available && (
          <div className="text-xs text-destructive/90 font-medium">
            Critical: FFmpeg is required for video compilation and processing.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border/70 p-4 space-y-3 bg-muted/5 transition-colors hover:bg-muted/10">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">GPU Acceleration</span>
          <Badge
            variant="outline"
            className={
              systemDeps?.gpu.device === "cuda"
                ? "border-emerald-500/20 text-emerald-500"
                : ""
            }
          >
            {systemDeps?.gpu.device === "cuda"
              ? "CUDA Enabled"
              : "CPU Standard"}
          </Badge>
        </div>
        {systemDeps?.gpu.name && (
          <div className="text-sm font-medium text-muted-foreground">
            {systemDeps.gpu.name}
          </div>
        )}
        {systemDeps?.gpu.vram_mb && (
          <div className="text-xs text-muted-foreground/80">
            Memory: {(systemDeps.gpu.vram_mb / 1024).toFixed(1)} GB VRAM
          </div>
        )}
        {systemDeps?.gpu.device !== "cuda" && (
          <div className="text-[11px] text-muted-foreground/70 italic">
            Currently running on CPU. For faster processing, using a
            CUDA-capable GPU is recommended.
          </div>
        )}
      </div>
    </div>
  );

  const renderYouTube = () => (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/70 bg-muted/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">
            {youtubeStatus?.connected
              ? (youtubeStatus.channel_title ?? "Connected Channel")
              : "No Channel Linked"}
          </span>
          <StatusBadge ok={youtubeStatus?.connected ?? false} />
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
          <span>Client Secrets:</span>
          {youtubeStatus?.has_client_secrets ? (
            <Badge
              variant="secondary"
              className="h-4 text-[9px] px-1 font-bold"
            >
              FOUND
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="h-4 text-[9px] px-1 text-destructive border-destructive/20"
            >
              MISSING
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>Integration Credentials</SectionLabel>
        <div className="rounded-xl border border-border/70 p-4 space-y-3 bg-muted/5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            To publish videos directly, upload your{" "}
            <code className="bg-muted px-1 rounded text-foreground">
              client_secrets.json
            </code>{" "}
            from the Google Cloud Console.
          </p>
          <input
            ref={ytCredsInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadYouTubeCredentials(file);
            }}
          />
          <Button
            variant="outline"
            className="w-full h-10 gap-2 border-dashed border-2 hover:border-primary/50"
            onClick={() => ytCredsInputRef.current?.click()}
            disabled={isUploadingYoutube}
          >
            {isUploadingYoutube ? "Processing..." : "Upload Client Secrets"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <Button
          onClick={handleConnectYouTube}
          disabled={isConnectingYoutube}
          className="flex-1 shadow-sm"
        >
          {isConnectingYoutube ? "Linking..." : "Connect YouTube Channel"}
        </Button>
        <Button
          variant="outline"
          onClick={handleDisconnectYouTube}
          className="flex-1 text-muted-foreground hover:text-destructive hover:border-destructive/30"
        >
          Disconnect
        </Button>
      </div>
    </div>
  );

  const renderMedia = () => (
    <div className="space-y-6">
      {/* Library path */}
      <div className="space-y-3">
        <SectionLabel>Library Directory</SectionLabel>
        {showEditLibraryPath ? (
          <div className="space-y-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Absolute Path</Label>
              <Input
                value={editedLibraryPath}
                onChange={(e) => setEditedLibraryPath(e.target.value)}
                placeholder={
                  mediaLibrary?.directories.root || "e.g. C:\\Videos\\Assets"
                }
                className="font-mono text-sm bg-background h-10"
                disabled={isUpdatingLibraryPath}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowEditLibraryPath(false);
                  setEditedLibraryPath("");
                  setLibraryPathError(null);
                }}
                disabled={isUpdatingLibraryPath}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleUpdateLibraryPath}
                disabled={isUpdatingLibraryPath || !editedLibraryPath.trim()}
              >
                {isUpdatingLibraryPath ? "Applying..." : "Save Path"}
              </Button>
            </div>
            {libraryPathError && (
              <div className="text-xs font-medium text-destructive mt-1">
                {libraryPathError}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-muted/5 group">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-mono text-muted-foreground truncate italic">
                {mediaLibrary?.directories.root ?? "Not configured"}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] uppercase font-bold opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => {
                setShowEditLibraryPath(true);
                setEditedLibraryPath(mediaLibrary?.directories.root || "");
              }}
            >
              Edit Path
            </Button>
          </div>
        )}
      </div>

      {/* Intros */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Intro Videos</SectionLabel>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] font-bold text-primary hover:text-primary hover:bg-primary/5"
            onClick={() => introInputRef.current?.click()}
            disabled={isUploadingIntro}
          >
            {isUploadingIntro ? "UPLOADING..." : "Upload Intro"}
          </Button>
        </div>

        <input
          ref={introInputRef}
          type="file"
          accept=".mp4,.mov,.mkv,.webm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUploadLibrary("intro", file);
          }}
        />

        {mediaLibrary?.intros?.length ? (
          <div className="grid gap-2">
            {mediaLibrary.intros.map((entry) => (
              <div
                key={entry.path}
                className="rounded-lg border border-border/50 p-2.5 bg-card/50 flex items-center justify-between group"
              >
                <div>
                  <div className="font-medium text-xs">{entry.name}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground flex gap-2">
                    <span>{formatBytes(entry.size_bytes)}</span>
                    <span className="opacity-40">|</span>
                    <span>{formatDate(entry.modified_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 rounded-xl border border-dashed border-border/70 text-center space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">
              No Intro Videos Yet
            </div>
            <div className="text-[10px] text-muted-foreground/60">
              Upload intro videos to add to your projects.
            </div>
          </div>
        )}
      </div>

      {/* Music */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Background Music</SectionLabel>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] font-bold text-primary hover:text-primary hover:bg-primary/5"
            onClick={() => musicInputRef.current?.click()}
            disabled={isUploadingMusic}
          >
            {isUploadingMusic ? "UPLOADING..." : "Upload Music"}
          </Button>
        </div>

        <input
          ref={musicInputRef}
          type="file"
          accept=".mp3,.wav,.m4a,.aac,.flac,.ogg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUploadLibrary("music", file);
          }}
        />

        {mediaLibrary?.music?.length ? (
          <div className="grid gap-2">
            {mediaLibrary.music.map((entry) => (
              <div
                key={entry.path}
                className="rounded-lg border border-border/50 p-2.5 bg-card/50"
              >
                <div className="font-medium text-xs">{entry.name}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground flex gap-2">
                  <span>{formatBytes(entry.size_bytes)}</span>
                  <span className="opacity-40">|</span>
                  <span>{formatDate(entry.modified_at)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 rounded-xl border border-dashed border-border/70 text-center space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">
              No Music Tracks Yet
            </div>
            <div className="text-[10px] text-muted-foreground/60">
              Upload background music for your projects.
            </div>
          </div>
        )}
      </div>

      {/* Free sources */}
      {mediaLibrary?.free_sources?.length ? (
        <div className="space-y-3">
          <Label className="text-xs">Free Sources</Label>
          <div className="space-y-2">
            {mediaLibrary.free_sources.map((source) => (
              <div
                key={source.id}
                className="rounded-xl border border-border/70 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">{source.label}</div>
                    {source.best_for && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {source.best_for}
                      </div>
                    )}
                  </div>
                  <a
                    href={source.site_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs underline underline-offset-2"
                  >
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderPresets = () => (
    <div className="space-y-6">
      {/* Channel presets */}
      <div className="space-y-5">
        <SectionLabel>Channel Rendering Presets</SectionLabel>

        {/* Create form */}
        <div className="rounded-xl border border-border/70 p-5 space-y-4 bg-muted/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-1 w-full bg-gradient-to-r from-transparent via-primary/10 to-transparent opacity-50" />
          <div className="text-sm font-bold uppercase tracking-tight text-foreground/80">
            New Channel Architecture
          </div>
          <div className="space-y-2">
            <Label className="text-[11px] font-medium text-muted-foreground">
              Preset Name
            </Label>
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g. YouTube Shorts Pro"
              className="h-9 bg-background focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">
                Quality
              </Label>
              <select
                value={presetQuality}
                onChange={(e) => setPresetQuality(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-3 py-1 text-xs outline-none focus:border-primary/50 transition-colors"
              >
                {QUALITY_OPTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q.charAt(0).toUpperCase() + q.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">
                Output Format
              </Label>
              <select
                value={presetFormat}
                onChange={(e) => setPresetFormat(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-3 py-1 text-xs outline-none focus:border-primary/50 transition-colors"
              >
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {presetError && (
            <div className="text-xs font-semibold text-destructive/90">
              {presetError}
            </div>
          )}
          <div className="pt-1">
            <Button
              className="w-full h-9 font-bold"
              size="sm"
              onClick={handleCreatePreset}
              disabled={isCreatingPreset || !presetName.trim()}
            >
              {isCreatingPreset ? "Saving Preset..." : "Register Preset"}
            </Button>
          </div>
        </div>

        {/* Preset list */}
        {channelPresets.length ? (
          <div className="grid gap-3">
            {channelPresets.map((preset) => {
              const config = preset.config ?? {};
              return (
                <div
                  key={preset.id}
                  className="rounded-xl border border-border/70 p-4 bg-muted/5 group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="font-semibold text-sm">{preset.name}</div>
                      <div className="flex flex-wrap gap-1">
                        {Boolean(config.quality) && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] uppercase font-bold py-0 h-4"
                          >
                            {String(config.quality)}
                          </Badge>
                        )}
                        {Boolean(config.output_format) && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] uppercase font-bold py-0 h-4"
                          >
                            {String(config.output_format)}
                          </Badge>
                        )}
                        {Boolean(config.editor_preset) && (
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase font-bold py-0 h-4"
                          >
                            Engine: {String(config.editor_preset)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => void handleDeletePreset(preset.id)}
                      disabled={isDeletingPreset === preset.id}
                    >
                      {isDeletingPreset === preset.id ? (
                        "..."
                      ) : (
                        <X className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 rounded-xl border border-dashed border-border/70 text-center space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">
              No Presets Defined
            </div>
            <div className="text-[10px] text-muted-foreground/60">
              Create a preset to speed up your channel workflow.
            </div>
          </div>
        )}
      </div>

      {/* Editor presets */}
      <div className="space-y-4">
        <SectionLabel>Editor Defaults</SectionLabel>
        {Object.entries(editorPresets).length ? (
          <div className="grid gap-2">
            {Object.entries(editorPresets).map(([key, preset]) => (
              <div
                key={key}
                className="rounded-xl border border-border/70 p-3 bg-muted/5"
              >
                <div className="font-semibold text-xs leading-none mb-2">
                  {String(preset.label ?? key)}
                </div>
                <div className="flex flex-wrap gap-1">
                  {Boolean(preset.output_format) && (
                    <Badge
                      variant="secondary"
                      className="text-[9px] uppercase font-bold py-0 h-4"
                    >
                      {String(preset.output_format)}
                    </Badge>
                  )}
                  {Boolean(preset.quality) && (
                    <Badge
                      variant="secondary"
                      className="text-[9px] uppercase font-bold py-0 h-4"
                    >
                      {String(preset.quality)}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground/60 italic">
            No native editor presets available.
          </div>
        )}
      </div>
    </div>
  );

  // ─── Layout ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <header className="border-b border-border/50 px-6 py-8 bg-muted/5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5 opacity-60">
              <Link
                href="/projects"
                className="text-[10px] font-bold uppercase tracking-[0.25em] hover:text-primary transition-colors"
              >
                OpenClyp Studio
              </Link>
              <span className="text-xs">/</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">
                System
              </span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>
            <p className="mt-2 text-sm text-muted-foreground/80 leading-relaxed max-w-md">
              Configure your AI ecosystem, system engines, and channel presets
              for optimized clipping workflows.
            </p>
          </div>
          <div className="hidden md:flex flex-wrap justify-end gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 text-[11px] font-bold uppercase tracking-wider"
            >
              <Link href="/history">History</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 text-[11px] font-bold uppercase tracking-wider"
            >
              <Link href="/projects">Projects</Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadAll()}
              className="h-8 text-[11px] font-bold uppercase tracking-wider shadow-sm"
            >
              Refresh Status
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Tab nav */}
        <div className="mb-10 flex flex-wrap gap-2 border-b border-border/30 pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-2 text-xs font-bold uppercase tracking-widest transition-all relative ${
                activeTab === tab.id
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setError(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-2xl border border-border/50 bg-muted/20"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-1">
              <div className="sticky top-10">
                <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground mb-4">
                  Quick Insights
                </h4>
                <div className="space-y-6">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Active Tab
                    </div>
                    <div className="text-lg font-black tracking-tight">
                      {TABS.find((t) => t.id === activeTab)?.label}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      System Health
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${!error ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-destructive animate-pulse"}`}
                      />
                      <span className="text-xs font-medium">
                        {!error
                          ? "All systems operational"
                          : "Disruption detected"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="md:col-span-3">
              <div className="space-y-6">
                {activeTab === "ai" && renderAI()}
                {activeTab === "system" && renderSystem()}
                {activeTab === "youtube" && renderYouTube()}
                {activeTab === "media" && renderMedia()}
                {activeTab === "presets" && renderPresets()}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
