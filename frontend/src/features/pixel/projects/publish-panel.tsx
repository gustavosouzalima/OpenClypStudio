"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pixelApi } from "@/integrations/pixel/api";
import type {
  PixelJobStatus,
  PixelProject,
  PixelYouTubeConfig,
  PixelYouTubeStatus,
} from "@/integrations/pixel/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getYouTubeConfig(project: PixelProject): PixelYouTubeConfig {
  const config = (project.config ?? {}) as Record<string, unknown>;
  return (config.youtube ?? {}) as PixelYouTubeConfig;
}

const PRIVACY_OPTIONS = [
  { value: "private", label: "Private" },
  { value: "unlisted", label: "Unlisted" },
  { value: "public", label: "Public" },
];

const FALLBACK_AI = {
  preferred_provider: "gemini",
  preferred_model: "gemini-2.0-flash-lite",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PublishPanel({
  project,
  onPublishDone,
}: {
  project: PixelProject;
  onPublishDone: () => void;
}) {
  const ytConfig = getYouTubeConfig(project);
  const lastUpload = ytConfig.last_upload ?? null;
  const hasVideo = Boolean(project.output_path);
  const hasScript = Boolean(project.script?.segments?.length);

  // YouTube status
  const [ytStatus, setYtStatus] = useState<PixelYouTubeStatus | null>(null);
  const [ytStatusLoading, setYtStatusLoading] = useState(true);

  // Form
  const [title, setTitle] = useState(
    ytConfig.title ?? project.script?.title ?? project.name ?? "",
  );
  const [description, setDescription] = useState(
    ytConfig.description ?? project.script?.description ?? "",
  );
  const [tagsRaw, setTagsRaw] = useState(
    (ytConfig.tags ?? []).join(", "),
  );
  const [privacy, setPrivacy] = useState(ytConfig.privacy_status ?? "private");

  // AI generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Publish job
  const [publishJob, setPublishJob] = useState<PixelJobStatus | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Load YouTube status once
  useEffect(() => {
    pixelApi
      .getYouTubeStatus()
      .then(setYtStatus)
      .catch(() => setYtStatus(null))
      .finally(() => setYtStatusLoading(false));
  }, []);

  // Poll publish job
  useEffect(() => {
    if (!publishJob) return;
    if (
      publishJob.status === "done" ||
      publishJob.status === "error" ||
      publishJob.status === "cancelled"
    ) {
      if (publishJob.status === "done") onPublishDone();
      return;
    }
    const interval = window.setInterval(async () => {
      try {
        const next = await pixelApi.getJob(publishJob.job_id);
        setPublishJob(next);
        if (
          next.status === "done" ||
          next.status === "error" ||
          next.status === "cancelled"
        ) {
          if (next.status === "done") onPublishDone();
          window.clearInterval(interval);
        }
      } catch {
        // ignore poll errors
      }
    }, 1500);
    return () => window.clearInterval(interval);
  }, [publishJob?.job_id, publishJob?.status]);

  const handleGenerateWithAI = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const defaults = await pixelApi
        .getAiDefaults()
        .catch(() => FALLBACK_AI);
      const result = await pixelApi.generateYouTubePackage(project.id, {
        model: defaults.preferred_model || FALLBACK_AI.preferred_model,
        provider: defaults.preferred_provider || FALLBACK_AI.preferred_provider,
      });
      const yt = result.youtube ?? {};
      if (yt.title) setTitle(yt.title);
      if (yt.description) setDescription(yt.description);
      if (yt.tags?.length) setTagsRaw(yt.tags.join(", "));
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate with AI",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setPublishError(null);
    try {
      const tags = tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const { job_id } = await pixelApi.publishToYouTube(project.id, {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        tags: tags.length ? tags : undefined,
        privacy_status: privacy,
      });
      const job = await pixelApi.getJob(job_id);
      setPublishJob(job);
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : "Failed to start publishing",
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const isJobActive =
    publishJob &&
    publishJob.status !== "done" &&
    publishJob.status !== "error" &&
    publishJob.status !== "cancelled";

  const publishedUrl =
    publishJob?.status === "done"
      ? ((publishJob.result as Record<string, unknown>)?.url as
          | string
          | undefined)
      : (lastUpload?.url ?? undefined);

  // ─── Status badge ─────────────────────────────────────────────────────────

   const renderYtStatus = () => {
    if (ytStatusLoading) {
      return (
        <div className="text-xs text-muted-foreground">
          Checking YouTube connection...
        </div>
      );
    }
    if (!ytStatus?.connected) {
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            YouTube not connected.
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">Connect</Link>
          </Button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Account:{" "}
          <span className="font-medium text-foreground">
            {ytStatus.channel_title ?? "Connected channel"}
          </span>
        </div>
        <Badge variant="outline" className="text-xs">
          Connected
        </Badge>
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* YouTube connection status */}
      <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
        {renderYtStatus()}
      </div>

      {/* Last upload */}
      {lastUpload?.url && !publishJob && (
        <div className="rounded-xl border border-border/70 bg-muted/10 p-3 text-sm">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Last publication
          </div>
          <a
            href={lastUpload.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block truncate font-medium text-foreground underline underline-offset-2"
          >
            {lastUpload.url}
          </a>
        </div>
      )}

      {/* Publish job progress */}
      {publishJob && (
        <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">
              Upload {publishJob.job_id.slice(0, 8)}
            </div>
            <Badge variant="outline">{publishJob.status}</Badge>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${
                publishJob.status === "error"
                  ? "bg-destructive"
                  : "bg-foreground"
              }`}
              style={{
                width: `${Math.max(0, Math.min(100, publishJob.progress || 0))}%`,
              }}
            />
          </div>
           <div className="text-xs text-muted-foreground">
            {publishJob.progress || 0}% completed
          </div>
          {publishJob.error && (
            <div className="text-sm text-destructive">{publishJob.error}</div>
          )}
          {publishJob.logs?.length ? (
            <pre className="max-h-36 overflow-auto rounded-lg bg-black px-3 py-2 text-xs text-white">
              {publishJob.logs.slice(-10).join("\n")}
            </pre>
          ) : null}
          {publishedUrl && publishJob.status === "done" && (
            <a
              href={publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium underline underline-offset-2"
            >
              View on YouTube
            </a>
          )}
        </div>
      )}

      {/* Metadata form */}
      {!isJobActive && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="yt-title" className="text-xs">
              Title
            </Label>
            <Input
              id="yt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="YouTube video title"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="yt-desc" className="text-xs">
              Description
            </Label>
            <textarea
              id="yt-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Video description"
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="yt-tags" className="text-xs">
              Tags{" "}
              <span className="text-muted-foreground">(comma separated)</span>
            </Label>
            <Input
              id="yt-tags"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="tag1, tag2, tag3"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="yt-privacy" className="text-xs">
              Privacy
            </Label>
            <select
              id="yt-privacy"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {PRIVACY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {generateError && (
            <div className="text-sm text-destructive">{generateError}</div>
          )}
          {publishError && (
            <div className="text-sm text-destructive">{publishError}</div>
          )}

          <div className="flex flex-col gap-2">
            {hasScript && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateWithAI}
                disabled={isGenerating}
              >
                {isGenerating ? "Generating..." : "Generate metadata with AI"}
              </Button>
            )}
            <Button
              onClick={handlePublish}
              disabled={
                isPublishing ||
                !hasVideo ||
                !ytStatus?.connected ||
                isGenerating
              }
            >
              {isPublishing
                ? "Starting..."
                : lastUpload?.url
                  ? "Republish to YouTube"
                  : "Publish to YouTube"}
            </Button>
            {!hasVideo && (
              <div className="text-xs text-muted-foreground">
                Compile the project before publishing.
              </div>
            )}
            {!ytStatus?.connected && !ytStatusLoading && (
              <div className="text-xs text-muted-foreground">
                Connect YouTube in{" "}
                <Link href="/settings" className="underline">
                  Settings
                </Link>{" "}
                to publish.
              </div>
            )}
            <Button
              onClick={handlePublish}
              disabled={
                isPublishing ||
                !hasVideo ||
                !ytStatus?.connected ||
                isGenerating
              }
            >
              {isPublishing
                ? "Starting..."
                : lastUpload?.url
                  ? "Re-publish to YouTube"
                  : "Publish to YouTube"}
            </Button>
            {!hasVideo && (
              <div className="text-xs text-muted-foreground">
                Compile the project before publishing.
              </div>
            )}
            {!ytStatus?.connected && !ytStatusLoading && (
              <div className="text-xs text-muted-foreground">
                Connect YouTube in{" "}
                <Link href="/settings" className="underline">
                  Settings
                </Link>{" "}
                to publish.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
