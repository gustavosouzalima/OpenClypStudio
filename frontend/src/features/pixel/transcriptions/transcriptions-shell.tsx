"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pixelApi } from "@/integrations/pixel/api";
import type { PixelJobStatus, PixelTranscriptionRequest, PixelHistoryItem } from "@/integrations/pixel/types";
import {
  Upload,
  Link as LinkIcon,
  Play,
  FileText,
  Download,
  X,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

const MODELS = [
  { value: "tiny", label: "Tiny (fast, less accurate)" },
  { value: "base", label: "Base (balanced)" },
  { value: "small", label: "Small (good quality)" },
  { value: "medium", label: "Medium (better quality)" },
  { value: "large-v3-turbo", label: "Large v3 Turbo (recommended)" },
  { value: "large-v3", label: "Large v3 (best quality)" },
];

const LANGUAGES = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
];

const BEAM_SIZES = [1, 2, 3, 5, 8, 10];

type Tab = "upload" | "url";

export function PixelTranscriptionsShell() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [url, setUrl] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [config, setConfig] = useState<PixelTranscriptionRequest>({
    model: "large-v3-turbo",
    language: "auto",
    beam_size: 5,
    batch_size: 32,
    diarize: false,
    num_speakers: 2,
    auto_detect_speakers: false,
    speaker_names: {},
    output_format: "txt",
  });

  // Job state
  const [activeJob, setActiveJob] = useState<PixelJobStatus | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);

  // Results state
  const [historyIds, setHistoryIds] = useState<string[]>([]);
  const [resultFiles, setResultFiles] = useState<string[]>([]);

  // View transcript
  const [viewingTranscript, setViewingTranscript] = useState<PixelHistoryItem | null>(null);

  // Poll job
  useEffect(() => {
    if (!activeJob) return;
    if (
      activeJob.status === "done" ||
      activeJob.status === "error" ||
      activeJob.status === "cancelled"
    ) {
      // Load results
      if (activeJob.status === "done" && activeJob.result) {
        const result = activeJob.result as {
          history_ids: string[];
          files: string[];
        };
        setHistoryIds(result.history_ids || []);
        setResultFiles(result.files || []);
      }
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const nextJob = await pixelApi.getJob(activeJob.job_id);
        setActiveJob(nextJob);
        if (
          nextJob.status === "done" ||
          nextJob.status === "error" ||
          nextJob.status === "cancelled"
        ) {
          if (nextJob.status === "done" && nextJob.result) {
            const result = nextJob.result as {
              history_ids: string[];
              files: string[];
            };
            setHistoryIds(result.history_ids || []);
            setResultFiles(result.files || []);
          }
        }
      } catch (err) {
        console.error("Failed to poll job:", err);
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [activeJob?.job_id, activeJob?.status]);

  const mergeFiles = (incomingFiles: File[]) => {
    setSelectedFiles((current) => {
      const validFiles = incomingFiles.filter(
        (file) =>
          file.type.startsWith("audio/") || file.type.startsWith("video/"),
      );
      const nextFiles = [...current];

      validFiles.forEach((file) => {
        const alreadyIncluded = nextFiles.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified,
        );

        if (!alreadyIncluded) {
          nextFiles.push(file);
        }
      });

      return nextFiles;
    });
    setJobError(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    mergeFiles(files);
  };

  const handleRemoveFile = (fileToRemove: File) => {
    setSelectedFiles((current) =>
      current.filter(
        (file) =>
          !(
            file.name === fileToRemove.name &&
            file.size === fileToRemove.size &&
            file.lastModified === fileToRemove.lastModified
          ),
      ),
    );
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isJobActive) return;

    setIsDraggingFiles(false);
    const files = Array.from(e.dataTransfer.files || []);
    mergeFiles(files);
  };

  const handleStartTranscription = async () => {
    if (activeTab === "url" && !url.trim()) {
      setJobError("Please enter a URL");
      return;
    }
    if (activeTab === "upload" && !selectedFiles.length) {
      setJobError("Please select at least one file");
      return;
    }

    setIsTranscribing(true);
    setJobError(null);
    setActiveJob(null);
    setHistoryIds([]);
    setResultFiles([]);

    try {
      let jobId: string;

      if (activeTab === "url") {
        const response = await pixelApi.transcribeUrl(url.trim(), config);
        jobId = response.job_id;
      } else {
        // Upload file first
        const uploadResponse = await pixelApi.uploadFile(selectedFiles);
        const filePaths = uploadResponse.paths;
        
        // Then transcribe
        const transcribeResponse = await pixelApi.transcribeFiles(filePaths, config);
        jobId = transcribeResponse.job_id;
      }

      const job = await pixelApi.getJob(jobId);
      setActiveJob(job);
    } catch (err) {
      console.error("Failed to start transcription:", err);
      let errorMsg = "Failed to start transcription";
      if (err instanceof Error) {
        if (err.message.includes("413")) {
          errorMsg = "File is too large for transcription. Please use a smaller file.";
        } else if (err.message.includes("500")) {
          errorMsg = "Server error while starting transcription. Please try again.";
        } else if (err.message.includes("503")) {
          errorMsg = "Whisper model is not available. Please check your Whisper installation.";
        } else {
          errorMsg = err.message;
        }
      }
      setJobError(errorMsg);
      setIsTranscribing(false);
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    try {
      await pixelApi.cancelJob(activeJob.job_id);
    } catch (err) {
      console.error("Failed to cancel job:", err);
    }
  };

  const handleViewTranscript = async (historyId: string) => {
    try {
      const item = await pixelApi.getHistoryItem(historyId);
      setViewingTranscript(item);
    } catch (err) {
      console.error("Failed to load transcript:", err);
      alert("Failed to load transcript details. Please try again.");
    }
  };

  const handleCreateProject = () => {
    if (!historyIds.length) return;
    // Navigate to new project page with pre-selected history IDs
    router.push(`/new-project?history_ids=${historyIds.join(",")}`);
  };

  const handleUseInDocuments = () => {
    if (!historyIds.length) return;
    // Navigate to documents with pre-selected history IDs
    router.push(`/documents?history_ids=${historyIds.join(",")}`);
  };

  const handleExportResult = (filePath: string) => {
    const a = document.createElement("a");
    a.href = `file://${filePath}`;
    a.download = filePath.split(/[/\\]/).pop() || "transcript.txt";
    a.click();
  };

  const isJobActive = activeJob !== null &&
    activeJob.status !== "done" &&
    activeJob.status !== "error" &&
    activeJob.status !== "cancelled";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <header className="border-b border-border/70 px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-6">
          <div>
            <Link href="/projects" className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              OpenClyp Studio
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Transcriptions
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Transcribe audio and video without creating a project. Perfect for
              quick transcriptions and content preparation.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/audio-recorder">
              <Button variant="outline">Audio Recorder</Button>
            </Link>
            <Link href="/history">
              <Button variant="outline">History</Button>
            </Link>
            <Link href="/projects">
              <Button variant="outline">Projects</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[1fr_0.8fr]">
        {/* Left column - Input and Configuration */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tabs */}
              <div className="flex gap-2 border-b border-border/70 pb-0">
                <button
                  type="button"
                  onClick={() => setActiveTab("upload")}
                  className={`rounded-t-lg px-4 py-2 text-sm transition-colors ${
                    activeTab === "upload"
                      ? "border border-b-0 border-border bg-background font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  disabled={isJobActive}
                >
                  <Upload className="size-4 inline mr-2" />
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("url")}
                  className={`rounded-t-lg px-4 py-2 text-sm transition-colors ${
                    activeTab === "url"
                      ? "border border-b-0 border-border bg-background font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  disabled={isJobActive}
                >
                  <LinkIcon className="size-4 inline mr-2" />
                  From URL
                </button>
              </div>

              {/* Upload tab */}
              {activeTab === "upload" && (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,video/*"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={isJobActive}
                  />
                  <div
                    onClick={() => {
                      if (!isJobActive) {
                        fileInputRef.current?.click();
                      }
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isJobActive) setIsDraggingFiles(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isJobActive) setIsDraggingFiles(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      setIsDraggingFiles(false);
                    }}
                    onDrop={handleDrop}
                    className={`rounded-xl border border-dashed p-6 text-center transition-colors ${
                      isJobActive
                        ? "cursor-not-allowed border-border/60 bg-muted/20 opacity-60"
                        : isDraggingFiles
                          ? "cursor-pointer border-foreground bg-foreground/5"
                          : "cursor-pointer border-border/70 bg-muted/10 hover:border-foreground/40 hover:bg-muted/20"
                    }`}
                    role="button"
                    tabIndex={isJobActive ? -1 : 0}
                    onKeyDown={(e) => {
                      if (isJobActive) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    aria-disabled={isJobActive}
                  >
                    <Upload className="mx-auto size-8 text-muted-foreground" />
                    <div className="mt-3 text-sm font-medium">
                      {isDraggingFiles
                        ? "Drop audio or video files here"
                        : "Drag and drop audio or video files here"}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      or click to browse multiple files
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isJobActive}
                  >
                    <Upload className="size-4 mr-2" />
                    {selectedFiles.length
                      ? `${selectedFiles.length} file${selectedFiles.length !== 1 ? "s" : ""} selected`
                      : "Select Audio/Video Files"}
                  </Button>
                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Selected files
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClearFiles}
                          disabled={isJobActive}
                        >
                          Clear all
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {selectedFiles.map((file) => (
                          <div
                            key={`${file.name}-${file.size}-${file.lastModified}`}
                            className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/10 p-3"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <FileText className="size-4 shrink-0 text-muted-foreground" />
                              <span className="truncate text-sm">{file.name}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveFile(file)}
                              disabled={isJobActive}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* URL tab */}
              {activeTab === "url" && (
                <div className="space-y-3">
                  <Label htmlFor="url-input">Video or Audio URL</Label>
                  <Input
                    id="url-input"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={isJobActive}
                  />
                  <p className="text-xs text-muted-foreground">
                    Supports YouTube and most video platforms via yt-dlp.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Model</Label>
                <select
                  value={config.model}
                  onChange={(e) =>
                    setConfig({ ...config, model: e.target.value })
                  }
                  disabled={isJobActive}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {MODELS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Language</Label>
                <select
                  value={config.language}
                  onChange={(e) =>
                    setConfig({ ...config, language: e.target.value })
                  }
                  disabled={isJobActive}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Beam Size</Label>
                  <select
                    value={config.beam_size}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        beam_size: Number.parseInt(e.target.value, 10),
                      })
                    }
                    disabled={isJobActive}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {BEAM_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Output Format</Label>
                  <select
                    value={config.output_format}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        output_format: e.target.value as "txt" | "srt" | "ambos",
                      })
                    }
                    disabled={isJobActive}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="txt">TXT</option>
                    <option value="srt">SRT</option>
                    <option value="ambos">Both</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3 border-t border-border/70 pt-4">
                <Label className="flex items-center justify-between">
                  <span>Speaker Diarization</span>
                  <input
                    type="checkbox"
                    checked={config.diarize}
                    onChange={(e) =>
                      setConfig({ ...config, diarize: e.target.checked })
                    }
                    disabled={isJobActive}
                    className="size-4"
                  />
                </Label>
                <p className="text-xs text-muted-foreground">
                  Identify different speakers in the audio (requires resemblyzer and
                  scikit-learn).
                </p>

                {config.diarize && (
                  <div className="space-y-3 ml-4">
                    <Label className="flex items-center justify-between">
                      <span className="text-sm">Auto-detect Speakers</span>
                      <input
                        type="checkbox"
                        checked={config.auto_detect_speakers}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            auto_detect_speakers: e.target.checked,
                          })
                        }
                        disabled={isJobActive}
                        className="size-4"
                      />
                    </Label>

                    {!config.auto_detect_speakers && (
                      <div className="space-y-2">
                        <Label>Number of Speakers</Label>
                        <select
                          value={config.num_speakers}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              num_speakers: Number.parseInt(e.target.value, 10),
                            })
                          }
                          disabled={isJobActive}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {jobError && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
                    <span className="text-sm text-destructive">{jobError}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-4 shrink-0 -mr-1 -mt-1 ml-auto"
                      onClick={() => setJobError(null)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </div>
              )}

              <Button
                onClick={handleStartTranscription}
                disabled={isTranscribing || isJobActive}
                className="w-full"
              >
                {isTranscribing ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="size-4 mr-2" />
                    Start Transcription
                  </>
                )}
              </Button>

              {isJobActive && (
                <Button
                  variant="outline"
                  onClick={handleCancelJob}
                  className="w-full"
                >
                  Cancel
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column - Progress and Results */}
        <div className="space-y-6">
          {/* Empty state when no job and no results */}
          {(!activeJob || activeJob.status !== "done") && !jobError && !isTranscribing && (
            ((activeTab === "upload" && !selectedFiles.length) ||
             (activeTab === "url" && !url.trim())) && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Upload className="size-16 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">
                    No Transcription In Progress
                  </h3>
                   <p className="mt-2 text-center text-sm text-muted-foreground">
                     Upload an audio or video file, or paste a URL to start.
                   </p>
                   <div className="mt-6 text-sm">
                     <Link href="/audio-recorder" className="text-blue-500 hover:underline">
                       Or Record Audio
                     </Link>
                  </div>
                </CardContent>
              </Card>
            )
          )}

          {/* Job Progress */}
          {activeJob && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Progress</span>
                  <Badge variant="outline">{activeJob.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm font-medium">
                  Job {activeJob.job_id.slice(0, 8)}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${
                      activeJob.status === "error"
                        ? "bg-destructive"
                        : activeJob.status === "done"
                        ? "bg-green-500"
                        : "bg-foreground"
                    }`}
                    style={{
                      width: `${Math.max(0, Math.min(100, activeJob.progress || 0))}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {activeJob.progress || 0}% Completed
                </div>
                {activeJob.logs?.length ? (
                  <pre className="max-h-40 overflow-auto rounded-lg bg-black px-3 py-3 text-xs text-white">
                    {activeJob.logs.slice(-10).join("\n")}
                  </pre>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {activeJob?.status === "done" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="size-5 text-green-500" />
                  Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Transcription Completed. Your files are ready.
                </div>

                {/* Saved to history */}
                {historyIds.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Saved to History</div>
                    {historyIds.map((historyId) => (
                      <Button
                        key={historyId}
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewTranscript(historyId)}
                        className="w-full"
                      >
                        <FileText className="size-4 mr-2" />
                        View Transcript
                      </Button>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Actions</div>
                  <Button onClick={handleCreateProject} className="w-full">
                    Create Project From Transcript
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleUseInDocuments}
                    className="w-full"
                  >
                    Use In AI Documents
                  </Button>
                  <Link href="/history">
                    <Button variant="outline" className="w-full">
                      View In History
                    </Button>
                  </Link>
                  <Link href="/new-project">
                    <Button variant="outline" className="w-full">
                      New Project
                    </Button>
                  </Link>
                </div>

                {/* Reset */}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setActiveJob(null);
                    setHistoryIds([]);
                    setResultFiles([]);
                    setJobError(null);
                    setIsTranscribing(false);
                  }}
                  className="w-full"
                >
                  Start New Transcription
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* View Transcript Dialog */}
      <Dialog
        open={!!viewingTranscript}
        onOpenChange={(open) => !open && setViewingTranscript(null)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingTranscript?.filename}</DialogTitle>
          </DialogHeader>
          {viewingTranscript?.content && (
            <pre className="whitespace-pre-wrap text-sm">
              {viewingTranscript.content}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
