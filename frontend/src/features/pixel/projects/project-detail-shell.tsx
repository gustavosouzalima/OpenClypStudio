"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/header";
import { pixelApi } from "@/integrations/pixel/api";
import type { PixelJobStatus, PixelProject, PixelVideo } from "@/integrations/pixel/types";
import { buildEditorUrl } from "@/lib/editor-routing";
import { PublishPanel } from "./publish-panel";

const FALLBACK_AI_DEFAULTS = {
	preferred_provider: "gemini",
	preferred_model: "gemini-2.0-flash-lite",
};

const PROCESS_MODELS = [
	{ value: "tiny", label: "Tiny (fastest)" },
	{ value: "base", label: "Base" },
	{ value: "small", label: "Small" },
	{ value: "medium", label: "Medium" },
	{ value: "large-v3-turbo", label: "Large v3 Turbo (recommended)" },
	{ value: "large-v3", label: "Large v3 (best quality)" },
];

const PROCESS_LANGUAGES = [
	{ value: "auto", label: "Auto-detect" },
	{ value: "en", label: "English" },
	{ value: "pt", label: "Portuguese" },
	{ value: "es", label: "Spanish" },
	{ value: "fr", label: "French" },
	{ value: "de", label: "German" },
	{ value: "it", label: "Italian" },
	{ value: "ja", label: "Japanese" },
	{ value: "ko", label: "Korean" },
	{ value: "zh", label: "Chinese" },
];

const PROCESS_BEAM_SIZES = [1, 2, 3, 5, 8];

function formatDate(value?: string) {
	if (!value) return "No date";
	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));
}

