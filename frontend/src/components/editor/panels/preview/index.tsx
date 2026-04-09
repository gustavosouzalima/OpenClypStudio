"use client";

import { useCallback, useMemo, useRef, useEffect, useState, useSyncExternalStore } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { useEditorStatic } from "@/hooks/use-editor-static";
import { useRafLoop } from "@/hooks/use-raf-loop";
import { useVideoFrameLoop } from "@/hooks/use-video-frame-loop";
import { useContainerSize } from "@/hooks/use-container-size";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { PixiRenderer } from "@/services/renderer/pixi-renderer";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import { buildScene } from "@/services/renderer/scene-builder";
import { videoCache } from "@/services/video-cache/service";
import { getLastFrameTime } from "@/lib/time";
import { PreviewInteractionOverlay } from "./preview-interaction-overlay";
import { BookmarkNoteOverlay } from "./bookmark-note-overlay";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { usePreviewStore } from "@/stores/preview-store";
import { PreviewContextMenu } from "./context-menu";
import { PreviewToolbar } from "./toolbar";
import { PreviewEmptyState } from "./empty-state";

function usePreviewSize() {
	const editor = useEditorStatic();
	const activeProject = editor.project.getActive();

	return {
		width: activeProject?.settings.canvasSize.width,
		height: activeProject?.settings.canvasSize.height,
	};
}

