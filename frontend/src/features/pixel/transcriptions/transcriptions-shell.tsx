"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { TranscriptionService } from "@/services/transcription/service";
import type { TranscriptionLanguage, TranscriptionModelId } from "@/types/transcription";
import {
  detectBrowserTranscriptionCapabilities,
  mapServerModelToLocalModel,
  resolveTranscriptionEngine,
  type BrowserTranscriptionCapabilities,
  type TranscriptionEnginePreference,
} from "./transcription-engine";
import { decodeAudioBlobToMonoFloat32 } from "./decode-audio";

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
const LOCAL_CHUNK_SECONDS = 75;
const LOCAL_CHUNK_OVERLAP_SECONDS = 1;
const LOCAL_MAX_PARALLEL_WORKERS = 2;

type Tab = "upload" | "url";

const ENGINE_STORAGE_KEY = "pixel.transcription.engine.preference";

type LocalChunkTask = {
  index: number;
  startSample: number;
  endSample: number;
  startSeconds: number;
  keepAfterSeconds: number;
};

const ENGINE_OPTIONS: Array<{
  value: TranscriptionEnginePreference;
  label: string;
  hint: string;
}> = [
  {
    value: "auto",
    label: "Auto (recommended)",
    hint: "Chooses local GPU/CPU when suitable, backend for heavier jobs.",
  },
  {
    value: "local-gpu",
    label: "Local Browser (GPU)",
    hint: "Fast on compatible WebGPU devices, keeps media local.",
  },
  {
    value: "local-cpu",
    label: "Local Browser (CPU)",
    hint: "Uses browser CPU; better for shorter files.",
  },
  {
    value: "server",
    label: "Backend Server (Python)",
    hint: "Most stable path for long files and URL sources.",
  },
];

