"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { pixelApi } from "@/integrations/pixel/api";
import { pixelEditorSelectors, usePixelEditorStore } from "@/stores/pixel-editor-store";
import { cn } from "@/utils/ui";

function formatTime(seconds?: number | null) {
	const total = Math.max(0, Math.round(Number(seconds || 0)));
	const minutes = Math.floor(total / 60);
	const remain = total % 60;
	return `${minutes}:${String(remain).padStart(2, "0")}`;
}

export function PixelEditorShell({ projectId }: { projectId: string }) {
	const {
		project,
		isLoading,
		error,
		activeTool,
		activeVideoId,
		activeSegmentId,
		activeAssetId,
		loadProject,
		setActiveTool,
		selectVideo,
		selectSegment,
		selectAsset,
	} = usePixelEditorStore();

	useEffect(() => {
		loadProject(projectId);
	}, [loadProject, projectId]);

	const videos = pixelEditorSelectors.videos(project);
	const segments = pixelEditorSelectors.segments(project);
	const assets = pixelEditorSelectors.assets(project);

	const activeVideo = videos.find((video) => video.id === activeVideoId) || videos[0] || null;
	const activeSegment = segments.find((segment) => segment.id === activeSegmentId) || null;
	const activeAsset = assets.find((asset) => asset.id === activeAssetId) || null;

	const previewUrl = useMemo(() => {
		if (!project || !activeVideo) return null;
		return pixelApi.videoMediaUrl(project.id, activeVideo.id);
	}, [project, activeVideo]);

	const transcriptItems = useMemo(
		() =>
			videos.flatMap((video) =>
				(video.transcription || []).map((segment, index) => ({
					key: `${video.id}-${index}`,
					videoId: video.id,
					videoTitle: video.title || video.source_url || video.local_path || "Fonte",
					start: Number(segment.start || 0),
					end: Number(segment.end || 0),
					text: segment.text || "",
				})),
			),
		[videos],
	);

	if (isLoading) {
		return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando editor...</div>;
	}

	if (error || !project) {
		return (
			<div className="flex min-h-screen items-center justify-center px-6">
				<Card className="w-full max-w-2xl border-destructive/30">
					<CardContent className="space-y-4 p-6">
						<div className="text-lg font-semibold">Falha ao carregar o editor</div>
						<div className="text-sm text-destructive">
							{error || "Projeto não encontrado"}
						</div>
						<Button asChild variant="outline">
							<Link href="/projects">Voltar para projetos</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
			<header className="border-b border-border/70 px-5 py-3">
				<div className="flex items-center justify-between gap-4">
					<div className="min-w-0">
						<div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
							OpenClyp Studio Editor
						</div>
						<h1 className="mt-1 truncate text-xl font-semibold">{project.name}</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Frontend React/Tailwind integrado ao nosso fluxo, com backend Python como API.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button asChild variant="outline">
							<Link href="/projects">Projetos</Link>
						</Button>
						<Button asChild>
							<a href={pixelApi.selectedClipsExportUrl(project.id)} target="_blank" rel="noreferrer">
								Exportar clips
							</a>
						</Button>
					</div>
				</div>
			</header>

			<div className="min-h-0 flex-1">
				<ResizablePanelGroup direction="vertical" className="size-full gap-[0.18rem]">
					<ResizablePanel defaultSize={68} minSize={38}>
						<ResizablePanelGroup direction="horizontal" className="size-full gap-[0.18rem] px-3 pt-3">
							<ResizablePanel defaultSize={22} minSize={18} maxSize={30}>
								<Card className="panel flex h-full min-h-0 overflow-hidden rounded-sm">
									<CardContent className="grid min-h-0 grid-cols-[72px_1fr] gap-0 p-0">
										<div className="border-r border-border/70 p-2">
											<div className="grid gap-2">
												{([
													["media", "Media"],
													["text", "Text"],
													["audio", "Audio"],
													["ai", "AI"],
													["export", "Export"],
												] as const).map(([tool, label]) => (
													<button
														key={tool}
														className={cn(
															"rounded-md border px-2 py-3 text-xs uppercase tracking-[0.18em] text-muted-foreground transition",
															activeTool === tool
																? "border-primary/40 bg-primary/10 text-foreground"
																: "border-border/70 bg-background hover:bg-accent",
														)}
														onClick={() => setActiveTool(tool)}
													>
														{label}
													</button>
												))}
											</div>
										</div>
										<div className="min-h-0 overflow-auto p-4">
											{activeTool === "media" && (
												<div className="space-y-4">
													<div>
														<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
															Assets
														</div>
														<div className="mt-3 space-y-2">
															{videos.map((video) => (
																<button
																	key={video.id}
																	className={cn(
																		"w-full rounded-xl border p-3 text-left",
																		activeVideoId === video.id
																			? "border-primary/40 bg-primary/10"
																			: "border-border/70 hover:bg-accent",
																	)}
																	onClick={() => selectVideo(video.id)}
																>
																	<div className="font-medium">
																		{video.title || video.source_url || video.local_path || "Vídeo"}
																	</div>
																	<div className="mt-1 text-xs text-muted-foreground">
																		{video.status || "pending"} • {formatTime(video.duration)}
																	</div>
																</button>
															))}
														</div>
													</div>

													<div>
														<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
															Media assets
														</div>
														<div className="mt-3 space-y-2">
															{assets.map((asset) => (
																<button
																	key={asset.id}
																	className={cn(
																		"w-full rounded-xl border p-3 text-left",
																		activeAssetId === asset.id
																			? "border-primary/40 bg-primary/10"
																			: "border-border/70 hover:bg-accent",
																	)}
																	onClick={() => selectAsset(asset.id)}
																>
																	<div className="font-medium">{asset.label}</div>
																	<div className="mt-1 text-xs text-muted-foreground">
																		Track {asset.track} • Start {formatTime(asset.start)} • {formatTime(asset.duration)}
																	</div>
																</button>
															))}
														</div>
													</div>
												</div>
											)}

											{activeTool === "text" && (
												<div className="space-y-2">
													<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
														Transcript
													</div>
													{transcriptItems.map((item) => (
														<button
															key={item.key}
															className="w-full rounded-xl border border-border/70 p-3 text-left hover:bg-accent"
															onClick={() => selectVideo(item.videoId)}
														>
															<div className="text-xs text-muted-foreground">
																{item.videoTitle} • {formatTime(item.start)}
															</div>
															<div className="mt-1 text-sm">{item.text}</div>
														</button>
													))}
												</div>
											)}

											{activeTool === "audio" && (
												<div className="space-y-3 text-sm text-muted-foreground">
													<div className="rounded-xl border border-border/70 p-4">
														Mixagem, narração e trilha do projeto serão conectadas aqui via API Python.
													</div>
												</div>
											)}

											{activeTool === "ai" && (
												<div className="space-y-3 text-sm text-muted-foreground">
													<div className="rounded-xl border border-border/70 p-4">
														Hooks, resumos, sugestões e automações do pipeline serão conectados aqui.
													</div>
												</div>
											)}

											{activeTool === "export" && (
												<div className="space-y-3 text-sm text-muted-foreground">
													<div className="rounded-xl border border-border/70 p-4">
														Render final e presets de saída continuarão delegados ao backend Python.
													</div>
												</div>
											)}
										</div>
									</CardContent>
								</Card>
							</ResizablePanel>

							<ResizableHandle withHandle />

							<ResizablePanel defaultSize={50} minSize={32}>
								<Card className="panel flex h-full min-h-0 flex-col rounded-sm">
									<CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4">
										<div className="flex items-center justify-between gap-3">
											<div>
												<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
													Preview
												</div>
												<div className="mt-1 text-sm text-muted-foreground">
													{activeVideo?.title || activeVideo?.source_url || activeVideo?.local_path || "Nenhuma fonte ativa"}
												</div>
											</div>
											<div className="rounded-full border border-border px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
												{project.status || "draft"}
											</div>
										</div>
										<div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border/70 bg-black/70 p-3">
											{previewUrl ? (
												<video
													key={previewUrl}
													src={previewUrl}
													controls
													preload="metadata"
													className="max-h-full w-full rounded-lg border border-border/70 bg-black object-contain"
												/>
											) : (
												<div className="text-sm text-muted-foreground">
													Nenhum vídeo local disponível para preview
												</div>
											)}
										</div>
										<div className="grid grid-cols-3 gap-3">
											<div className="rounded-xl border border-border/70 p-3">
												<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
													Clips
												</div>
												<div className="mt-1 text-lg font-semibold">{segments.length}</div>
											</div>
											<div className="rounded-xl border border-border/70 p-3">
												<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
													Assets
												</div>
												<div className="mt-1 text-lg font-semibold">{assets.length}</div>
											</div>
											<div className="rounded-xl border border-border/70 p-3">
												<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
													Fontes
												</div>
												<div className="mt-1 text-lg font-semibold">{videos.length}</div>
											</div>
										</div>
									</CardContent>
								</Card>
							</ResizablePanel>

							<ResizableHandle withHandle />

							<ResizablePanel defaultSize={28} minSize={18}>
								<Card className="panel flex h-full min-h-0 rounded-sm">
									<CardContent className="min-h-0 flex-1 overflow-auto p-4">
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											Properties
										</div>

										{activeAsset ? (
											<div className="mt-4 space-y-3">
												<div className="rounded-xl border border-border/70 p-4">
													<div className="text-sm font-medium">{activeAsset.label}</div>
													<div className="mt-2 text-sm text-muted-foreground">
														Track {activeAsset.track} • Start {formatTime(activeAsset.start)} • Duração {formatTime(activeAsset.duration)}
													</div>
												</div>
											</div>
										) : activeSegment ? (
											<div className="mt-4 space-y-3">
												<div className="rounded-xl border border-border/70 p-4">
													<div className="text-sm font-medium">
														{activeSegment.label || "Clip selecionado"}
													</div>
													<div className="mt-2 text-sm text-muted-foreground">
														{formatTime(activeSegment.start)} → {formatTime(activeSegment.end)} • Track {activeSegment.track || 1}
													</div>
													{activeSegment.reason ? (
														<div className="mt-3 text-sm text-muted-foreground">
															{activeSegment.reason}
														</div>
													) : null}
												</div>
												<Button
													variant="outline"
													className="w-full"
													asChild
												>
													<a
														href={pixelApi.clipDownloadUrl(project.id, activeSegment.id)}
														target="_blank"
														rel="noreferrer"
													>
														Baixar clip
													</a>
												</Button>
											</div>
										) : (
											<div className="mt-4 rounded-xl border border-border/70 p-4 text-sm text-muted-foreground">
												Selecione um asset ou clip para ver propriedades.
											</div>
										)}
									</CardContent>
								</Card>
							</ResizablePanel>
						</ResizablePanelGroup>
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel defaultSize={32} minSize={18} className="px-3 pb-3">
						<Card className="panel h-full rounded-sm">
							<CardContent className="flex h-full min-h-0 flex-col p-4">
								<div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
									<div>
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											Timeline
										</div>
										<div className="mt-1 text-sm text-muted-foreground">
											Assets de vídeo e clips de IA divididos por track.
										</div>
									</div>
								</div>
								<div className="mt-4 flex-1 overflow-auto">
									<div className="space-y-4">
										<div className="space-y-2">
											<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
												Video Assets
											</div>
											{[1, 2, 3].map((track) => (
												<div key={`asset-track-${track}`} className="grid grid-cols-[80px_1fr] gap-3">
													<div className="flex items-center justify-center rounded-lg border border-border/70 bg-muted/20 text-xs uppercase tracking-[0.18em] text-muted-foreground">
														V{track}
													</div>
													<div className="rounded-lg border border-border/70 bg-muted/10 p-2">
														<div className="flex min-h-14 gap-2 overflow-x-auto">
															{assets
																.filter((asset) => Number(asset.track || 1) === track)
																.map((asset) => (
																	<button
																		key={asset.id}
																		className={cn(
																			"min-w-44 rounded-md border px-3 py-2 text-left",
																			activeAssetId === asset.id
																				? "border-primary/40 bg-primary/10"
																				: "border-border/70 bg-background hover:bg-accent",
																		)}
																		onClick={() => selectAsset(asset.id)}
																	>
																		<div className="font-medium">{asset.label}</div>
																		<div className="mt-1 text-xs text-muted-foreground">
																			Start {formatTime(asset.start)} • {formatTime(asset.duration)}
																		</div>
																	</button>
																))}
														</div>
													</div>
												</div>
											))}
										</div>

										<div className="space-y-2">
											<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
												AI Clips
											</div>
											{[1, 2, 3].map((track) => (
												<div key={`segment-track-${track}`} className="grid grid-cols-[80px_1fr] gap-3">
													<div className="flex items-center justify-center rounded-lg border border-border/70 bg-muted/20 text-xs uppercase tracking-[0.18em] text-muted-foreground">
														C{track}
													</div>
													<div className="rounded-lg border border-border/70 bg-muted/10 p-2">
														<div className="flex min-h-14 gap-2 overflow-x-auto">
															{segments
																.filter((segment) => Number(segment.track || 1) === track)
																.map((segment) => (
																	<button
																		key={segment.id}
																		className={cn(
																			"min-w-44 rounded-md border px-3 py-2 text-left",
																			activeSegmentId === segment.id
																				? "border-primary/40 bg-primary/10"
																				: "border-border/70 bg-background hover:bg-accent",
																		)}
																		onClick={() => selectSegment(segment.id)}
																	>
																		<div className="font-medium">
																			{segment.label || "Clip"}
																		</div>
																		<div className="mt-1 text-xs text-muted-foreground">
																			{formatTime(segment.start)} → {formatTime(segment.end)}
																		</div>
																	</button>
																))}
														</div>
													</div>
												</div>
											))}
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</ResizablePanel>
				</ResizablePanelGroup>
			</div>
		</div>
	);
}