function useStoreTick(subscribeStore: (listener: () => void) => () => void): number {
	const versionRef = useRef(0);
	const subscribe = useCallback(
		(onStoreChange: () => void) =>
			subscribeStore(() => {
				versionRef.current += 1;
				onStoreChange();
			}),
		[subscribeStore],
	);
	const getSnapshot = useCallback(() => versionRef.current, []);
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function PreviewPanel() {
	const containerRef = useRef<HTMLDivElement>(null);
	const { isFullscreen, toggleFullscreen } = useFullscreen({ containerRef });
	const editor = useEditorStatic();
	const mediaTick = useStoreTick((listener) => editor.media.subscribe(listener));
	const timelineTick = useStoreTick((listener) => editor.timeline.subscribe(listener));
	const rendererTick = useStoreTick((listener) => editor.renderer.subscribe(listener));
	const mediaAssets = useMemo(() => editor.media.getAssets(), [editor, mediaTick]);
	const tracks = useMemo(() => editor.timeline.getTracks(), [editor, timelineTick]);

	const hasTimelineContent = tracks.some((track) => track.elements.length > 0);
	const renderTree = useMemo(() => editor.renderer.getRenderTree(), [editor, rendererTick]);
	const hasRenderTree = renderTree && renderTree.duration > 0;

	return (
		<div
			ref={containerRef}
			className="panel relative flex size-full min-h-0 min-w-0 flex-col rounded-lg border"
		>
			<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-3 pb-0">
				{!hasTimelineContent && !hasRenderTree ? (
					<PreviewEmptyState
						mediaCount={mediaAssets.length}
						videoCount={mediaAssets.filter((a) => a.type === "video").length}
						imageCount={mediaAssets.filter((a) => a.type === "image").length}
						audioCount={mediaAssets.filter((a) => a.type === "audio").length}
					/>
				) : (
					<div className="animate-in fade-in-0 zoom-in-95 duration-220 ease-out w-full h-full flex flex-col">
						<PreviewCanvas
							onToggleFullscreen={toggleFullscreen}
							containerRef={containerRef}
						/>
						<RenderTreeController />
					</div>
				)}
			</div>
			<PreviewToolbar
				isFullscreen={isFullscreen}
				onToggleFullscreen={toggleFullscreen}
			/>
		</div>
	);
}

function RenderTreeController() {
	const editor = useEditorStatic();
	const timelineTick = useStoreTick((listener) => editor.timeline.subscribe(listener));
	const mediaTick = useStoreTick((listener) => editor.media.subscribe(listener));
	const projectTick = useStoreTick((listener) => editor.project.subscribe(listener));
	const tracks = useMemo(() => editor.timeline.getTracks(), [editor, timelineTick]);
	const mediaAssets = useMemo(() => editor.media.getAssets(), [editor, mediaTick]);
	const activeProject = useMemo(() => editor.project.getActive(), [editor, projectTick]);

	const { width, height } = usePreviewSize();

	useDeepCompareEffect(() => {
		if (!activeProject) return;

		const videoAssetsInTimeline = mediaAssets.filter(
			(asset) =>
				asset.type === "video" &&
				asset.file &&
				tracks.some(
					(track) =>
						track.type === "video" &&
						track.elements.some(
							(element) =>
								"mediaId" in element && element.mediaId === asset.id,
						),
				),
		);

		for (const asset of videoAssetsInTimeline) {
			void videoCache.prewarm({ mediaId: asset.id, file: asset.file });
		}

		const duration = editor.timeline.getTotalDuration();
		const renderTree = buildScene({
			tracks,
			mediaAssets,
			duration,
			canvasSize: { width, height },
			background: activeProject.settings.background,
			isPreview: true,
		});

		editor.renderer.setRenderTree({ renderTree });
	}, [tracks, mediaAssets, activeProject?.settings.background, width, height]);

	return null;
}

function PreviewCanvas({
	onToggleFullscreen,
	containerRef,
}: {
	onToggleFullscreen: () => void;
	containerRef: React.RefObject<HTMLElement | null>;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const outerContainerRef = useRef<HTMLDivElement>(null);
	const canvasBoundsRef = useRef<HTMLDivElement>(null);
	const syncVideoRef = useRef<HTMLVideoElement | null>(null);
	const perfOverlayRef = useRef<HTMLDivElement | null>(null);
	const lastFrameRef = useRef(-1);
	const lastSceneRef = useRef<RootNode | null>(null);
	const lastRenderTimestampRef = useRef(0);
	const renderingRef = useRef(false);
	const perfSampleRef = useRef({
		frames: 0,
		frameTimeMsSum: 0,
		startedAtMs: 0,
		lastFlushMs: 0,
	});
	const [syncVideoReady, setSyncVideoReady] = useState(false);
	const reactCommitsPerSecondRef = useRef(0);
	const droppedFramesRef = useRef(0);
	const commitCounterRef = useRef(0);
	const commitWindowStartedAtRef = useRef<number>(0);
	const syncVideoBlobUrlRef = useRef<string | null>(null);
	const syncVideoMediaIdRef = useRef<string | null>(null);
	const { width: nativeWidth, height: nativeHeight } = usePreviewSize();
	const containerSize = useContainerSize({ containerRef: outerContainerRef });
	const editor = useEditorStatic();
	const timelineTick = useStoreTick((listener) => editor.timeline.subscribe(listener));
	const mediaTick = useStoreTick((listener) => editor.media.subscribe(listener));
	const projectTick = useStoreTick((listener) => editor.project.subscribe(listener));
	const rendererTick = useStoreTick((listener) => editor.renderer.subscribe(listener));
	const activeProject = useMemo(() => editor.project.getActive(), [editor, projectTick]);
	const tracks = useMemo(() => editor.timeline.getTracks(), [editor, timelineTick]);
	const mediaAssets = useMemo(() => editor.media.getAssets(), [editor, mediaTick]);
	const { overlays, performanceMode } = usePreviewStore();
	const syncVideoAsset = useMemo(() => {
		const videoTrack = tracks.find((track) => track.type === "video");
		if (!videoTrack) return null;
		const firstVideoElement = videoTrack.elements.find((element) => "mediaId" in element);
		if (!firstVideoElement || !("mediaId" in firstVideoElement)) return null;
		return (
			mediaAssets.find((asset) => asset.id === firstVideoElement.mediaId && asset.file) ??
			null
		);
	}, [mediaAssets, tracks]);

	// Setup sync video element for requestVideoFrameCallback timing
	useEffect(() => {
		if (!outerContainerRef.current) return;
		if (!syncVideoAsset?.file) {
			setSyncVideoReady(false);
			return;
		}

		const mediaId = syncVideoAsset.id;

		// Skip re-setup if the same asset is already loaded
		if (syncVideoMediaIdRef.current === mediaId && syncVideoRef.current) {
			return;
		}

		syncVideoMediaIdRef.current = mediaId;

		// Clean up previous element and blob URL
		if (syncVideoBlobUrlRef.current) {
			URL.revokeObjectURL(syncVideoBlobUrlRef.current);
			syncVideoBlobUrlRef.current = null;
		}
		if (syncVideoRef.current && syncVideoRef.current.parentNode) {
			syncVideoRef.current.parentNode.removeChild(syncVideoRef.current);
		}

		const videoElement = document.createElement("video");
		videoElement.id = "preview-sync-video";
		videoElement.dataset.mediaId = mediaId;
		videoElement.muted = true;
		videoElement.playsInline = true;
		videoElement.preload = "auto";
		videoElement.style.cssText =
			"position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;visibility:hidden;z-index:-1";

		// Use a blob URL directly — no crossOrigin needed for same-origin blob URLs.
		// Avoid FileReader.readAsDataURL: it encodes the entire file as base64 in
		// memory (100 MB video → 133 MB string) which easily exceeds the 2-second
		// timeout before loadeddata fires.
		const blobUrl = URL.createObjectURL(syncVideoAsset.file);
		syncVideoBlobUrlRef.current = blobUrl;
		syncVideoRef.current = videoElement;

		let ready = false;
		let loadTimeout: number | null = null;

		const markReady = () => {
			if (ready) return;
			ready = true;
			if (loadTimeout !== null) {
				clearTimeout(loadTimeout);
				loadTimeout = null;
			}
			setSyncVideoReady(true);
		};

		// canplay fires as soon as the browser can start playing — earlier than
		// loadeddata and sufficient for requestVideoFrameCallback to work.
		videoElement.oncanplay = markReady;
		videoElement.onloadeddata = markReady;

		loadTimeout = window.setTimeout(() => {
			if (!ready) {
				console.warn("[PreviewCanvas] Sync video load timeout, using RAF fallback");
				setSyncVideoReady(false);
			}
		}, 5000);

		videoElement.src = blobUrl;
		outerContainerRef.current.appendChild(videoElement);

		return () => {
			if (loadTimeout !== null) clearTimeout(loadTimeout);
			videoElement.oncanplay = null;
			videoElement.onloadeddata = null;
			// Abort any in-flight network request BEFORE revoking the blob URL.
			// Setting src="" + load() cancels the pending fetch; revoking before
			// this causes ERR_FILE_NOT_FOUND (visible in React StrictMode double-invoke).
			videoElement.pause();
			videoElement.removeAttribute("src");
			videoElement.load();
			if (videoElement.parentNode) videoElement.parentNode.removeChild(videoElement);
			if (syncVideoBlobUrlRef.current) {
				URL.revokeObjectURL(syncVideoBlobUrlRef.current);
				syncVideoBlobUrlRef.current = null;
			}
			syncVideoRef.current = null;
			syncVideoMediaIdRef.current = null;
			setSyncVideoReady(false);
		};
	}, [outerContainerRef, syncVideoAsset]);

	// Sync video playback with audio playback.
	// editor.playback is a stable object reference, so depending on it as an
	// effect dep never re-fires when play/pause happens. Instead, subscribe
	// directly so we react to every state change.
	useEffect(() => {
		if (!syncVideoReady) return;

		const sync = () => {
			const video = syncVideoRef.current;
			if (!video) return;
			// Guard: element must have a valid source before any playback operation.
			// Without this, play() rejects with NotSupportedError when called during
			// the cleanup window (src removed) or before the blob URL is assigned.
			if (!video.src && !video.srcObject) return;

			const isPlaying = editor.playback.getIsPlaying();
			const currentTime = editor.playback.getCurrentTime();
			if (isPlaying) {
				if (video.paused) {
					video.play().catch((err: unknown) => {
						// NotSupportedError: src was revoked or not yet assigned.
						// AbortError: play() was interrupted by a subsequent pause().
						// Both are benign — silence them and let the next sync tick recover.
						if (
							err instanceof DOMException &&
							(err.name === "NotSupportedError" || err.name === "AbortError")
						) {
							return;
						}
						console.warn("[PreviewCanvas] sync video play() failed:", err);
					});
				}
				if (
					video.readyState >= HTMLMediaElement.HAVE_METADATA &&
					Math.abs(video.currentTime - currentTime) > 0.1
				) {
					video.currentTime = currentTime;
				}
			} else {
				if (!video.paused) video.pause();
			}
		};

		sync(); // apply current state immediately
		return editor.playback.subscribe(sync);
	}, [editor.playback, syncVideoReady]);

	// PixiRenderer initializes PixiJS asynchronously in the background.
	// Before PixiJS is ready, renderToCanvas falls back to a direct Canvas 2D copy.
	const renderer = useMemo(
		() =>
			new PixiRenderer({
				width: nativeWidth,
				height: nativeHeight,
				fps: activeProject.settings.fps,
			}),
		[nativeWidth, nativeHeight, activeProject.settings.fps],
	);

	// Dispose renderer when it is replaced (dimensions/fps change) or on unmount
	useEffect(() => () => renderer.dispose(), [renderer]);

	const displaySize = useMemo(() => {
		if (
			!nativeWidth ||
			!nativeHeight ||
			containerSize.width === 0 ||
			containerSize.height === 0
		) {
			return { width: nativeWidth ?? 0, height: nativeHeight ?? 0 };
		}

		const paddingBuffer = 4;
		const availableWidth = containerSize.width - paddingBuffer;
		const availableHeight = containerSize.height - paddingBuffer;
		const scale = Math.min(
			availableWidth / Math.max(1, nativeWidth),
			availableHeight / Math.max(1, nativeHeight),
		);

		return {
			width: Math.max(1, Math.floor(nativeWidth * scale)),
			height: Math.max(1, Math.floor(nativeHeight * scale)),
		};
	}, [nativeWidth, nativeHeight, containerSize.width, containerSize.height]);

	const renderTree = useMemo(() => editor.renderer.getRenderTree(), [editor, rendererTick]);
	const isDevPerfEnabled = process.env.NODE_ENV !== "production";

	useEffect(() => {
		commitCounterRef.current += 1;
	}, [timelineTick, mediaTick, projectTick, rendererTick, syncVideoReady, performanceMode, overlays.bookmarks]);

	useEffect(() => {
		if (!isDevPerfEnabled) return;
		commitWindowStartedAtRef.current = performance.now();
		const timer = window.setInterval(() => {
			const now = performance.now();
			const elapsedMs = now - commitWindowStartedAtRef.current;
			if (elapsedMs <= 0) return;
			const cps = commitCounterRef.current / (elapsedMs / 1000);
			reactCommitsPerSecondRef.current = Number(cps.toFixed(1));
			commitCounterRef.current = 0;
			commitWindowStartedAtRef.current = now;
		}, 1000);
		return () => window.clearInterval(timer);
	}, [isDevPerfEnabled]);

	const render = useCallback(() => {
		if (canvasRef.current && renderTree && !renderingRef.current) {
			const now = performance.now();
			const previewFpsCap =
				performanceMode === "quality"
					? 60
					: performanceMode === "balanced"
						? 45
						: 30;
			const previewFps = Math.min(renderer.fps, previewFpsCap);
			const minFrameInterval = 1000 / previewFps;
			const deltaMs = now - lastRenderTimestampRef.current;
			if (lastRenderTimestampRef.current > 0 && deltaMs > minFrameInterval * 1.8) {
				droppedFramesRef.current += Math.max(
					1,
					Math.floor(deltaMs / Math.max(1, minFrameInterval)) - 1,
				);
			}
			if (deltaMs < minFrameInterval) {
				return;
			}

			const syncTime = syncVideoRef.current?.currentTime;
			const time =
				typeof syncTime === "number" &&
				Number.isFinite(syncTime) &&
				syncTime >= 0
					? syncTime
					: editor.playback.getCurrentTime();
			const lastFrameTime = getLastFrameTime({
				duration: renderTree.duration,
				fps: renderer.fps,
			});
			const renderTime = Math.min(time, lastFrameTime);
			const frame = Math.floor(renderTime * renderer.fps);

			if (
				frame !== lastFrameRef.current ||
				renderTree !== lastSceneRef.current
			) {
				const renderStartedAt = performance.now();
				lastRenderTimestampRef.current = now;
				renderingRef.current = true;
				lastSceneRef.current = renderTree;
				lastFrameRef.current = frame;
				renderer
					.renderToCanvas({
						node: renderTree,
						time: renderTime,
						targetCanvas: canvasRef.current,
					})
					.then(() => {
						if (!isDevPerfEnabled) return;
						const sample = perfSampleRef.current;
						const nowMs = performance.now();
						if (sample.lastFlushMs === 0) {
							sample.lastFlushMs = nowMs;
						}
						sample.frames += 1;
						sample.frameTimeMsSum += nowMs - renderStartedAt;

						const elapsedMs = nowMs - sample.lastFlushMs;
						if (elapsedMs >= 1000) {
							const fps = sample.frames / (elapsedMs / 1000);
							const frameMs =
								sample.frames > 0 ? sample.frameTimeMsSum / sample.frames : 0;
							const perfWithMemory = performance as Performance & {
								memory?: { usedJSHeapSize?: number };
							};
							const usedHeap = perfWithMemory.memory?.usedJSHeapSize;
							const heapMb =
								typeof usedHeap === "number"
									? Number((usedHeap / (1024 * 1024)).toFixed(1))
									: null;

							const fpsLabel = Number(fps.toFixed(1));
							const frameMsLabel = Number(frameMs.toFixed(2));
							const dropped = droppedFramesRef.current;
							const rcps = reactCommitsPerSecondRef.current;
							if (perfOverlayRef.current) {
								perfOverlayRef.current.textContent =
									`FPS ${fpsLabel} | ${frameMsLabel}ms | Drop ${dropped} | RCPS ${rcps} | Heap ${heapMb ?? "n/a"}MB`;
							}
							console.table({
								preview_fps: fpsLabel,
								preview_frame_ms: frameMsLabel,
								preview_heap_mb: heapMb ?? "n/a",
								preview_dropped_frames: dropped,
								react_commits_per_second: rcps,
								webcodecs_enabled: process.env.NEXT_PUBLIC_WEBCODECS_ENABLED !== "false",
							});

							sample.frames = 0;
							sample.frameTimeMsSum = 0;
							sample.lastFlushMs = nowMs;
						}
					})
					.then(() => {
						renderingRef.current = false;
					})
					.catch((error) => {
						console.error("[PreviewCanvas] render failed:", error);
						renderingRef.current = false;
					});
			}
		}
	}, [renderer, renderTree, editor.playback, performanceMode, isDevPerfEnabled]);

	// Use requestVideoFrameCallback when sync video is available for better A/V sync
	const hasVideoFrameCallback: boolean = syncVideoReady && syncVideoRef.current !== null &&
		typeof syncVideoRef.current.requestVideoFrameCallback === "function";

	// rVFC fires at video frame boundaries during playback — better A/V timing.
	useVideoFrameLoop({
		callback: () => { render(); },
		videoElement: syncVideoRef.current,
		enabled: hasVideoFrameCallback,
	});

	// RAF loop always runs as fallback: handles scrub-while-paused and any case
	// where rVFC isn't firing. Frame deduplication in render() prevents double work.
	useRafLoop(render, true);

	return (
		<div
			ref={outerContainerRef}
			className="relative flex size-full items-center justify-center"
		>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						ref={canvasBoundsRef}
						className="relative"
						style={{ width: displaySize.width, height: displaySize.height }}
					>
						<canvas
							ref={canvasRef}
							width={nativeWidth}
							height={nativeHeight}
							className="block border"
							style={{
								width: displaySize.width,
								height: displaySize.height,
								background:
									activeProject.settings.background.type === "blur"
										? "transparent"
										: activeProject?.settings.background.color,
							}}
						/>
						<PreviewInteractionOverlay
							canvasRef={canvasRef}
							containerRef={canvasBoundsRef}
						/>
						{isDevPerfEnabled && (
							<div
								ref={perfOverlayRef}
								className="pointer-events-none absolute right-2 top-2 rounded bg-black/70 px-2 py-1 font-mono text-[11px] text-white"
							/>
						)}
						{overlays.bookmarks && <BookmarkNoteOverlay />}
					</div>
				</ContextMenuTrigger>
				<PreviewContextMenu
					onToggleFullscreen={onToggleFullscreen}
					containerRef={containerRef}
				/>
			</ContextMenu>
		</div>
	);
}
