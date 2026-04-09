"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/header";
import { pixelApi } from "@/integrations/pixel/api";
import {
  Mic,
  Square,
  Play,
  StopCircle,
  Upload,
  FileText,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
  X,
} from "lucide-react";

type RecordingState =
  | "idle"
  | "recording"
  | "paused"
  | "processing"
  | "done"
  | "error";

interface AudioMetadata {
  filename: string;
  duration: number;
  timestamp: string;
}

export function AudioRecorderShell() {
  const router = useRouter();

  // Audio recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null,
  );
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Metadata
  const [filename, setFilename] = useState("");
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Saved to history
  const [historyId, setHistoryId] = useState<string | null>(null);

  // Timer interval
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Audio element for preview
  const audioRef = useRef<HTMLAudioElement>(null);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setErrorMessage(null);
      setRecordingState("recording");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      setMediaStream(stream);

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 128000,
      });

      setMediaRecorder(recorder);

      const chunks: Blob[] = [];
      setAudioChunks(chunks);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm;codecs=opus" });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setMediaStream(null);
        setMediaRecorder(null);
      };

      recorder.start(100); // Collect data every 100ms
      setStartTime(Date.now());

      // Update duration every second
      timerIntervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);

      let errorMsg = "Failed to access microphone. Please grant permission.";
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          errorMsg =
            "Microphone permission denied. Please allow access to continue recording.";
        } else if (err.name === "NotFoundError") {
          errorMsg =
            "No microphone found. Please connect a microphone and try again.";
        } else if (err.name === "NotReadableError") {
          errorMsg =
            "Microphone is being used by another application. Please close other apps and try again.";
        } else if (err.message) {
          errorMsg = err.message;
        }
      }

      setErrorMessage(errorMsg);
      setRecordingState("error");
    }
  }, []);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      mediaStream?.getTracks().forEach((track) => track.stop());
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    setRecordingState("done");
  }, [mediaRecorder, mediaStream]);

  // Reset recording
  const resetRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    setAudioBlob(null);
    setAudioChunks([]);
    setDuration(0);
    setStartTime(null);
    setRecordingState("idle");
    setErrorMessage(null);
    setUploadError(null);
    setHistoryId(null);
    setFilename("");
  }, [audioUrl]);

  // Save recording to history
  const saveRecording = async () => {
    if (!audioBlob) return;

    setIsUploading(true);
    setUploadError(null);
    setRecordingState("processing");

    try {
      // Convert Blob to File
      const file = new File(
        [audioBlob],
        filename || `recording_${Date.now()}.webm`,
        {
          type: audioBlob.type,
        },
      );

      const response = await pixelApi.uploadFile(file);
      const filePath = response.paths[0];

      // Get history ID from saved file
      const historyItems = await pixelApi.listHistory();
      const newestItem = historyItems.find(
        (item) => item.filepath === filePath,
      );

      if (newestItem) {
        setHistoryId(newestItem.id);
        setUploadError(null);
        setRecordingState("done");
      } else {
        // If not found in history, try to create manually
        try {
          const historyItem = await pixelApi.saveRecordingToHistory({
            filepath: filePath,
            filename: filename || `recording_${Date.now()}.webm`,
            content: "",
          });
          setHistoryId(historyItem.id);
          setUploadError(null);
          setRecordingState("done");
        } catch (manualError) {
          setUploadError(
            manualError instanceof Error
              ? manualError.message
              : "Recording saved, but failed to create history entry. You can find it in the History tab.",
          );
          setRecordingState("error");
        }
      }
    } catch (err) {
      console.error("Failed to save recording:", err);
      let errorMsg = "Failed to save recording";
      if (err instanceof Error) {
        if (err.message.includes("413")) {
          errorMsg =
            "Recording file is too large. Please record a shorter segment.";
        } else if (err.message.includes("500")) {
          errorMsg = "Server error while saving. Please try again.";
        } else {
          errorMsg = err.message;
        }
      }
      setUploadError(errorMsg);
      setRecordingState("error");
    } finally {
      setIsUploading(false);
    }
  };

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Handle filename change
  const handleFilenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilename(e.target.value);
  };

  // Navigate to transcriptions
  const handleGoToTranscriptions = () => {
    if (!audioBlob && !historyId) return;

    const params = new URLSearchParams();
    if (historyId) {
      params.set("history_ids", historyId);
    }
    if (audioBlob) {
      // We'll need to upload first, then navigate
      saveRecording().then(() => {
        router.push("/transcriptions?" + params.toString());
      });
    } else {
      router.push("/transcriptions?" + params.toString());
    }
  };

  // Navigate to new project
  const handleCreateProject = () => {
    if (!historyId) return;

    router.push(`/new-project?history_ids=${historyId}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <header className="border-b border-border/70 px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-6">
          <div>
            <Link
              href="/projects"
              className="text-xs uppercase tracking-[0.24em] text-muted-foreground"
            >
              OpenClyp Studio
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Audio Recorder
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Record audio directly from your microphone for transcription and
              project creation.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/transcriptions">
              <Button variant="outline">Transcriptions</Button>
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
        {/* Left column - Recording controls */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recording Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      recordingState === "recording" ? "default" : "outline"
                    }
                  >
                    {recordingState === "idle" && "Ready"}
                    {recordingState === "recording" && "Recording"}
                    {recordingState === "paused" && "Paused"}
                    {recordingState === "processing" && "Processing"}
                    {recordingState === "done" && "Completed"}
                    {recordingState === "error" && "Error"}
                  </Badge>
                  {recordingState === "recording" && (
                    <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                  )}
                </div>
                <div className="text-2xl font-mono">
                  {formatDuration(duration)}
                </div>
              </div>

              {/* Recording buttons */}
              <div className="flex gap-3">
                {recordingState === "idle" && (
                  <Button onClick={startRecording} className="flex-1" size="lg">
                    <Mic className="size-5 mr-2" />
                    Start Recording
                  </Button>
                )}

                {recordingState === "recording" && (
                  <Button
                    onClick={stopRecording}
                    variant="destructive"
                    className="flex-1"
                    size="lg"
                  >
                    <Square className="size-5 mr-2" />
                    Stop Recording
                  </Button>
                )}

                {(recordingState === "done" || recordingState === "error") && (
                  <Button
                    onClick={resetRecording}
                    variant="outline"
                    className="flex-1"
                    size="lg"
                  >
                    <RefreshCw className="size-5 mr-2" />
                    New Recording
                  </Button>
                )}
              </div>

              {/* Error message */}
              {errorMessage && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
                    <span className="text-sm text-destructive">
                      {errorMessage}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-4 shrink-0 -mr-1 -mt-1 ml-auto"
                      onClick={() => setErrorMessage(null)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Filename input */}
              {recordingState === "done" && (
                <div className="space-y-2">
                  <Label htmlFor="filename">Recording Name (optional)</Label>
                  <Input
                    id="filename"
                    value={filename}
                    onChange={handleFilenameChange}
                    placeholder="My Recording"
                    disabled={isUploading}
                  />
                </div>
              )}

              {/* Save button */}
              {recordingState === "done" && !historyId && (
                <Button
                  onClick={saveRecording}
                  disabled={isUploading}
                  className="w-full"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="size-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Upload className="size-4 mr-2" />
                      Save to History
                    </>
                  )}
                </Button>
              )}

              {/* Upload error */}
              {uploadError && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
                    <span className="text-sm text-destructive">
                      {uploadError}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-4 shrink-0 -mr-1 -mt-1 ml-auto"
                      onClick={() => setUploadError(null)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Delete button */}
              {recordingState === "done" && (
                <Button
                  onClick={resetRecording}
                  variant="outline"
                  disabled={isUploading}
                  className="w-full"
                >
                  <Trash2 className="size-4 mr-2" />
                  Delete Recording
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Tips card */}
          <Card>
            <CardHeader>
              <CardTitle>Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Grant microphone permission when prompted</p>
              <p>• Speak clearly and keep the microphone close</p>
              <p>• Use headphones to avoid audio feedback</p>
              <p>• Recording will be saved in WebM format</p>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Preview and Actions */}
        <div className="space-y-6">
          {/* Idle guidance */}
          {recordingState === "idle" && !audioUrl && !historyId && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Mic className="size-12 text-muted-foreground mb-4" />
                <h3 className="text-base font-semibold">Ready to Record</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Click "Start Recording" to begin capturing audio from your
                  microphone.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
                  <Link
                    href="/transcriptions"
                    className="text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Transcribe Existing Media
                  </Link>
                  <span className="text-muted-foreground/40">·</span>
                  <Link
                    href="/history"
                    className="text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    View Transcriptions
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview */}
          {audioUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  className="w-full"
                />

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Duration: {formatDuration(duration)}</span>
                  <span>Format: WebM/Opus</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Saved status */}
          {historyId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="size-5 text-green-500" />
                  Saved to History
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Your recording has been saved successfully.
                </div>

                <div className="space-y-2">
                  <Label>Actions</Label>
                  <div className="space-y-2">
                    <Link href={`/history/${historyId}`} className="block">
                      <Button variant="outline" className="w-full">
                        <FileText className="size-4 mr-2" />
                        View in History
                      </Button>
                    </Link>

                    <Button
                      onClick={handleGoToTranscriptions}
                      variant="outline"
                      className="w-full"
                    >
                      <LinkIcon className="size-4 mr-2" />
                      Transcribe Recording
                    </Button>

                    <Button onClick={handleCreateProject} className="w-full">
                      Create Project
                    </Button>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  onClick={resetRecording}
                  className="w-full"
                >
                  New Recording
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Processing state */}
          {recordingState === "processing" && (
            <Card>
              <CardHeader>
                <CardTitle>Processing...</CardTitle>
              </CardHeader>
              <CardContent className="text-center py-8">
                <RefreshCw className="size-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Saving Recording to History...
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
