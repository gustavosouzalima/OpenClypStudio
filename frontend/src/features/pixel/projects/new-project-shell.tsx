"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/header";
import { pixelApi } from "@/integrations/pixel/api";
import type { PixelJobStatus } from "@/integrations/pixel/types";
import { navigateToEditor } from "@/lib/editor-routing";

// ─── Constants ───────────────────────────────────────────────────────────────

const WHISPER_MODELS = [
	{ value: "large-v3-turbo", label: "large-v3-turbo (recommended)" },
	{ value: "large-v3", label: "large-v3 (most accurate, slower)" },
	{ value: "large-v2", label: "large-v2" },
	{ value: "medium", label: "medium (faster)" },
	{ value: "small", label: "small (fast)" },
	{ value: "tiny", label: "tiny (fastest)" },
];

const LANGUAGES = [
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

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectMode = "ai" | "manual";
type Step = "mode" | "info" | "source" | "config" | "processing";
type SourceMode = "blank" | "local" | "url";

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({
	current,
	mode,
}: {
	current: Step;
	mode: ProjectMode;
}) {
	const aiSteps: { id: Step; label: string }[] = [
		{ id: "info", label: "1. Project" },
		{ id: "source", label: "2. Media" },
		{ id: "config", label: "3. Transcription" },
		{ id: "processing", label: "4. Processing" },
	];
	const manualSteps: { id: Step; label: string }[] = [
		{ id: "info", label: "1. Project" },
		{ id: "source", label: "2. Media" },
	];
	const steps = mode === "ai" ? aiSteps : manualSteps;

	return (
		<div className="flex items-center gap-2 flex-wrap">
			{steps.map((step, i) => (
				<div key={step.id} className="flex items-center gap-2">
					<span
						className={
							step.id === current
								? "text-sm font-medium text-foreground"
								: "text-sm text-muted-foreground"
						}
					>
						{step.label}
					</span>
					{i < steps.length - 1 && (
						<span className="text-muted-foreground/40">›</span>
					)}
				</div>
			))}
		</div>
	);
}

function JobProgress({
	job,
	onCancel,
	isCancelling,
}: {
	job: PixelJobStatus;
	onCancel: () => void;
	isCancelling: boolean;
}) {
	const isDone = job.status === "done";
	const isError = job.status === "error";
	const isCancelled = job.status === "cancelled";
	const isActive = !isDone && !isError && !isCancelled;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<span className="text-sm font-medium">
						Job {job.job_id.slice(0, 8)}
					</span>
					<Badge variant="outline">{job.status}</Badge>
				</div>
				{isActive && (
					<Button
						variant="outline"
						size="sm"
						onClick={onCancel}
						disabled={isCancelling}
					>
						{isCancelling ? "Cancelling..." : "Cancel"}
					</Button>
				)}
			</div>

			<div className="h-2 overflow-hidden rounded-full bg-muted">
				<div
					className={`h-full transition-all ${isError ? "bg-destructive" : isCancelled ? "bg-muted-foreground" : "bg-foreground"}`}
					style={{
						width: `${Math.max(0, Math.min(100, job.progress || 0))}%`,
					}}
				/>
			</div>
			<div className="text-xs text-muted-foreground">
				{job.progress || 0}% Completed
			</div>

			{job.error && (
				<div className="text-sm text-destructive">Error: {job.error}</div>
			)}

			{job.logs?.length ? (
				<pre className="max-h-64 overflow-auto rounded-lg bg-black px-3 py-3 text-xs text-white">
					{job.logs.slice(-20).join("\n")}
				</pre>
			) : null}
		</div>
	);
}

// ─── Main shell ───────────────────────────────────────────────────────────────