function formatDuration(totalSeconds: number) {
	if (!totalSeconds) return "No duration";
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = Math.round(totalSeconds % 60);
	return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function getProjectDuration(project: PixelProject) {
	return (project.videos || []).reduce(
		(sum, video) => sum + Number(video.duration || 0),
		0,
	);
}

function getLastEditorExport(project: PixelProject) {
	const config = (project.config || {}) as Record<string, unknown>;
	const editorState = (config.editor_state || {}) as Record<string, unknown>;
	return (editorState.last_editor_export || null) as
		| {
				format?: string;
				quality?: string;
				includeAudio?: boolean;
				exportedAt?: string;
				filename?: string;
		  }
		| null;
}

	function getEditorSessionSummary(project: PixelProject) {
	const config = (project.config || {}) as Record<string, unknown>;
	const editorState = (config.editor_state || {}) as Record<string, unknown>;
	return (editorState.session_summary || null) as
		| {
				duration_seconds?: number;
				fps?: number;
				canvas?: { width?: number; height?: number } | null;
				scenes_count?: number;
				scene_tracks_count?: number;
				scene_elements_count?: number;
				timeline_tracks_count?: number;
				timeline_elements_count?: number;
				assets_count?: number;
		  }
		| null;
}

function getSourceOrigin(project: PixelProject) {
	const config = (project.config || {}) as Record<string, unknown>;
	return (config.source_origin || null) as string | null;
}

function getSourceOriginLabel(sourceOrigin: string | null): string {
	switch (sourceOrigin) {
		case "transcriptions":
			return "From transcription";
		case "audio-recorder":
			return "From audio recording";
		default:
			return "";
	}
}

function getProjectType(project: PixelProject) {
	const config = (project.config || {}) as Record<string, unknown>;
	return (config.project_type as string) || "ai";
}

type VideoSourceKind = "transcribed" | "downloaded" | "uploaded" | "url-pending";

const SOURCE_KIND_LABELS: Record<VideoSourceKind, string> = {
	transcribed: "Transcribed",
	downloaded: "Downloaded",
	uploaded: "Uploaded file",
	"url-pending": "URL (pending)",
};

function getVideoSourceKind(video: PixelVideo): VideoSourceKind {
	if (video.transcription?.length) return "transcribed";
	if (video.source_url) {
		return video.status === "downloaded" ? "downloaded" : "url-pending";
	}
	return "uploaded";
}

function getEditorTimestamp(project: PixelProject, key: string) {
	const config = (project.config || {}) as Record<string, unknown>;
	const editorState = (config.editor_state || {}) as Record<string, unknown>;
	const value = editorState[key];
	return typeof value === "string" ? value : undefined;
}

// Determines which output is more recent: pipeline (proxy: project.updated_at)
// or manual edit export (lastEditorExport.exportedAt)
function newerOutput(
	pipelineAt: string | undefined,
	manualAt: string | undefined,
): "pipeline" | "manual" | null {
	if (!pipelineAt && !manualAt) return null;
	if (!pipelineAt) return "manual";
	if (!manualAt) return "pipeline";
	return new Date(manualAt) >= new Date(pipelineAt) ? "manual" : "pipeline";
}

export function PixelProjectDetailShell({
	projectId,
}: {
	projectId: string;
}) {
	const router = useRouter();
	const [project, setProject] = useState<PixelProject | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [activeJob, setActiveJob] = useState<PixelJobStatus | null>(null);
	const [jobError, setJobError] = useState<string | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isCompiling, setIsCompiling] = useState(false);
	const [isGeneratingScript, setIsGeneratingScript] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	// Source management
	const [isAddingSource, setIsAddingSource] = useState(false);
	const [addSourceMode, setAddSourceMode] = useState<"local" | "url">("url");
	const [addUrl, setAddUrl] = useState("");
	const [addFile, setAddFile] = useState<File | null>(null);
	const [addSourceError, setAddSourceError] = useState<string | null>(null);
	const [isAddingSourceSubmitting, setIsAddingSourceSubmitting] = useState(false);
	const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
	const [isRemovingSource, setIsRemovingSource] = useState(false);
	const addFileRef = useRef<HTMLInputElement>(null);

	// Script generation config
	const [showScriptConfig, setShowScriptConfig] = useState(false);
	const [scriptMinDuration, setScriptMinDuration] = useState(15);
	const [scriptMaxDuration, setScriptMaxDuration] = useState(90);

	// Transcription config
	const [showProcessConfig, setShowProcessConfig] = useState(false);
	const [processModel, setProcessModel] = useState("small");
	const [processLanguage, setProcessLanguage] = useState("auto");
	const [processBeamSize, setProcessBeamSize] = useState(1);
	const [processDiarize, setProcessDiarize] = useState(false);

	const loadProject = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const nextProject = await pixelApi.getProject(projectId);
			setProject(nextProject);
		} catch (nextError) {
			setError(
				nextError instanceof Error
					? nextError.message
					: "Failed to load project",
			);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		void loadProject();
	}, [projectId]);

	useEffect(() => {
		if (!activeJob) return;
		if (
			activeJob.status === "done" ||
			activeJob.status === "error" ||
			activeJob.status === "cancelled"
		) {
			void loadProject();
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
					void loadProject();
				}
			} catch (nextError) {
				setJobError(
					nextError instanceof Error
						? nextError.message
						: "Failed to update job",
				);
			}
		}, 1500);

		return () => window.clearInterval(interval);
	}, [activeJob?.job_id, activeJob?.status]);

	const totalDuration = useMemo(
		() => formatDuration(getProjectDuration(project ?? { id: "", name: "" })),
		[project],
	);
	const lastEditorExport = useMemo(
		() => (project ? getLastEditorExport(project) : null),
		[project],
	);
	const editorSessionSummary = useMemo(
		() => (project ? getEditorSessionSummary(project) : null),
		[project],
	);
	const lastOpenedAt = useMemo(
		() => (project ? getEditorTimestamp(project, "last_opened_at") : undefined),
		[project],
	);
	const lastClosedAt = useMemo(
		() => (project ? getEditorTimestamp(project, "last_closed_at") : undefined),
		[project],
	);
	const lastSyncedAt = useMemo(
		() => (project ? getEditorTimestamp(project, "last_synced_at") : undefined),
		[project],
	);

	const sourceOrigin = useMemo(
		() => (project ? getSourceOrigin(project) : null),
		[project],
	);

	const manualEditExists = Boolean(editorSessionSummary || lastEditorExport);

	const isManualProject = useMemo(
		() => project ? getProjectType(project) === "manual" : false,
		[project],
	);

	const transcribedCount = useMemo(
		() => (project?.videos || []).filter((v) => v.status === "transcribed").length,
		[project],
	);

	const hasScript = Boolean(project?.script?.segments?.length);

	const selectedClipCount = useMemo(
		() =>
			(project?.script?.segments || []).filter((s) => s.selected !== false).length,
		[project],
	);

	// Compile pipeline readiness: stages in order
	type CompileReadiness =
		| "no-sources"
		| "no-transcription"
		| "no-script"
		| "ready"
		| "compiled";

	const compileReadiness = useMemo((): CompileReadiness => {
		if (!(project?.videos?.length)) return "no-sources";
		if (transcribedCount === 0) return "no-transcription";
		if (!hasScript) return "no-script";
		if (project?.output_path) return "compiled";
		return "ready";
	}, [project, transcribedCount, hasScript]);

	const outputRecency = useMemo(() => {
		const pipelineAt = project?.updated_at;
		const manualAt = lastEditorExport?.exportedAt;
		return newerOutput(pipelineAt, manualAt);
	}, [project?.updated_at, lastEditorExport?.exportedAt]);

	const handleProcess = async () => {
		setIsProcessing(true);
		setJobError(null);
		try {
			const response = await pixelApi.processProject(projectId, {
				model: processModel,
				language: processLanguage,
				beam_size: processBeamSize,
				diarize: processDiarize,
			});
			const job = await pixelApi.getJob(response.job_id);
			setActiveJob(job);
		} catch (nextError) {
			setJobError(
				nextError instanceof Error
					? nextError.message
					: "Failed to start processing",
			);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleGenerateScript = async () => {
		setIsGeneratingScript(true);
		setJobError(null);
		try {
			const defaults = await pixelApi
				.getAiDefaults()
				.catch(() => FALLBACK_AI_DEFAULTS);
			await pixelApi.generateScript(projectId, {
				provider: defaults.preferred_provider || FALLBACK_AI_DEFAULTS.preferred_provider,
				model: defaults.preferred_model || FALLBACK_AI_DEFAULTS.preferred_model,
				min_duration: scriptMinDuration,
				max_duration: scriptMaxDuration,
			});
			await loadProject();
		} catch (nextError) {
			setJobError(
				nextError instanceof Error
					? nextError.message
					: "Failed to generate script",
			);
		} finally {
			setIsGeneratingScript(false);
		}
	};

	const handleCompile = async () => {
		setIsCompiling(true);
		setJobError(null);
		try {
			const response = await pixelApi.compileProject(projectId);
			const job = await pixelApi.getJob(response.job_id);
			setActiveJob(job);
		} catch (nextError) {
			setJobError(
				nextError instanceof Error
					? nextError.message
					: "Failed to start compilation",
			);
		} finally {
			setIsCompiling(false);
		}
	};

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await pixelApi.deleteProject(projectId);
			router.push("/projects");
		} catch (nextError) {
			setJobError(
				nextError instanceof Error
					? nextError.message
					: "Failed to remove project",
			);
			setIsDeleting(false);
		}
	};

	const handleAddLocalSource = async () => {
		if (!addFile) return;
		setIsAddingSourceSubmitting(true);
		setAddSourceError(null);
		try {
			const upload = await pixelApi.uploadFile(addFile);
			await pixelApi.addVideoToProject(projectId, {
				local_path: upload.paths[0],
				title: addFile.name,
			});
			setIsAddingSource(false);
			setAddFile(null);
			if (addFileRef.current) addFileRef.current.value = "";
			await loadProject();
		} catch (err) {
			setAddSourceError(err instanceof Error ? err.message : "Failed to add file");
		} finally {
			setIsAddingSourceSubmitting(false);
		}
	};

	const handleAddUrlSource = async () => {
		const url = addUrl.trim();
		if (!url) return;
		setIsAddingSourceSubmitting(true);
		setAddSourceError(null);
		try {
			await pixelApi.addVideoToProject(projectId, {
				source_url: url,
				title: url.split("/").pop() ?? "video",
			});
			if (isManualProject) {
				const { job_id } = await pixelApi.downloadSource(projectId, url);
				const job = await pixelApi.getJob(job_id);
				setActiveJob(job);
			}
			setIsAddingSource(false);
			setAddUrl("");
			await loadProject();
		} catch (err) {
			setAddSourceError(err instanceof Error ? err.message : "Failed to add URL");
		} finally {
			setIsAddingSourceSubmitting(false);
		}
	};

	const handleRemoveSource = async (videoId: string) => {
		setIsRemovingSource(true);
		try {
			await pixelApi.removeVideoFromProject(projectId, videoId);
			setRemoveConfirmId(null);
			await loadProject();
		} catch (err) {
			setJobError(err instanceof Error ? err.message : "Failed to remove source");
			setRemoveConfirmId(null);
		} finally {
			setIsRemovingSource(false);
		}
	};

	if (isLoading) {
		return (
			<div className="min-h-screen bg-background text-foreground px-6 py-10">
				<div className="mx-auto max-w-7xl text-sm text-muted-foreground">
					Loading project...
				</div>
			</div>
		);
	}

	if (error || !project) {
		return (
			<div className="min-h-screen bg-background text-foreground px-6 py-10">
				<div className="mx-auto max-w-7xl space-y-4">
					<div className="text-sm text-destructive">
						{error || "Project not found"}
					</div>
					<Button asChild variant="outline">
						<Link href="/projects">Back to projects</Link>
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Header />
			<header className="border-b border-border/70 px-6 py-5">
				<div className="mx-auto flex max-w-7xl items-start justify-between gap-6">
					<div className="space-y-3">
						<Link
							href="/projects"
							className="text-xs uppercase tracking-[0.24em] text-muted-foreground"
						>
							OpenClyp Studio
						</Link>
						<div className="flex flex-wrap items-center gap-3">
							<h1 className="text-3xl font-semibold tracking-tight">
								{project.name}
							</h1>
							<Badge variant="outline" className="capitalize">
								{project.status || "Draft"}
							</Badge>
							{isManualProject && (
								<Badge className="border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400">
									Manual Editing
								</Badge>
							)}
							{isManualProject && (transcribedCount > 0 || hasScript) && (
								<Badge className="border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400">
									AI Assistance Enabled
								</Badge>
							)}
							{!isManualProject && manualEditExists && (
								<Badge className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
									Manually Edited
								</Badge>
							)}
						</div>
						<p className="max-w-3xl text-sm text-muted-foreground">
							{project.topic || "No topic defined"}
						</p>
						{sourceOrigin && (
							<p className="text-sm text-muted-foreground italic">
								{getSourceOriginLabel(sourceOrigin)}
							</p>
						)}
					</div>
					<div className="flex flex-wrap gap-2">
						<Button asChild>
							<Link href={buildEditorUrl(project.id)}>Open Editor</Link>
						</Button>
						<Button asChild variant="outline">
							<a href={pixelApi.selectedClipsExportUrl(project.id)}>Export Clips</a>
						</Button>
						{project.output_path ? (
							<Button asChild variant="outline">
								<a href={pixelApi.downloadProjectUrl(project.id)}>Download Video</a>
							</Button>
						) : null}
					</div>
				</div>
			</header>

			<main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr]">
				{/* ── Left column ─────────────────────────────────────────────── */}
				<div className="space-y-6">
					{/* Project workflow */}
					<Card>
						<CardHeader>
							<CardTitle>Project Workflow</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{isManualProject ? (
								<>
									<p className="text-sm text-muted-foreground">
										Manual editing project — arrange clips in the Studio editor and
										export directly. Optionally run AI steps to generate transcripts
										and clip suggestions.
									</p>
									<div className="flex flex-wrap gap-3">
										<Button asChild>
											<Link href={buildEditorUrl(project.id)}>Open in Studio</Link>
										</Button>
										<Button
											variant="outline"
											onClick={handleCompile}
											disabled={isCompiling || isProcessing}
										>
											{isCompiling ? "Compiling..." : "Compile Video"}
										</Button>
									</div>
									{(project.videos?.length ?? 0) > 0 && (
										<div className="rounded-xl border border-border/70 bg-muted/10 p-4 space-y-3">
											<div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
												AI Assistance (Optional)
											</div>
											<div className="grid gap-2 sm:grid-cols-2">
												<Button
													size="sm"
													variant="outline"
													onClick={handleProcess}
													disabled={isProcessing || isCompiling}
												>
													{isProcessing ? "Processing..." : "Generate Transcript"}
												</Button>
												<Button
													size="sm"
													variant="outline"
													onClick={handleGenerateScript}
													disabled={isGeneratingScript || isCompiling || transcribedCount === 0}
												>
													{isGeneratingScript ? "Generating..." : "Generate AI script"}
												</Button>
												<Button
													size="sm"
													variant="outline"
													onClick={handleGenerateScript}
													disabled={isGeneratingScript || isCompiling || transcribedCount === 0}
												>
													{isGeneratingScript ? "Suggesting..." : "Suggest clips from transcript"}
												</Button>
											</div>
											{transcribedCount === 0 ? (
												<p className="text-xs text-muted-foreground">
													Run <strong>Generate transcript from sources</strong> first to enable AI clip suggestions.
												</p>
											) : !hasScript ? (
												<p className="text-xs text-muted-foreground">
													{transcribedCount} source{transcribedCount !== 1 ? "s" : ""} transcribed — ready for AI script generation.
												</p>
											) : (
												<p className="text-xs text-muted-foreground">
													AI suggestions active — <strong>{selectedClipCount} clip{selectedClipCount !== 1 ? "s" : ""}</strong> selected. See the AI Script section below.
												</p>
											)}
										</div>
									)}
								</>
							) : (
								<>
									{/* Transcription settings */}
									<div className="space-y-1">
										<button
											type="button"
											className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
											onClick={() => setShowProcessConfig(!showProcessConfig)}
										>
											<span>Transcription settings</span>
											<span>{showProcessConfig ? "▲" : "▼"}</span>
										</button>
										{showProcessConfig && (
											<div className="rounded-xl border border-border/70 bg-muted/10 p-4 space-y-4">
												<div className="grid gap-3 sm:grid-cols-3">
													<div className="space-y-1">
														<label className="text-xs text-muted-foreground">
															Model
														</label>
														<select
															value={processModel}
															onChange={(e) => setProcessModel(e.target.value)}
															className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
														>
															{PROCESS_MODELS.map((m) => (
																<option key={m.value} value={m.value}>
																	{m.label}
																</option>
															))}
														</select>
													</div>
													<div className="space-y-1">
														<label className="text-xs text-muted-foreground">
															Language
														</label>
														<select
															value={processLanguage}
															onChange={(e) => setProcessLanguage(e.target.value)}
															className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
														>
															{PROCESS_LANGUAGES.map((l) => (
																<option key={l.value} value={l.value}>
																	{l.label}
																</option>
															))}
														</select>
													</div>
													<div className="space-y-1">
														<label className="text-xs text-muted-foreground">
															Beam size
														</label>
														<select
															value={processBeamSize}
															onChange={(e) =>
																setProcessBeamSize(Number(e.target.value))
															}
															className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
														>
															{PROCESS_BEAM_SIZES.map((s) => (
																<option key={s} value={s}>
																	{s}
																</option>
															))}
														</select>
													</div>
												</div>
												<div className="flex items-center gap-2">
													<input
														type="checkbox"
														id="proc-diarize"
														checked={processDiarize}
														onChange={(e) =>
															setProcessDiarize(e.target.checked)
														}
														className="size-4 accent-foreground"
													/>
													<label
														htmlFor="proc-diarize"
														className="text-sm cursor-pointer"
													>
														Enable speaker diarization
													</label>
												</div>
											</div>
										)}
									</div>
									{/* Script settings */}
									<div className="space-y-1">
										<button
											type="button"
											className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
											onClick={() => setShowScriptConfig(!showScriptConfig)}
										>
											<span>Script settings</span>
											<span>{showScriptConfig ? "▲" : "▼"}</span>
										</button>
										{showScriptConfig && (
											<div className="rounded-xl border border-border/70 bg-muted/10 p-4 space-y-3">
												<p className="text-xs text-muted-foreground">
													Target clip duration range for AI script generation.
												</p>
												<div className="grid gap-3 sm:grid-cols-2">
													<div className="space-y-1">
														<label className="text-xs text-muted-foreground">
															Min duration (seconds)
														</label>
														<input
															type="number"
															min={5}
															max={300}
															value={scriptMinDuration}
															onChange={(e) =>
																setScriptMinDuration(Number(e.target.value))
															}
															className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
														/>
													</div>
													<div className="space-y-1">
														<label className="text-xs text-muted-foreground">
															Max duration (seconds)
														</label>
														<input
															type="number"
															min={10}
															max={600}
															value={scriptMaxDuration}
															onChange={(e) =>
																setScriptMaxDuration(Number(e.target.value))
															}
															className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
														/>
													</div>
												</div>
											</div>
										)}
									</div>
									<div className="grid gap-3 md:grid-cols-3">
										<Button onClick={handleProcess} disabled={isProcessing || isCompiling}>
											{isProcessing ? "Processing..." : "1. Process videos"}
										</Button>
										<Button
											variant="outline"
											onClick={handleGenerateScript}
											disabled={isGeneratingScript || isCompiling || transcribedCount === 0}
										>
											{isGeneratingScript
												? "Generating..."
												: hasScript
												? "2. Regenerate script"
												: "2. Generate script"}
										</Button>
										<Button
											variant="outline"
											onClick={handleCompile}
											disabled={isCompiling || isProcessing}
										>
											{isCompiling ? "Compiling..." : "3. Compile"}
										</Button>
									</div>
									{/* Pipeline readiness hint */}
									{transcribedCount === 0 && (project?.videos?.length ?? 0) > 0 ? (
										<p className="text-xs text-muted-foreground">
											Run <strong>Step 1</strong> to transcribe your sources before generating a script.
										</p>
									) : transcribedCount > 0 && !hasScript ? (
										<p className="text-xs text-muted-foreground">
											{transcribedCount} source{transcribedCount !== 1 ? "s" : ""} transcribed — ready for <strong>Step 2</strong>.
										</p>
									) : hasScript && !project?.output_path ? (
										<p className="text-xs text-muted-foreground">
											Script with <strong>{selectedClipCount} clip{selectedClipCount !== 1 ? "s" : ""}</strong> selected — ready for <strong>Step 3</strong>.
										</p>
									) : hasScript && project?.output_path ? (
										<p className="text-xs text-muted-foreground">
											Compiled output exists. Re-run any step to update.
										</p>
									) : null}
								</>
							)}
							{jobError ? (
								<div className="text-sm text-destructive">{jobError}</div>
							) : null}
							{activeJob ? (
								<div className="rounded-xl border border-border/70 bg-muted/20 p-4">
									<div className="flex items-center justify-between gap-4">
										<div className="text-sm font-medium">
											Job {activeJob.job_id.slice(0, 8)}
										</div>
										<Badge variant="outline">{activeJob.status}</Badge>
									</div>
									<div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
										<div
											className="h-full bg-foreground transition-all"
											style={{ width: `${Math.max(0, Math.min(100, activeJob.progress || 0))}%` }}
										/>
									</div>
									<div className="mt-2 text-xs text-muted-foreground">
										{activeJob.progress || 0}% completed
									</div>
									{activeJob.logs?.length ? (
										<pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-black px-3 py-3 text-xs text-white">
											{activeJob.logs.slice(-18).join("\n")}
										</pre>
									) : null}
								</div>
							) : null}
						</CardContent>
					</Card>

					{/* AI Script & Suggested Clips — origin layer */}
					{isManualProject && !hasScript ? (
						<Card className="border-dashed border-border/50">
							<CardHeader>
								<CardTitle className="text-muted-foreground">
									AI Script &amp; Suggested Clips
								</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									{transcribedCount > 0
										? "Sources transcribed — run Generate AI script above to get clip suggestions."
										: "No AI suggestions yet. Use the AI assistance panel in Project workflow to generate transcripts and clip suggestions."}
								</p>
							</CardContent>
						</Card>
					) : (
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between gap-3">
									<CardTitle>AI Script &amp; Suggested Clips</CardTitle>
									<div className="flex items-center gap-2">
										<Badge variant="secondary" className="text-xs">
											AI-generated
										</Badge>
										{hasScript && (
											<Button
												size="sm"
												variant="ghost"
												className="h-7 px-2 text-xs"
												onClick={handleGenerateScript}
												disabled={isGeneratingScript || transcribedCount === 0}
											>
												{isGeneratingScript ? "Regenerating..." : "Regenerate"}
											</Button>
										)}
									</div>
								</div>
								{manualEditExists && (
									<p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
										A manual edit session exists in the Studio. These AI
										suggestions may differ from the final edited version.
									</p>
								)}
								{project.script?.title && (
									<p className="mt-2 text-sm font-medium">{project.script.title}</p>
								)}
								{project.script?.description && (
									<p className="mt-1 text-xs text-muted-foreground">
										{project.script.description}
									</p>
								)}
							</CardHeader>
							<CardContent className="space-y-3">
								{project.script?.segments?.length ? (
									<>
										<p className="text-xs text-muted-foreground">
											{project.script.segments.filter((s) => s.selected !== false).length} of{" "}
											{project.script.segments.length} clips selected
										</p>
										{project.script.segments.map((segment, index) => {
											const ignored = segment.selected === false;
											const duration =
												(Number(segment.end || 0) - Number(segment.start || 0)).toFixed(1);
											return (
												<div
													key={segment.id || `${segment.video_id}-${index}`}
													className={`rounded-xl border p-4 transition-opacity ${
														ignored
															? "border-border/40 opacity-50"
															: "border-border/70"
													}`}
												>
													<div className="flex flex-wrap items-start justify-between gap-3">
														<div className="font-medium leading-tight">
															{segment.label || `Clip ${index + 1}`}
														</div>
														<div className="flex shrink-0 items-center gap-2">
															<span className="text-xs text-muted-foreground">
																{Number(segment.start || 0).toFixed(1)}s –{" "}
																{Number(segment.end || 0).toFixed(1)}s
															</span>
															<Badge
																variant="outline"
																className={`text-[10px] ${
																	ignored
																		? "border-border/40 text-muted-foreground"
																		: "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400"
																}`}
															>
																{ignored ? "Ignored" : "Selected"}
															</Badge>
														</div>
													</div>
													<div className="mt-2 flex flex-wrap gap-2">
														<Badge variant="outline" className="text-[10px]">
															{duration}s
														</Badge>
														<Badge variant="outline" className="text-[10px]">
															Track {segment.track || 1}
														</Badge>
														{segment.video_id ? (
															<Badge variant="outline" className="text-[10px]">
																src {segment.video_id.slice(0, 8)}
															</Badge>
														) : null}
													</div>
													{segment.reason ? (
														<p className="mt-2 text-xs italic text-muted-foreground">
															{segment.reason}
														</p>
													) : null}
													{segment.text_overlay ? (
														<p className="mt-2 text-xs text-muted-foreground">
															Overlay: {segment.text_overlay}
														</p>
													) : null}
												</div>
											);
										})}
									</>
								) : (
									<div className="space-y-2 text-sm text-muted-foreground">
										{(project.videos?.length ?? 0) === 0 ? (
											<p>
												Add sources in the{" "}
												<strong>Sources</strong> panel to get started.
											</p>
										) : transcribedCount === 0 ? (
											<>
												<p>
													<strong>Step 1</strong> — Process your sources to
													transcribe them before generating a script.
												</p>
												<p className="text-xs">
													{project.videos?.length} source
													{(project.videos?.length ?? 0) !== 1 ? "s" : ""} added,
													none transcribed yet.
												</p>
											</>
										) : (
											<>
												<p>
													<strong>Step 2</strong> — Run{" "}
													<strong>Generate script</strong> above to get AI clip
													suggestions.
												</p>
												<p className="text-xs">
													{transcribedCount} source
													{transcribedCount !== 1 ? "s" : ""} transcribed and ready.
												</p>
											</>
										)}
									</div>
								)}
							</CardContent>
						</Card>
					)}

					{/* Manual Edit Session — only when editor work exists */}
					{manualEditExists && (
						<Card className="border-amber-500/30">
							<CardHeader>
								<div className="flex items-center justify-between gap-3">
									<CardTitle>Manual Edit Session</CardTitle>
									<Badge className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
										Manually edited
									</Badge>
								</div>
								<p className="mt-1 text-xs text-muted-foreground">
									This layer represents what was built in the Studio editor and
									may differ from the AI script above.
								</p>
							</CardHeader>
							<CardContent className="space-y-3">
								{editorSessionSummary ? (
									<div className="rounded-xl border border-border/70 bg-muted/10 p-4 text-sm">
										<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
											Editor session
										</div>
										<div className="mt-2 font-medium">
											{editorSessionSummary.canvas?.width || "-"} ×{" "}
											{editorSessionSummary.canvas?.height || "-"} ·{" "}
											{editorSessionSummary.fps || "-"} fps ·{" "}
											{formatDuration(Number(editorSessionSummary.duration_seconds || 0))}
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											assets {editorSessionSummary.assets_count || 0} · tracks{" "}
											{editorSessionSummary.timeline_tracks_count || 0} · elements{" "}
											{editorSessionSummary.timeline_elements_count || 0}
										</div>
										{(lastOpenedAt || lastClosedAt || lastSyncedAt) && (
											<div className="mt-2 text-xs text-muted-foreground">
												{lastOpenedAt
													? `opened ${formatDate(lastOpenedAt)}`
													: "no opening record"}
												{lastClosedAt ? ` · closed ${formatDate(lastClosedAt)}` : ""}
												{lastSyncedAt ? ` · synced ${formatDate(lastSyncedAt)}` : ""}
											</div>
										)}
									</div>
								) : null}
								{lastEditorExport ? (
									<div className="rounded-xl border border-border/70 bg-muted/10 p-4 text-sm">
										<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
											Last Studio export
										</div>
										<div className="mt-2 font-medium">
											{lastEditorExport.filename || "local file"}
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{String(lastEditorExport.format || "-").toUpperCase()} ·{" "}
											{lastEditorExport.quality || "-"} ·{" "}
											{lastEditorExport.includeAudio ? "audio included" : "no audio"} ·{" "}
											{formatDate(lastEditorExport.exportedAt)}
										</div>
									</div>
								) : null}
							</CardContent>
						</Card>
					)}
				</div>

				{/* ── Right column ─────────────────────────────────────────────── */}
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>Summary</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
							<Metric label="Videos" value={String(project.videos?.length || 0)} />
							{(!isManualProject || hasScript) && (
								<Metric
									label="AI Clips"
									value={String(project.script?.segments?.length || 0)}
								/>
							)}
							{!isManualProject && (
								<Metric
									label="Pipeline"
									value={
										compileReadiness === "no-sources"
											? "No sources"
											: compileReadiness === "no-transcription"
											? "Need transcription"
											: compileReadiness === "no-script"
											? "Need script"
											: compileReadiness === "ready"
											? "Ready to compile"
											: "Compiled"
									}
								/>
							)}
							<Metric label="Duration" value={totalDuration} />
							<Metric
								label="Updated"
								value={formatDate(project.updated_at || project.created_at)}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<div className="flex items-center justify-between gap-3">
								<CardTitle>Sources</CardTitle>
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setIsAddingSource(!isAddingSource);
										setAddSourceError(null);
									}}
								>
									{isAddingSource ? "Cancel" : "+ Add source"}
								</Button>
							</div>
						</CardHeader>
						<CardContent className="space-y-3">
							{/* Add source form */}
							{isAddingSource && (
								<div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
									<div className="flex gap-2">
										<Button
											size="sm"
											variant={addSourceMode === "url" ? "default" : "outline"}
											onClick={() => setAddSourceMode("url")}
										>
											URL
										</Button>
										<Button
											size="sm"
											variant={addSourceMode === "local" ? "default" : "outline"}
											onClick={() => setAddSourceMode("local")}
										>
											Local file
										</Button>
									</div>
									{addSourceMode === "url" && (
										<div className="space-y-2">
											<input
												type="text"
												value={addUrl}
												onChange={(e) => setAddUrl(e.target.value)}
												placeholder="https://youtube.com/watch?v=..."
												className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
											/>
											<p className="text-xs text-muted-foreground">
												Supports YouTube, TikTok, Instagram and other yt-dlp
												sources.{isManualProject
													? " The source will be downloaded without transcription."
													: " You can transcribe it via Process after adding."}
											</p>
											<Button
												size="sm"
												onClick={handleAddUrlSource}
												disabled={!addUrl.trim() || isAddingSourceSubmitting}
											>
												{isAddingSourceSubmitting ? "Adding..." : "Add URL"}
											</Button>
										</div>
									)}
									{addSourceMode === "local" && (
										<div className="space-y-2">
											<input
												ref={addFileRef}
												type="file"
												accept="video/*,audio/*"
												className="w-full text-sm text-muted-foreground"
												onChange={(e) =>
													setAddFile(e.target.files?.[0] ?? null)
												}
											/>
											<Button
												size="sm"
												onClick={handleAddLocalSource}
												disabled={!addFile || isAddingSourceSubmitting}
											>
												{isAddingSourceSubmitting ? "Uploading..." : "Add file"}
											</Button>
										</div>
									)}
									{addSourceError && (
										<div className="text-sm text-destructive">{addSourceError}</div>
									)}
								</div>
							)}

							{/* Source list */}
							{project.videos?.length ? (
								project.videos.map((video) => {
									const kind = getVideoSourceKind(video);
									return (
										<div
											key={video.id}
											className="rounded-xl border border-border/70 p-3"
										>
											<div className="flex items-start justify-between gap-3">
												<div className="min-w-0 flex-1">
													<div className="truncate font-medium">
														{video.title || `Source ${video.id.slice(0, 8)}`}
													</div>
													<div className="mt-1 flex flex-wrap items-center gap-2">
														<Badge variant="outline" className="text-[10px]">
															{SOURCE_KIND_LABELS[kind]}
														</Badge>
														<SourceStatusBadge status={video.status || "pending"} />
														{video.duration ? (
															<span className="text-xs text-muted-foreground">
																·{" "}
																{formatDuration(Number(video.duration))}
															</span>
														) : null}
													</div>
													{video.source_url ? (
														<div className="mt-1 truncate text-xs text-muted-foreground">
															{video.source_url}
														</div>
													) : null}
													{video.local_path && !video.source_url ? (
														<div className="mt-1 truncate text-xs text-muted-foreground">
															{video.local_path.split(/[/\\]/).pop()}
														</div>
													) : null}
												</div>
												{removeConfirmId === video.id ? (
													<div className="flex shrink-0 gap-2">
														<Button
															size="sm"
															variant="destructive"
															onClick={() => handleRemoveSource(video.id)}
															disabled={isRemovingSource}
														>
															{isRemovingSource ? "Removing..." : "Confirm"}
														</Button>
														<Button
															size="sm"
															variant="outline"
															onClick={() => setRemoveConfirmId(null)}
														>
															Cancel
														</Button>
													</div>
												) : (
													<Button
														size="sm"
														variant="ghost"
														className="shrink-0 text-muted-foreground hover:text-destructive"
														onClick={() => setRemoveConfirmId(video.id)}
													>
														Remove
													</Button>
												)}
											</div>
										</div>
									);
								})
							) : (
								<div className="text-sm text-muted-foreground">
									No sources added yet. Use "+ Add source" to attach media.
								</div>
							)}
						</CardContent>
					</Card>

					{/* Outputs — Pipeline vs Manual, with recency highlight */}
					<Card>
						<CardHeader>
							<CardTitle>Outputs</CardTitle>
							{manualEditExists && project.output_path && (
								<p className="mt-1 text-xs text-muted-foreground">
									Two output layers exist. The most recent is highlighted.
								</p>
							)}
						</CardHeader>
						<CardContent className="space-y-4">
							{/* Pipeline Output */}
							<div
								className={`rounded-xl border p-4 text-sm transition-colors ${
									outputRecency === "pipeline"
										? "border-foreground/30 bg-muted/30"
										: "border-border/70 bg-muted/10"
								}`}
							>
								<div className="flex items-center justify-between gap-2">
									<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
										Pipeline output
									</div>
									{outputRecency === "pipeline" && (
										<Badge variant="outline" className="text-[10px]">
											Most recent
										</Badge>
									)}
								</div>
								{project.output_path ? (
									<>
										<div className="mt-2 font-medium">Compiled video available</div>
										<div className="mt-1 text-xs text-muted-foreground">
											Generated by the Python pipeline
											{hasScript && (
												<> &mdash; based on{" "}
													<strong>{selectedClipCount} clip{selectedClipCount !== 1 ? "s" : ""}</strong>
												</>
											)}
										</div>
									</>
								) : compileReadiness === "no-sources" ? (
									<div className="mt-2 text-muted-foreground">
										Add sources to this project before compiling.
									</div>
								) : compileReadiness === "no-transcription" ? (
									<div className="mt-2 text-muted-foreground">
										Run <strong>Step 1 &mdash; Process videos</strong> to transcribe sources first.
									</div>
								) : compileReadiness === "no-script" ? (
									<div className="mt-2 text-muted-foreground">
										Run <strong>Step 2 &mdash; Generate script</strong> to select clips before compiling.
									</div>
								) : (
									<div className="mt-2 text-muted-foreground">
										Script ready with{" "}
										<strong>{selectedClipCount} clip{selectedClipCount !== 1 ? "s" : ""}</strong>
										{" "}selected &mdash; run <strong>Step 3 &mdash; Compile</strong> to create the video.
									</div>
								)}
							</div>

							{/* Manual Edit Output */}
							<div
								className={`rounded-xl border p-4 text-sm transition-colors ${
									outputRecency === "manual"
										? "border-amber-500/40 bg-amber-500/5"
										: "border-border/70 bg-muted/10"
								}`}
							>
								<div className="flex items-center justify-between gap-2">
									<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
										Manual edit output
									</div>
									{outputRecency === "manual" && (
										<Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400">
											Most recent
										</Badge>
									)}
								</div>
								{lastEditorExport ? (
									<>
										<div className="mt-2 font-medium">
											{lastEditorExport.filename || "Studio export"}
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{String(lastEditorExport.format || "-").toUpperCase()} ·{" "}
											{lastEditorExport.quality || "-"} ·{" "}
											exported {formatDate(lastEditorExport.exportedAt)}
										</div>
									</>
								) : (
									<div className="mt-2 text-muted-foreground">
										No Studio export yet.{" "}
										<Link href={buildEditorUrl(project.id)} className="underline underline-offset-2">
											Open editor
										</Link>{" "}
										to create one.
									</div>
								)}
							</div>

							{/* Actions */}
							<div className="space-y-2 pt-1">
								<Button asChild className="w-full">
									<Link href={buildEditorUrl(project.id)}>Edit in Studio</Link>
								</Button>
								{project.output_path ? (
									<Button asChild variant="outline" className="w-full">
										<a href={pixelApi.downloadProjectUrl(project.id)}>
											Download compiled video
										</a>
									</Button>
								) : null}
								{transcribedCount > 0 && (
									<Button asChild variant="outline" className="w-full">
										<a href={pixelApi.exportSrtUrl(project.id)}>Download SRT subtitles</a>
									</Button>
								)}
								{hasScript && (
									<Button asChild variant="outline" className="w-full">
										<a href={pixelApi.selectedClipsExportUrl(project.id)}>
											Export selected clips
										</a>
									</Button>
								)}
								<Button
									variant="destructive"
									className="w-full"
									onClick={handleDelete}
									disabled={isDeleting}
								>
									{isDeleting ? "Removing..." : "Delete project"}
								</Button>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>YouTube Publishing</CardTitle>
						</CardHeader>
						<CardContent>
							<PublishPanel project={project} onPublishDone={loadProject} />
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}

function Metric({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div className="rounded-xl border border-border/70 bg-muted/20 p-4">
			<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
				{label}
			</div>
			<div className="mt-1 font-medium">{value}</div>
		</div>
	);
}

function SourceStatusBadge({ status }: { status: string }) {
	const classMap: Record<string, string> = {
		transcribed:
			"border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400",
		transcribing:
			"border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
		downloading:
			"border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
		downloaded:
			"border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400",
		error: "border-destructive/40 bg-destructive/10 text-destructive",
	};
	const cls = classMap[status] ?? "border-border/50 text-muted-foreground";
	return (
		<Badge variant="outline" className={`text-[10px] ${cls}`}>
			{status}
		</Badge>
	);
}
