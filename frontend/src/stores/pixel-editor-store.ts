"use client";

import { create } from "zustand";
import { pixelApi } from "@/integrations/pixel/api";
import type {
	PixelMediaAsset,
	PixelProject,
	PixelSegment,
	PixelVideo,
} from "@/integrations/pixel/types";

type EditorTool = "media" | "text" | "audio" | "ai" | "export";

interface PixelEditorState {
	project: PixelProject | null;
	isLoading: boolean;
	error: string | null;
	activeTool: EditorTool;
	activeVideoId: string | null;
	activeSegmentId: string | null;
	activeAssetId: string | null;
	loadProject: (projectId: string) => Promise<void>;
	setActiveTool: (tool: EditorTool) => void;
	selectVideo: (videoId: string) => void;
	selectSegment: (segmentId: string | null) => void;
	selectAsset: (assetId: string | null) => void;
}

const deriveMediaAssets = (project: PixelProject): PixelMediaAsset[] => {
	const explicitAssets = project.script?.media_assets || [];
	if (explicitAssets.length) {
		return explicitAssets.map((asset, index) => ({
			id: asset.id || `asset-${index}-${asset.video_id}`,
			video_id: asset.video_id,
			label: asset.label || project.videos?.find((video) => video.id === asset.video_id)?.title || "Media asset",
			start: Number(asset.start || 0),
			duration: Math.max(3, Number(asset.duration || project.videos?.find((video) => video.id === asset.video_id)?.duration || 30)),
			track: Number(asset.track || 1),
		}));
	}

	return (project.videos || [])
		.filter((video) => String(video.local_path || "").trim())
		.map((video, index) => ({
			id: `asset-${video.id}`,
			video_id: video.id,
			label: video.title || video.source_url || video.local_path || `Video ${index + 1}`,
			start: Number(index * 6),
			duration: Math.max(6, Number(video.duration || 30)),
			track: 1,
		}));
};

export const usePixelEditorStore = create<PixelEditorState>((set) => ({
	project: null,
	isLoading: false,
	error: null,
	activeTool: "media",
	activeVideoId: null,
	activeSegmentId: null,
	activeAssetId: null,
	loadProject: async (projectId) => {
		set({ isLoading: true, error: null });
		try {
			const project = await pixelApi.getProject(projectId);
			const assets = deriveMediaAssets(project);
			const firstAsset = assets[0] || null;
			const firstSegment = (project.script?.segments || []).find(
				(segment) => segment.selected !== false,
			) || (project.script?.segments || [])[0] || null;
			set({
				project: {
					...project,
					script: {
						...(project.script || {}),
						segments: project.script?.segments || [],
						media_assets: assets,
					},
				},
				isLoading: false,
				activeVideoId: firstSegment?.video_id || firstAsset?.video_id || null,
				activeSegmentId: firstSegment?.id || null,
				activeAssetId: firstAsset?.id || null,
			});
		} catch (error) {
			set({
				error: error instanceof Error ? error.message : "Failed to load project",
				isLoading: false,
			});
		}
	},
	setActiveTool: (tool) => set({ activeTool: tool }),
	selectVideo: (videoId) =>
		set((state) => {
			const segment = (state.project?.script?.segments || []).find(
				(item) => item.video_id === videoId,
			);
			const asset = (state.project?.script?.media_assets || []).find(
				(item) => item.video_id === videoId,
			);
			return {
				activeVideoId: videoId,
				activeSegmentId: segment?.id || null,
				activeAssetId: asset?.id || null,
			};
		}),
	selectSegment: (segmentId) =>
		set((state) => {
			const segment = (state.project?.script?.segments || []).find(
				(item) => item.id === segmentId,
			);
			return {
				activeSegmentId: segmentId,
				activeVideoId: segment?.video_id || state.activeVideoId,
				activeAssetId: null,
			};
		}),
	selectAsset: (assetId) =>
		set((state) => {
			const asset = (state.project?.script?.media_assets || []).find(
				(item) => item.id === assetId,
			);
			return {
				activeAssetId: assetId,
				activeVideoId: asset?.video_id || state.activeVideoId,
				activeSegmentId: null,
			};
		}),
}));

export const pixelEditorSelectors = {
	videos: (project: PixelProject | null): PixelVideo[] => project?.videos || [],
	segments: (project: PixelProject | null): PixelSegment[] =>
		project?.script?.segments || [],
	assets: (project: PixelProject | null): PixelMediaAsset[] =>
		project?.script?.media_assets || [],
};