export function PixelTranscriptionsShell() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localCancelledRef = useRef(false);
  const localServicesRef = useRef<TranscriptionService[]>([]);
  const transcriptionStartedAtRef = useRef<number | null>(null);

  // State
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [url, setUrl] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [config, setConfig] = useState<PixelTranscriptionRequest>({
    model: "small",
    language: "auto",
    beam_size: 1,
    batch_size: 16,
    diarize: false,
    num_speakers: 2,
    auto_detect_speakers: false,
    speaker_names: {},
    output_format: "txt",
  });
  const [enginePreference, setEnginePreference] =
    useState<TranscriptionEnginePreference>("auto");
  const [capabilities, setCapabilities] = useState<BrowserTranscriptionCapabilities>({
    hasWebGpu: false,
    logicalCores: 4,
    deviceMemoryGb: null,
  });

  // Job state
  const [activeJob, setActiveJob] = useState<PixelJobStatus | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);

  // Results state
  const [historyIds, setHistoryIds] = useState<string[]>([]);
  const [resultFiles, setResultFiles] = useState<string[]>([]);
  const [localTranscript, setLocalTranscript] = useState<{
    filename: string;
    content: string;
  } | null>(null);
  const [totalDurationMs, setTotalDurationMs] = useState<number | null>(null);

  // View transcript
  const [viewingTranscript, setViewingTranscript] = useState<PixelHistoryItem | null>(null);

  useEffect(() => {
    setCapabilities(detectBrowserTranscriptionCapabilities());
    const stored = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    if (!stored) return;
    if (ENGINE_OPTIONS.some((option) => option.value === stored)) {
      setEnginePreference(stored as TranscriptionEnginePreference);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ENGINE_STORAGE_KEY, enginePreference);
  }, [enginePreference]);

  useEffect(() => {
    return () => {
      localServicesRef.current.forEach((service) => service.terminate());
      localServicesRef.current = [];
    };
  }, []);

  const resolvedEngine = useMemo(
    () =>
      resolveTranscriptionEngine({
        preference: enginePreference,
        activeTab,
        totalFileSizeBytes: selectedFiles.reduce((sum, file) => sum + file.size, 0),
        capabilities,
      }),
    [enginePreference, activeTab, selectedFiles, capabilities],
  );

  const markTranscriptionFinished = () => {
    if (!transcriptionStartedAtRef.current) return;
    const durationMs = Date.now() - transcriptionStartedAtRef.current;
    setTotalDurationMs(durationMs);
    setActiveJob((current) => {
      if (!current) return current;
      const totalLabel = `Total time: ${formatDuration(durationMs)}`;
      if (current.logs.some((entry) => entry.startsWith("Total time:"))) {
        return current;
      }
      return {
        ...current,
        logs: [...current.logs, totalLabel],
      };
    });
    transcriptionStartedAtRef.current = null;
  };

  const formatDuration = (durationMs: number) => {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, "0")}m ${seconds
        .toString()
        .padStart(2, "0")}s`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  };

  // Poll job
  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.job_id.startsWith("local-")) return;
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
      markTranscriptionFinished();
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
          markTranscriptionFinished();
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

  const appendLocalLog = (message: string) => {
    setActiveJob((current) => {
      if (!current) return current;
      return {
        ...current,
        logs: [...current.logs, message],
      };
    });
  };

  const updateLocalProgress = (value: number) => {
    setActiveJob((current) => {
      if (!current) return current;
      return {
        ...current,
        progress: Math.max(0, Math.min(100, value)),
      };
    });
  };

  const buildLocalChunks = ({
    totalSamples,
    sampleRate,
  }: {
    totalSamples: number;
    sampleRate: number;
  }): LocalChunkTask[] => {
    const chunkSizeSamples = Math.max(1, Math.floor(LOCAL_CHUNK_SECONDS * sampleRate));
    const overlapSamples = Math.max(0, Math.floor(LOCAL_CHUNK_OVERLAP_SECONDS * sampleRate));
    const chunks: LocalChunkTask[] = [];

    let startSample = 0;
    let index = 0;
    while (startSample < totalSamples) {
      const endSample = Math.min(totalSamples, startSample + chunkSizeSamples + overlapSamples);
      const startSeconds = startSample / sampleRate;
      chunks.push({
        index,
        startSample,
        endSample,
        startSeconds,
        keepAfterSeconds: index === 0 ? 0 : startSeconds + LOCAL_CHUNK_OVERLAP_SECONDS,
      });
      startSample += chunkSizeSamples;
      index += 1;
    }

    return chunks;
  };

  const resolveLocalWorkerCount = (engineLabel: "local-gpu" | "local-cpu") => {
    if (engineLabel === "local-gpu") return 1;
    const hasEnoughMemory =
      capabilities.deviceMemoryGb !== null ? capabilities.deviceMemoryGb >= 8 : false;
    const hasEnoughCores = capabilities.logicalCores >= 8;
    if (hasEnoughMemory && hasEnoughCores) return LOCAL_MAX_PARALLEL_WORKERS;
    return 1;
  };

  const transcribeDecodedFileWithLocalWorkers = async ({
    fileName,
    samples,
    sampleRate,
    modelId,
    language,
    engineLabel,
    onProgress,
  }: {
    fileName: string;
    samples: Float32Array;
    sampleRate: number;
    modelId: TranscriptionModelId;
    language: TranscriptionLanguage;
    engineLabel: "local-gpu" | "local-cpu";
    onProgress: (progress: number) => void;
  }): Promise<{ text: string; segments: number }> => {
    const chunks: LocalChunkTask[] =
      engineLabel === "local-gpu"
        ? [
            {
              index: 0,
              startSample: 0,
              endSample: samples.length,
              startSeconds: 0,
              keepAfterSeconds: 0,
            },
          ]
        : buildLocalChunks({
            totalSamples: samples.length,
            sampleRate,
          });
    const workerCount = Math.min(resolveLocalWorkerCount(engineLabel), chunks.length);
    const services = Array.from({ length: Math.max(1, workerCount) }, () => new TranscriptionService());
    localServicesRef.current = services;

    appendLocalLog(
      `[${fileName}] chunking: ${chunks.length} chunk(s), workers=${services.length}, chunk=${LOCAL_CHUNK_SECONDS}s overlap=${LOCAL_CHUNK_OVERLAP_SECONDS}s`,
    );

    const chunkProgress = new Map<number, number>();
    const chunkResults = new Map<number, { text: string; segments: Array<{ text: string; start: number; end: number }> }>();
    let nextChunkIndex = 0;

    const updateOverallProgress = () => {
      let sum = 0;
      for (const chunk of chunks) {
        sum += chunkProgress.get(chunk.index) ?? 0;
      }
      onProgress(Math.floor(sum / chunks.length));
    };

    const runWorker = async (workerIndex: number, service: TranscriptionService) => {
      while (!localCancelledRef.current) {
        const queueIndex = nextChunkIndex;
        nextChunkIndex += 1;
        if (queueIndex >= chunks.length) break;

        const chunk = chunks[queueIndex];
        appendLocalLog(
          `[${fileName}] worker-${workerIndex + 1} -> chunk ${chunk.index + 1}/${chunks.length}`,
        );

        const chunkAudio = samples.subarray(chunk.startSample, chunk.endSample);
        chunkProgress.set(chunk.index, 0);
        updateOverallProgress();

        const result = await service.transcribe({
          audioData: chunkAudio,
          language,
          modelId,
          sampleRate,
          devicePreference: engineLabel === "local-gpu" ? "webgpu" : "wasm",
          onProgress: (progress) => {
            const raw = Math.max(0, Math.min(100, progress.progress || 0));
            const normalized =
              progress.status === "loading-model"
                ? Math.floor(raw * 0.15)
                : 15 + Math.floor(raw * 0.85);
            const current = chunkProgress.get(chunk.index) ?? 0;
            chunkProgress.set(chunk.index, Math.max(current, normalized));
            updateOverallProgress();
          },
          onLog: (message) => {
            appendLocalLog(`[${fileName}] worker-${workerIndex + 1} ${message}`);
          },
        });

        const shiftedSegments = result.segments.map((segment) => ({
          text: segment.text,
          start: segment.start + chunk.startSeconds,
          end: segment.end + chunk.startSeconds,
        }));

        chunkResults.set(chunk.index, {
          text: result.text,
          segments: shiftedSegments,
        });
        chunkProgress.set(chunk.index, 100);
        updateOverallProgress();
      }
    };

    try {
      await Promise.all(services.map((service, index) => runWorker(index, service)));
    } finally {
      services.forEach((service) => service.terminate());
      localServicesRef.current = [];
    }

    if (localCancelledRef.current) {
      throw new Error("Transcription was cancelled");
    }

    const mergedSegments: Array<{ text: string; start: number; end: number }> = [];
    const orderedChunkIndexes = [...chunkResults.keys()].sort((a, b) => a - b);
    for (const chunkIndex of orderedChunkIndexes) {
      const chunk = chunks[chunkIndex];
      const chunkOutput = chunkResults.get(chunkIndex);
      if (!chunkOutput) continue;
      for (const segment of chunkOutput.segments) {
        if (chunkIndex > 0 && segment.end <= chunk.keepAfterSeconds + 0.01) {
          continue;
        }
        mergedSegments.push(segment);
      }
    }

    const text = mergedSegments.map((segment) => segment.text.trim()).filter(Boolean).join(" ");
    return {
      text,
      segments: mergedSegments.length,
    };
  };

  const transcribeDecodedFileDirectGpu = async ({
    service,
    fileName,
    samples,
    sampleRate,
    modelId,
    language,
    onProgress,
  }: {
    service: TranscriptionService;
    fileName: string;
    samples: Float32Array;
    sampleRate: number;
    modelId: TranscriptionModelId;
    language: TranscriptionLanguage;
    onProgress: (progress: number) => void;
  }): Promise<{ text: string; segments: number }> => {
    let highestProgress = 0;

    appendLocalLog(`[${fileName}] direct GPU transcription started`);

    const result = await service.transcribe({
      audioData: samples,
      language,
      modelId,
      sampleRate,
      devicePreference: "webgpu",
      returnTimestamps: false,
      onProgress: (progress) => {
        const raw = Math.max(0, Math.min(100, progress.progress || 0));
        const normalized =
          progress.status === "loading-model"
            ? Math.floor(raw * 0.15)
            : 15 + Math.floor(raw * 0.85);
        highestProgress = Math.max(highestProgress, normalized);
        onProgress(highestProgress);
      },
      // Keep logs concise in GPU direct mode.
      onLog: (message) => {
        if (
          message.startsWith("worker:init-start") ||
          message.startsWith("worker:init-complete") ||
          message.startsWith("worker:transcribe-start") ||
          message.startsWith("worker:transcribe-running") ||
          message.startsWith("worker:transcribe-complete") ||
          message.startsWith("transcribe:error")
        ) {
          appendLocalLog(`[${fileName}] ${message}`);
        }
      },
    });

    onProgress(100);
    return {
      text: result.text,
      segments: result.segments.length,
    };
  };

  const startServerTranscription = async () => {
    let jobId: string;

    if (activeTab === "url") {
      const response = await pixelApi.transcribeUrl(url.trim(), config);
      jobId = response.job_id;
    } else {
      const uploadResponse = await pixelApi.uploadFile(selectedFiles);
      const filePaths = uploadResponse.paths;
      const transcribeResponse = await pixelApi.transcribeFiles(filePaths, config);
      jobId = transcribeResponse.job_id;
    }

    const job = await pixelApi.getJob(jobId);
    setActiveJob(job);
    setIsTranscribing(false);
  };

  const startLocalTranscription = async (engineLabel: "local-gpu" | "local-cpu") => {
    const localJobId = `local-${crypto.randomUUID()}`;
    const mappedModelId = mapServerModelToLocalModel({
      serverModel: config.model,
      engine: engineLabel,
    });
    const modelId = mappedModelId;
    const totalFiles = selectedFiles.length;
    const outputParts: string[] = [];
    localCancelledRef.current = false;
    const sharedGpuService = engineLabel === "local-gpu" ? new TranscriptionService() : null;
    localServicesRef.current = sharedGpuService ? [sharedGpuService] : [];

    setActiveJob({
      job_id: localJobId,
      status: "running",
      progress: 0,
      logs: [
        `Using local engine (${engineLabel === "local-gpu" ? "GPU" : "CPU"})`,
        `Model: ${modelId}`,
        `Requested files: ${selectedFiles.length}`,
      ],
    });
    if (
      engineLabel === "local-gpu" &&
      (config.model === "large-v3-turbo" || config.model === "large-v3") &&
      modelId !== "whisper-large-v3-turbo"
    ) {
      appendLocalLog(
        "Local GPU speed profile enabled: using lighter browser model for better throughput.",
      );
    }
    try {
      for (let index = 0; index < totalFiles; index += 1) {
        if (localCancelledRef.current) {
          setActiveJob((current) =>
            current
              ? {
                  ...current,
                  status: "cancelled",
                  cancelled: true,
                  progress: Math.max(current.progress, 1),
                }
              : current,
          );
          setIsTranscribing(false);
          markTranscriptionFinished();
          return;
        }

        const file = selectedFiles[index];
        appendLocalLog(`Decoding ${file.name} (${index + 1}/${totalFiles})...`);
        const decoded = await decodeAudioBlobToMonoFloat32(file, { targetSampleRate: 16000 });
        appendLocalLog(
          `[${file.name}] decoded sampleRate=${decoded.sampleRate}Hz samples=${decoded.samples.length}`,
        );

        const perFileResult =
          engineLabel === "local-gpu"
            ? await transcribeDecodedFileDirectGpu({
                service: sharedGpuService as TranscriptionService,
                fileName: file.name,
                samples: decoded.samples,
                sampleRate: decoded.sampleRate,
                modelId,
                language: config.language as TranscriptionLanguage,
                onProgress: (fileProgress) => {
                  const bounded = Math.max(0, Math.min(100, fileProgress));
                  const progressBase = (index / totalFiles) * 100;
                  const progressSpan = 100 / totalFiles;
                  updateLocalProgress(Math.floor(progressBase + (bounded / 100) * progressSpan));
                },
              })
            : await transcribeDecodedFileWithLocalWorkers({
                fileName: file.name,
                samples: decoded.samples,
                sampleRate: decoded.sampleRate,
                modelId,
                language: config.language as TranscriptionLanguage,
                engineLabel,
                onProgress: (fileProgress) => {
                  const bounded = Math.max(0, Math.min(100, fileProgress));
                  const progressBase = (index / totalFiles) * 100;
                  const progressSpan = 100 / totalFiles;
                  updateLocalProgress(Math.floor(progressBase + (bounded / 100) * progressSpan));
                },
              });

        outputParts.push(`# ${file.name}\n\n${perFileResult.text.trim()}`);
        updateLocalProgress(Math.floor(((index + 1) / totalFiles) * 100));
        appendLocalLog(`Completed ${file.name} (${perFileResult.segments} segments)`);
      }
    } finally {
      if (sharedGpuService) {
        sharedGpuService.terminate();
      }
      localServicesRef.current = [];
    }

    const mergedContent = outputParts.join("\n\n---\n\n");
    const filename =
      selectedFiles.length === 1
        ? `${selectedFiles[0].name}.txt`
        : `local-transcription-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;

    setLocalTranscript({ filename, content: mergedContent });
    setActiveJob((current) =>
      current
        ? {
            ...current,
            status: "done",
            progress: 100,
            result: { history_ids: [], files: [] },
          }
        : current,
    );
    setIsTranscribing(false);
    markTranscriptionFinished();
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
    setLocalTranscript(null);
    setTotalDurationMs(null);
    transcriptionStartedAtRef.current = Date.now();

    try {
      if (resolvedEngine.engine === "server") {
        await startServerTranscription();
        return;
      }

      try {
        await startLocalTranscription(resolvedEngine.engine);
      } catch (localError) {
        console.error("Local transcription failed:", localError);
        if (
          localCancelledRef.current ||
          (localError instanceof Error &&
            localError.message.toLowerCase().includes("cancelled"))
        ) {
          return;
        }
        if (enginePreference === "auto") {
          await startServerTranscription();
          return;
        }
        throw localError;
      }
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
      markTranscriptionFinished();
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    if (activeJob.job_id.startsWith("local-")) {
      localCancelledRef.current = true;
      localServicesRef.current.forEach((service) => service.cancel());
      setActiveJob((current) =>
        current
          ? {
              ...current,
              status: "cancelled",
              cancelled: true,
            }
          : current,
      );
      setIsTranscribing(false);
      markTranscriptionFinished();
      return;
    }
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

  const handleExportLocalTranscript = () => {
    if (!localTranscript) return;
    const blob = new Blob([localTranscript.content], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = localTranscript.filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
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
                <Label>Transcription Engine</Label>
                <select
                  value={enginePreference}
                  onChange={(e) =>
                    setEnginePreference(e.target.value as TranscriptionEnginePreference)
                  }
                  disabled={isJobActive}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {ENGINE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {ENGINE_OPTIONS.find((option) => option.value === enginePreference)?.hint}
                </p>
                <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                  <div>
                    Runtime detection: WebGPU {capabilities.hasWebGpu ? "available" : "not available"} |
                    CPU cores {capabilities.logicalCores}
                    {capabilities.deviceMemoryGb !== null ? ` | Device memory ${capabilities.deviceMemoryGb}GB` : ""}
                  </div>
                  <div className="mt-1">
                    Effective engine:{" "}
                    <span className="font-medium text-foreground">
                      {resolvedEngine.engine}
                    </span>{" "}
                    - {resolvedEngine.reason}
                  </div>
                </div>
              </div>

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
                    {activeJob.logs.join("\n")}
                  </pre>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {(activeJob?.status === "done" || localTranscript) && (
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
                {totalDurationMs !== null && (
                  <div className="rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-sm">
                    Total time: <span className="font-semibold">{formatDuration(totalDurationMs)}</span>
                  </div>
                )}

                {localTranscript && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Local Transcript</div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setViewingTranscript({
                          id: "local",
                          filename: localTranscript.filename,
                          filepath: "",
                          created_at: "",
                          size_bytes: localTranscript.content.length,
                          content: localTranscript.content,
                        })
                      }
                      className="w-full"
                    >
                      <FileText className="size-4 mr-2" />
                      View Local Transcript
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportLocalTranscript}
                      className="w-full"
                    >
                      <Download className="size-4 mr-2" />
                      Download TXT
                    </Button>
                  </div>
                )}

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
                {resultFiles.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Generated Files</div>
                    {resultFiles.map((filePath) => (
                      <Button
                        key={filePath}
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportResult(filePath)}
                        className="w-full"
                      >
                        <Download className="size-4 mr-2" />
                        Download {filePath.split(/[/\\]/).pop()}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Actions</div>
                  <Button onClick={handleCreateProject} className="w-full" disabled={!historyIds.length}>
                    Create Project From Transcript
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleUseInDocuments}
                    className="w-full"
                    disabled={!historyIds.length}
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
                  {!historyIds.length && (
                    <p className="text-xs text-muted-foreground">
                      Local transcription does not create backend history entries. Use backend engine if you need project/document integration.
                    </p>
                  )}
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
                    setLocalTranscript(null);
                    setTotalDurationMs(null);
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
