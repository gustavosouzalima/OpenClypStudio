"use client";

import { DEFAULT_COLOR, DEFAULT_FPS } from "@/constants/project-constants";
import {
	DEFAULT_BLEND_MODE,
	DEFAULT_OPACITY,
	DEFAULT_TRANSFORM,
	DEFAULT_TIMELINE_VIEW_STATE,
} from "@/constants/timeline-constants";
import { buildDefaultScene } from "@/lib/scenes";
import { buildTextElement } from "@/lib/timeline/element-utils";
import { buildEmptyTrack, ensureMainTrack } from "@/lib/timeline/track-utils";
import { CURRENT_PROJECT_VERSION } from "@/services/storage/migrations";
import { storageService } from "@/services/storage/service";
import type { MediaAsset } from "@/types/assets";
import type { TCanvasSize, TProject } from "@/types/project";
import type { TextTrack, TimelineTrack, VideoTrack } from "@/types/timeline";
import { generateUUID } from "@/utils/id";
import { pixelApi } from "./api";
import type { PixelProject, PixelSegment, PixelVideo } from "./types";

const FALLBACK_CANVAS_LANDSCAPE: TCanvasSize = { width: 1920, height: 1080 };
const FALLBACK_CANVAS_PORTRAIT: TCanvasSize = { width: 1080, height: 1920 };
const MIN_CLIP_DURATION = 0.1;

function isNotFoundError(error: unknown) {
	return error instanceof Error && /404|not found/i.test(error.message);
}

function sanitizeNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coerceDate(value: string | undefined, fallback: Date) {
	if (!value) return fallback;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function inferCanvasSize(project: PixelProject): TCanvasSize {
	const config = project.config ?? {};
	const width = sanitizeNumber(config.width);
	const height = sanitizeNumber(config.height);

	if (width && height) {
		return { width, height };
	}

	const outputFormat =
		typeof config.output_format === "string"
			? config.output_format.toLowerCase()
			: "";
	if (outputFormat.includes("portrait") || outputFormat.includes("9:16")) {
		return FALLBACK_CANVAS_PORTRAIT;
	}

	return FALLBACK_CANVAS_LANDSCAPE;
}

function guessFileExtension({ mimeType, fileName }: { mimeType: string; fileName: string }) {
	const lowerName = fileName.toLowerCase();
	if (lowerName.endsWith(".webm")) return ".webm";
	if (lowerName.endsWith(".mov")) return ".mov";
	if (lowerName.endsWith(".mkv")) return ".mkv";
	if (lowerName.endsWith(".mp4")) return ".mp4";

	if (mimeType.includes("webm")) return ".webm";
	if (mimeType.includes("quicktime")) return ".mov";
	if (mimeType.includes("x-matroska")) return ".mkv";
	return ".mp4";
}

function guessFileName(video: PixelVideo, mimeType: string) {
	const rawName =
		video.local_path?.split(/[\\/]/).pop() ||
		video.title?.trim().replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ") ||
		`video-${video.id}`;

	const cleanName = rawName.trim() || `video-${video.id}`;
	const extension = guessFileExtension({ mimeType, fileName: cleanName });
	return /\.[a-z0-9]{2,5}$/i.test(cleanName)
		? cleanName
		: `${cleanName}${extension}`;
}

function normalizeSegments(project: PixelProject) {
	const segments = project.script?.segments ?? [];
	const selectedSegments = segments.filter((segment) => segment.selected);
	return selectedSegments.length > 0 ? selectedSegments : segments;
}

function getOrCreateVideoTrack({
	trackMap,
	index,
}: {
	trackMap: Map<number, VideoTrack>;
	index: number;
}) {
	const normalizedIndex = Math.max(1, index);
	const existing = trackMap.get(normalizedIndex);
	if (existing) return existing;

	const created = buildEmptyTrack({
		id: generateUUID(),
		type: "video",
		name: normalizedIndex === 1 ? "Main Track" : `Video Track ${normalizedIndex}`,
	}) as VideoTrack;
	created.isMain = normalizedIndex === 1;
	trackMap.set(normalizedIndex, created);
	return created;
}

function getOrCreateTextTrack(tracks: TimelineTrack[]) {
	const existing = tracks.find((track): track is TextTrack => track.type === "text");
	if (existing) return existing;

	const created = buildEmptyTrack({
		id: generateUUID(),
		type: "text",
		name: "Captions",
	}) as TextTrack;
	tracks.push(created);
	return created;
}

function clampDuration(start: number, end: number | null, fallback: number) {
	if (end != null && end > start) {
		return Math.max(MIN_CLIP_DURATION, end - start);
	}
	return Math.max(MIN_CLIP_DURATION, fallback);
}

function buildTimelineTracks({
	project,
	mediaAssets,
}: {
	project: PixelProject;
	mediaAssets: MediaAsset[];
}) {
	const tracks = ensureMainTrack({ tracks: [] });
	const mediaByVideoId = new Map(mediaAssets.map((asset) => [asset.id, asset]));
	const trackMap = new Map<number, VideoTrack>();

	for (const track of tracks) {
		if (track.type === "video") {
			track.isMain = true;
			track.name = "Main Track";
			trackMap.set(1, track);
		}
	}

	const segments = normalizeSegments(project);
	let sequentialStart = 0;

	for (const segment of segments) {
		const mediaId = segment.video_id ?? mediaAssets[0]?.id;
		if (!mediaId) continue;

		const mediaAsset = mediaByVideoId.get(mediaId);
		if (!mediaAsset) continue;

		const sourceDuration = mediaAsset.duration ?? sanitizeNumber(segment.end) ?? 5;
		const clipStart = Math.max(0, sanitizeNumber(segment.start) ?? 0);
		const clipEnd = sanitizeNumber(segment.end);
		const duration = clampDuration(clipStart, clipEnd, sourceDuration);
		const startTime =
			sanitizeNumber(segment.timeline_start) ?? sequentialStart;
		const targetTrack = getOrCreateVideoTrack({
			trackMap,
			index: sanitizeNumber(segment.track) ?? 1,
		});

		targetTrack.elements.push({
			id: generateUUID(),
			type: "video",
			mediaId,
			name:
				segment.label?.trim() ||
				mediaAsset.name ||
				`Clip ${targetTrack.elements.length + 1}`,
			duration,
			startTime,
			trimStart: clipStart,
			trimEnd: Math.max(
				0,
				(sourceDuration || clipStart + duration) - (clipStart + duration),
			),
			sourceDuration: sourceDuration || clipStart + duration,
			muted: false,
			hidden: false,
			transform: { ...DEFAULT_TRANSFORM },
			opacity: DEFAULT_OPACITY,
			blendMode: DEFAULT_BLEND_MODE,
		});

		if (segment.text_overlay?.trim()) {
			const textTrack = getOrCreateTextTrack(tracks);
			textTrack.elements.push(
				{
					id: generateUUID(),
					...buildTextElement({
						startTime,
						raw: {
							name: segment.label?.trim() || "Overlay",
							content: segment.text_overlay.trim(),
							duration,
						},
					}),
				} as TextTrack["elements"][number],
			);
		}

		sequentialStart = Math.max(sequentialStart, startTime + duration);
	}

	if (segments.length === 0) {
		const mainTrack = getOrCreateVideoTrack({ trackMap, index: 1 });
		let offset = 0;

		for (const asset of mediaAssets) {
			const duration = Math.max(MIN_CLIP_DURATION, asset.duration ?? 5);
			mainTrack.elements.push({
				id: generateUUID(),
				type: "video",
				mediaId: asset.id,
				name: asset.name,
				duration,
				startTime: offset,
				trimStart: 0,
				trimEnd: 0,
				sourceDuration: duration,
				muted: false,
				hidden: false,
				transform: { ...DEFAULT_TRANSFORM },
				opacity: DEFAULT_OPACITY,
				blendMode: DEFAULT_BLEND_MODE,
			});
			offset += duration;
		}
	}

	const orderedVideoTracks = [...trackMap.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([, track]) => {
			track.elements.sort((a, b) => a.startTime - b.startTime);
			return track;
		});

	const otherTracks = tracks.filter((track) => track.type !== "video");
	for (const track of otherTracks) {
		track.elements.sort((a, b) => a.startTime - b.startTime);
	}

	return ensureMainTrack({ tracks: [...orderedVideoTracks, ...otherTracks] });
}

function buildProject({
	project,
	mediaAssets,
}: {
	project: PixelProject;
	mediaAssets: MediaAsset[];
}): TProject {
	const canvasSize = inferCanvasSize(project);
	const now = new Date();
	const createdAt = coerceDate(project.created_at, now);
	const updatedAt = coerceDate(project.updated_at, createdAt);
	const mainScene = buildDefaultScene({
		name: project.script?.title?.trim() || project.name || "Main scene",
		isMain: true,
	});

	mainScene.tracks = buildTimelineTracks({ project, mediaAssets });
	mainScene.updatedAt = updatedAt;
	mainScene.createdAt = createdAt;

	const duration = mainScene.tracks.reduce((maxDuration, track) => {
		const trackEnd = track.elements.reduce((end, element) => {
			return Math.max(end, element.startTime + element.duration);
		}, 0);
		return Math.max(maxDuration, trackEnd);
	}, 0);

	return {
		metadata: {
			id: project.id,
			name: project.name || "Untitled Project",
			duration,
			createdAt,
			updatedAt,
		},
		scenes: [mainScene],
		currentSceneId: mainScene.id,
		settings: {
			fps: DEFAULT_FPS,
			canvasSize,
			originalCanvasSize: canvasSize,
			background: {
				type: "color",
				color: DEFAULT_COLOR,
			},
		},
		version: CURRENT_PROJECT_VERSION,
		timelineViewState: DEFAULT_TIMELINE_VIEW_STATE,
	};
}

async function fetchVideoMetadata(file: File) {
	return await new Promise<{
		width?: number;
		height?: number;
		duration?: number;
	}>((resolve) => {
		const objectUrl = URL.createObjectURL(file);
		const video = document.createElement("video");
		video.preload = "metadata";
		video.onloadedmetadata = () => {
			resolve({
				width: video.videoWidth || undefined,
				height: video.videoHeight || undefined,
				duration: Number.isFinite(video.duration) ? video.duration : undefined,
			});
			URL.revokeObjectURL(objectUrl);
		};
		video.onerror = () => {
			resolve({});
			URL.revokeObjectURL(objectUrl);
		};
		video.src = objectUrl;
	});
}

async function downloadPixelVideoAsMediaAsset({
	projectId,
	video,
}: {
	projectId: string;
	video: PixelVideo;
}): Promise<MediaAsset | null> {
	try {
		const response = await fetch(pixelApi.videoMediaUrl(projectId, video.id), {
			cache: "no-store",
		});
		if (!response.ok) {
			throw new Error(`Failed to download media ${video.id}: ${response.status}`);
		}

		const blob = await response.blob();
		const mimeType = blob.type || "video/mp4";
		const file = new File([blob], guessFileName(video, mimeType), {
			type: mimeType,
			lastModified: Date.now(),
		});
		const metadata = await fetchVideoMetadata(file);

		return {
			id: video.id,
			name: video.title?.trim() || file.name,
			type: "video",
			file,
			duration: sanitizeNumber(video.duration) ?? metadata.duration,
			width: metadata.width,
			height: metadata.height,
			thumbnailUrl: video.thumbnail_path
				? pixelApi.videoThumbnailUrl(projectId, video.id)
				: undefined,
		};
	} catch (error) {
		console.error(`Failed to import Pixel media ${video.id}:`, error);
		return null;
	}
}

async function downloadPixelMediaAssets(project: PixelProject) {
	const videos = project.videos ?? [];
	const assets = await Promise.all(
		videos.map((video) =>
			downloadPixelVideoAsMediaAsset({
				projectId: project.id,
				video,
			}),
		),
	);
	return assets.filter((asset): asset is MediaAsset => asset !== null);
}

export async function importPixelProjectToOpenCut({
	projectId,
}: {
	projectId: string;
}) {
	const existing = await storageService.loadProject({ id: projectId });
	if (existing?.project) {
		return "existing" as const;
	}

	let pixelProject: PixelProject;
	try {
		pixelProject = await pixelApi.getProject(projectId);
	} catch (error) {
		if (isNotFoundError(error)) {
			return "missing" as const;
		}
		throw error;
	}

	const mediaAssets = await downloadPixelMediaAssets(pixelProject);
	const importedProject = buildProject({
		project: pixelProject,
		mediaAssets,
	});

	await storageService.saveProject({ project: importedProject });
	for (const mediaAsset of mediaAssets) {
		await storageService.saveMediaAsset({
			projectId: importedProject.metadata.id,
			mediaAsset,
		});
	}

	return "imported" as const;
}