export function NewProjectShell() {
	const router = useRouter();
	const searchParams = useSearchParams();

	// history_ids passed from Transcriptions → New Project flow
	// history_id passed from Audio Recorder → New Project flow
	const historyIdsParam = searchParams.get("history_ids");
	const historyIdParam = searchParams.get("history_id");

	const sourceHistoryIds: string[] = [
		...(historyIdsParam ? historyIdsParam.split(",").filter(Boolean) : []),
		...(historyIdParam ? [historyIdParam] : []),
	];

	const fromTranscript = sourceHistoryIds.length > 0;
	const sourceOrigin = historyIdsParam
		? "transcriptions"
		: historyIdParam
			? "audio-recorder"
			: null;

	// When coming from a transcript, default to AI mode and skip mode selection
	const [mode, setMode] = useState<ProjectMode>(fromTranscript ? "ai" : "ai");
	const [step, setStep] = useState<Step>(fromTranscript ? "info" : "mode");

	// Step 1: Project info
	const [name, setName] = useState("");
	const [topic, setTopic] = useState("");

	// Step 2: Source
	const [sourceMode, setSourceMode] = useState<SourceMode>("local");
	const [file, setFile] = useState<File | null>(null);
	const [sourceUrl, setSourceUrl] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Step 3 (AI only): Transcription config
	const [model, setModel] = useState("small");
	const [language, setLanguage] = useState("auto");
	const [beamSize, setBeamSize] = useState(1);

	// Step processing
	const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
	const [activeJob, setActiveJob] = useState<PixelJobStatus | null>(null);
	const [isCancelling, setIsCancelling] = useState(false);
	const [processingError, setProcessingError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// ─── Validation ───────────────────────────────────────────────────────────

	const canAdvanceFromInfo = name.trim().length > 0;
	const canAdvanceFromSource =
		sourceMode === "blank" ||
		(sourceMode === "local" ? file !== null : sourceUrl.trim().length > 0);

	// ─── Handlers ─────────────────────────────────────────────────────────────

	const handleSelectMode = (selected: ProjectMode) => {
		setMode(selected);
		setStep("info");
		if (selected === "manual") setSourceMode("blank");
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selected = e.target.files?.[0] ?? null;
		setFile(selected);
	};

	const pollJob = (
		job_id: string,
		onComplete?: (job: PixelJobStatus) => void,
	) => {
		const interval = window.setInterval(async () => {
			try {
				const next = await pixelApi.getJob(job_id);
				setActiveJob(next);
				if (
					next.status === "done" ||
					next.status === "error" ||
					next.status === "cancelled"
				) {
					window.clearInterval(interval);
					onComplete?.(next);
				}
			} catch {
				// ignore poll errors
			}
		}, 1500);
	};

	// AI-assisted project creation flow
	const handleStartAiProcessing = async () => {
		setIsSubmitting(true);
		setProcessingError(null);
		try {
			const project = await pixelApi.createProject({
				name: name.trim(),
				topic: topic.trim(),
				config: {
					project_type: "ai",
					...(fromTranscript ? { source_history_ids: sourceHistoryIds } : {}),
					...(sourceOrigin ? { source_origin: sourceOrigin } : {}),
				},
			});
			setCreatedProjectId(project.id);

			if (sourceMode === "local" && file) {
				const upload = await pixelApi.uploadFile(file);
				await pixelApi.addVideoToProject(project.id, {
					local_path: upload.paths[0],
					title: file.name,
				});
			} else if (sourceMode === "url" && sourceUrl.trim()) {
				await pixelApi.addVideoToProject(project.id, {
					source_url: sourceUrl.trim(),
					title: sourceUrl.trim().split("/").pop() ?? "video",
				});
			}

			const { job_id } = await pixelApi.processProject(project.id, {
				model,
				language,
				beam_size: beamSize,
			});
			const job = await pixelApi.getJob(job_id);
			setActiveJob(job);
			setStep("processing");
			pollJob(job_id);
		} catch (err) {
			setProcessingError(
				err instanceof Error ? err.message : "Failed to start processing",
			);
			setStep("config");
		} finally {
			setIsSubmitting(false);
		}
	};

	// Manual project creation flow
	const handleCreateManual = async () => {
		setIsSubmitting(true);
		setProcessingError(null);
		try {
			const project = await pixelApi.createProject({
				name: name.trim(),
				topic: topic.trim() || undefined,
				config: { project_type: "manual" },
			});
			setCreatedProjectId(project.id);

			if (sourceMode === "blank") {
				// Go directly to editor
				navigateToEditor(router, project.id);
				return;
			}

			if (sourceMode === "local" && file) {
				const upload = await pixelApi.uploadFile(file);
				await pixelApi.addVideoToProject(project.id, {
					local_path: upload.paths[0],
					title: file.name,
				});
				navigateToEditor(router, project.id);
				return;
			}

			if (sourceMode === "url" && sourceUrl.trim()) {
				await pixelApi.addVideoToProject(project.id, {
					source_url: sourceUrl.trim(),
					title: sourceUrl.trim().split("/").pop() ?? "video",
				});
				// Download the source without transcription
				const { job_id } = await pixelApi.downloadSource(
					project.id,
					sourceUrl.trim(),
				);
				const job = await pixelApi.getJob(job_id);
				setActiveJob(job);
				setStep("processing");
				pollJob(job_id, (next) => {
					if (next.status === "done") {
						navigateToEditor(router, project.id);
						return;
					}

					if (next.status === "error") {
						setProcessingError(next.error || "Failed to download media from URL");
						return;
					}

					if (next.status === "cancelled") {
						setProcessingError("Media download was cancelled");
					}
				});
			}
		} catch (err) {
			setProcessingError(
				err instanceof Error ? err.message : "Failed to create project",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleCancel = async () => {
		if (!activeJob) return;
		setIsCancelling(true);
		try {
			await pixelApi.cancelJob(activeJob.job_id);
		} catch {
			// ignore
		} finally {
			setIsCancelling(false);
		}
	};

	// ─── Render steps ─────────────────────────────────────────────────────────

	const renderModeSelection = () => (
		<div className="grid gap-4 sm:grid-cols-2">
			<button
				type="button"
				className="rounded-xl border-2 border-border p-6 text-left transition-colors hover:border-foreground hover:bg-muted/20"
				onClick={() => handleSelectMode("ai")}
			>
				<div className="mb-3 text-lg font-semibold">AI-assisted</div>
				<p className="text-sm text-muted-foreground">
					Add media, transcribe with Whisper, generate a clip script with AI,
					then edit and compile. Best for content creation and clipping workflows.
				</p>
			</button>
			<button
				type="button"
				className="rounded-xl border-2 border-border p-6 text-left transition-colors hover:border-foreground hover:bg-muted/20"
				onClick={() => handleSelectMode("manual")}
			>
				<div className="mb-3 text-lg font-semibold">Manual editing</div>
				<p className="text-sm text-muted-foreground">
					Start with a blank timeline or import media and edit directly in the
					Studio. No transcription or AI required. Best for free-form video
					editing.
				</p>
			</button>
		</div>
	);

	const renderInfo = () => (
		<Card>
			<CardHeader>
				<CardTitle>
					{mode === "manual" ? "Manual Editing Project" : "Project Information"}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="space-y-2">
					<Label htmlFor="project-name">Project Name *</Label>
					<Input
						id="project-name"
						placeholder={
							mode === "manual"
								? "E.g. My Edit, Short Clip..."
								: "E.g. John Silva Interview"
						}
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoFocus
					/>
				</div>
				{mode === "ai" && (
					<div className="space-y-2">
						<Label htmlFor="project-topic">Topic / Subject</Label>
						<Input
							id="project-topic"
							placeholder="E.g. technology, business, sports..."
							value={topic}
							onChange={(e) => setTopic(e.target.value)}
						/>
					</div>
				)}
				<div className="flex justify-between">
					{!fromTranscript && (
						<Button variant="outline" onClick={() => setStep("mode")}>
							Back
						</Button>
					)}
					<Button
						className="ml-auto"
						onClick={() => setStep("source")}
						disabled={!canAdvanceFromInfo}
					>
						Continue
					</Button>
				</div>
			</CardContent>
		</Card>
	);

	const renderSource = () => (
		<Card>
			<CardHeader>
				<CardTitle>Media Source</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="flex gap-2 flex-wrap">
					{mode === "manual" && (
						<Button
							variant={sourceMode === "blank" ? "default" : "outline"}
							size="sm"
							onClick={() => setSourceMode("blank")}
						>
							Blank Timeline
						</Button>
					)}
					<Button
						variant={sourceMode === "local" ? "default" : "outline"}
						size="sm"
						onClick={() => setSourceMode("local")}
					>
						Local File
					</Button>
					<Button
						variant={sourceMode === "url" ? "default" : "outline"}
						size="sm"
						onClick={() => setSourceMode("url")}
					>
						URL / YouTube
					</Button>
				</div>

				{sourceMode === "blank" && (
					<div className="rounded-xl border border-border/70 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
						Start with an empty timeline. Import media directly from within the
						Studio editor.
					</div>
				)}

				{sourceMode === "local" && (
					<div className="space-y-3">
						<div
							className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/70 bg-muted/10 p-10 transition-colors hover:bg-muted/20"
							onClick={() => fileInputRef.current?.click()}
							onKeyDown={(e) =>
								e.key === "Enter" && fileInputRef.current?.click()
							}
							tabIndex={0}
							role="button"
						>
							<div className="text-sm text-muted-foreground">
								{file ? file.name : "Click to select a video or audio file"}
							</div>
							{file && (
								<div className="text-xs text-muted-foreground">
									{(file.size / 1024 / 1024).toFixed(1)} MB
								</div>
							)}
						</div>
						<input
							ref={fileInputRef}
							type="file"
							accept="video/*,audio/*"
							className="hidden"
							onChange={handleFileChange}
						/>
					</div>
				)}

				{sourceMode === "url" && (
					<div className="space-y-2">
						<Label htmlFor="source-url">Video URL</Label>
						<Input
							id="source-url"
							placeholder="https://youtube.com/watch?v=... or direct URL"
							value={sourceUrl}
							onChange={(e) => setSourceUrl(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Supports YouTube, Instagram, TikTok, and any source compatible with
							yt-dlp.
							{mode === "manual" &&
								" The video will be downloaded without transcription."}
						</p>
					</div>
				)}

				{processingError && (
					<div className="text-sm text-destructive">{processingError}</div>
				)}

				<div className="flex justify-between">
					<Button variant="outline" onClick={() => setStep("info")}>
						Back
					</Button>
					{mode === "ai" ? (
						<Button
							onClick={() => setStep("config")}
							disabled={!canAdvanceFromSource}
						>
							Continue
						</Button>
					) : (
						<Button
							onClick={handleCreateManual}
							disabled={!canAdvanceFromSource || isSubmitting}
						>
							{isSubmitting
								? "Creating..."
								: sourceMode === "blank"
									? "Create & Open Editor"
									: sourceMode === "url"
										? "Download & Open Editor"
										: "Create & Open Editor"}
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);

	const renderConfig = () => (
		<Card>
			<CardHeader>
				<CardTitle>Transcription Settings</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="space-y-2">
					<Label htmlFor="whisper-model">Transcription Model</Label>
					<select
						id="whisper-model"
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						value={model}
						onChange={(e) => setModel(e.target.value)}
					>
						{WHISPER_MODELS.map((m) => (
							<option key={m.value} value={m.value}>
								{m.label}
							</option>
						))}
					</select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="language">Language</Label>
					<select
						id="language"
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						value={language}
						onChange={(e) => setLanguage(e.target.value)}
					>
						{LANGUAGES.map((l) => (
							<option key={l.value} value={l.value}>
								{l.label}
							</option>
						))}
					</select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="beam-size">
						Beam size <span className="text-muted-foreground">({beamSize})</span>
					</Label>
					<input
						id="beam-size"
						type="range"
						min={1}
						max={10}
						step={1}
						value={beamSize}
						onChange={(e) => setBeamSize(Number(e.target.value))}
						className="w-full accent-foreground"
					/>
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>1 (fastest)</span>
						<span>10 (most accurate)</span>
					</div>
				</div>

				{processingError && (
					<div className="text-sm text-destructive">{processingError}</div>
				)}

				<div className="flex justify-between">
					<Button variant="outline" onClick={() => setStep("source")}>
						Back
					</Button>
					<Button onClick={handleStartAiProcessing} disabled={isSubmitting}>
						{isSubmitting ? "Starting..." : "Start Processing"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);

	const renderProcessing = () => {
		const isDone = activeJob?.status === "done";
		const isError = activeJob?.status === "error";
		const isCancelled = activeJob?.status === "cancelled";
		const isFinished = isDone || isError || isCancelled;
		const isManual = mode === "manual";

		return (
			<Card>
				<CardHeader>
					<CardTitle>
						{isDone
							? isManual
								? "Download complete — opening editor"
								: "Processing complete"
							: isError
								? isManual
									? "Download failed"
									: "Processing failed"
								: isCancelled
									? "Cancelled"
									: isManual
										? "Downloading media..."
										: "Processing..."}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					{activeJob && (
						<JobProgress
							job={activeJob}
							onCancel={handleCancel}
							isCancelling={isCancelling}
						/>
					)}

					{isFinished && createdProjectId && !isManual && (
						<div className="flex flex-wrap gap-3">
							<Button
								onClick={() => router.push(`/projects/${createdProjectId}`)}
							>
								{isDone ? "Open Project" : "View Project"}
							</Button>
							<Button
								variant="outline"
								onClick={() =>
									createdProjectId
										? navigateToEditor(router, createdProjectId)
										: undefined
								}
							>
								Open in Editor
							</Button>
							<Button
								variant="outline"
								onClick={() => router.push("/projects")}
							>
								Back to Projects
							</Button>
						</div>
					)}

					{isFinished && createdProjectId && isManual && (isError || isCancelled) && (
						<div className="flex flex-wrap gap-3">
							<Button
								onClick={() => router.push(`/projects/${createdProjectId}`)}
							>
								View Project
							</Button>
							<Button
								variant="outline"
								onClick={() => setStep("source")}
							>
								Back to Source
							</Button>
							<Button
								variant="outline"
								onClick={() => router.push("/projects")}
							>
								Back to Projects
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
		);
	};

	// ─── Layout ───────────────────────────────────────────────────────────────

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Header />
			<header className="border-b border-border/70 px-6 py-5">
				<div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
					<div className="space-y-2">
						<Link
							href="/projects"
							className="text-xs uppercase tracking-[0.24em] text-muted-foreground"
						>
							OpenClyp Studio
						</Link>
						<div className="flex items-center gap-3">
							<h1 className="text-2xl font-semibold tracking-tight">
								New Project
							</h1>
							{step !== "mode" && (
								<Badge
									variant="outline"
									className={
										mode === "manual"
											? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400"
											: ""
									}
								>
									{mode === "manual" ? "Manual Editing" : "AI-Assisted"}
								</Badge>
							)}
						</div>
					</div>
					<Button asChild variant="outline" size="sm">
						<Link href="/projects">Cancel</Link>
					</Button>
				</div>
			</header>

			<main className="mx-auto max-w-3xl space-y-6 px-6 py-6">
				{fromTranscript && (
					<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
						<div className="flex items-start gap-3">
							<Badge className="mt-0.5 shrink-0 bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
								From Transcript
							</Badge>
							<div className="space-y-1">
								<p className="text-sm font-medium">
									Creating project from {sourceHistoryIds.length} transcription
									{sourceHistoryIds.length !== 1 ? "s" : ""}
								</p>
								<p className="text-xs text-muted-foreground">
									The transcript source will be linked to this project for AI
									processing.
								</p>
							</div>
						</div>
					</div>
				)}

				{step === "mode" && (
					<>
						<div>
							<h2 className="text-lg font-medium">Choose Project Type</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								Select how you want to work with this project.
							</p>
						</div>
						{renderModeSelection()}
					</>
				)}

				{step !== "mode" && (
					<StepIndicator current={step} mode={mode} />
				)}

				{step === "info" && renderInfo()}
				{step === "source" && renderSource()}
				{step === "config" && renderConfig()}
				{step === "processing" && renderProcessing()}
			</main>
		</div>
	);
}
