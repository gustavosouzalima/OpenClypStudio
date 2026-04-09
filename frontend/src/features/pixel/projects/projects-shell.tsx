"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Header } from "@/components/header";
import { pixelApi } from "@/integrations/pixel/api";
import { buildEditorUrl } from "@/lib/editor-routing";
import { usePixelProjectsStore } from "@/stores/pixel-projects-store";

function formatDate(value?: string) {
	if (!value) return "No date";
	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));
}

function projectDuration(project: ReturnType<typeof usePixelProjectsStore.getState>["projects"][number]) {
	const totalSeconds = (project.videos || []).reduce(
		(sum, video) => sum + Number(video.duration || 0),
		0,
	);
	if (!totalSeconds) return "No duration";
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = Math.round(totalSeconds % 60);
	return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function PixelProjectsShell() {
	const { projects, isLoading, error, loadProjects } = usePixelProjectsStore();

	useEffect(() => {
		loadProjects();
	}, [loadProjects]);

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Header />
			<header className="border-b border-border/70 px-6 py-5">
				<div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
					<div>
						<Link href="/" className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
							OpenClyp Studio
						</Link>
						<h1 className="mt-2 text-3xl font-semibold tracking-tight">
							Your Video Projects
						</h1>
						<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
							Create, manage, and edit your video projects using AI-assisted
							workflows or manual editing.
						</p>
					</div>
					<div className="flex gap-3">
						<Button asChild variant="outline">
							<Link href="/documents">AI Documents</Link>
						</Button>
						<Button asChild variant="outline">
							<Link href="/settings">Settings</Link>
						</Button>
						<Button variant="outline" onClick={() => loadProjects()}>
							Refresh
						</Button>
						<Button asChild>
							<Link href="/new-project">New Project</Link>
						</Button>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-7xl px-6 py-6">
				{isLoading ? (
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{Array.from({ length: 6 }).map((_, index) => (
							<div
								key={index}
								className="h-64 animate-pulse rounded-2xl border border-border bg-card/50"
							/>
						))}
					</div>
				) : error ? (
					<Card className="border-destructive/50">
						<CardContent className="flex flex-col items-center justify-center p-12">
							<div className="text-sm text-destructive">{error}</div>
							<Button onClick={() => loadProjects()} className="mt-6">
								Try again
							</Button>
						</CardContent>
					</Card>
				) : projects.length === 0 ? (
					<Card>
						<CardContent className="flex flex-col items-center justify-center p-12">
							<div className="text-4xl mb-4 text-muted-foreground">📁</div>
							<h3 className="text-lg font-semibold">No Projects Found</h3>
							<p className="mt-2 text-center text-sm text-muted-foreground">
								Create your first project to start transcribing and editing media.
							</p>
							<div className="mt-6 flex gap-3">
								<Button asChild>
									<Link href="/new-project">New project</Link>
								</Button>
								<Button asChild variant="outline">
									<Link href="/transcriptions">Transcribe media</Link>
								</Button>
								<Button asChild variant="outline">
									<Link href="/audio-recorder">Record audio</Link>
								</Button>
							</div>
						</CardContent>
					</Card>
				) : (
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{projects.map((project) => {
							const firstVideo = (project.videos || [])[0];
							const thumbnail = firstVideo
								? pixelApi.videoThumbnailUrl(project.id, firstVideo.id)
								: null;
							const projectType = ((project.config || {}) as Record<string, unknown>).project_type as string | undefined;
							const isManual = projectType === "manual";
							return (
								<Card key={project.id} className="overflow-hidden border-border/70">
									<div className="aspect-video bg-muted/50">
										{thumbnail ? (
											<img
												src={thumbnail}
												alt={project.name}
												className="size-full object-cover"
											/>
										) : (
											<div className="flex size-full items-center justify-center text-sm text-muted-foreground">
												No thumbnail
											</div>
										)}
									</div>
									<CardContent className="space-y-4 p-5">
										<div className="space-y-2">
											<div className="flex items-center justify-between gap-3">
												<h2 className="text-lg font-semibold leading-tight">
													{project.name}
												</h2>
												<div className="flex items-center gap-2">
													{isManual && (
														<Badge className="border-blue-500/40 bg-blue-500/10 text-[11px] text-blue-600 dark:text-blue-400">
															Manual
														</Badge>
													)}
													<span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
														{project.status || "draft"}
													</span>
												</div>
											</div>
											<p className="text-sm text-muted-foreground">
												{project.topic || "Project without topic"}
											</p>
										</div>

										<div className="grid gap-3 text-sm">
											<div className="rounded-xl border border-border/70 bg-muted/20 p-3">
												<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
													Clips
												</div>
												<div className="mt-1 font-medium">
													{project.script?.segments?.length || 0}
												</div>
											</div>
											<div className="rounded-xl border border-border/70 bg-muted/20 p-3">
												<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
													Sources
												</div>
												<div className="mt-1 font-medium">
													{project.videos?.length || 0}
												</div>
											</div>
										</div>

										<div className="flex items-center justify-between text-sm text-muted-foreground">
											<span>{projectDuration(project)}</span>
											<span>{formatDate(project.updated_at || project.created_at)}</span>
										</div>

										<div className="flex gap-2">
											<Button asChild className="flex-1">
												<Link href={buildEditorUrl(project.id)}>Open project</Link>
											</Button>
											<Button asChild variant="outline" className="flex-1">
												<Link href={`/projects/${project.id}`}>Details</Link>
											</Button>
										</div>
									</CardContent>
								</Card>
							);
						})}
					</div>
				)}
			</main>
		</div>
	);
}
