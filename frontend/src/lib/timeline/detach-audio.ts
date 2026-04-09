import type { EditorCore } from "@/core";
import type { VideoElement } from "@/types/timeline";
import { buildUploadAudioElement } from "./element-utils";

/**
 * Metadata key to identify audio elements that were detached from a video
 */
const DETACHED_FROM_VIDEO_KEY = "detachedFromVideoId";

export function hasDetachedAudioForVideo({
	editor,
	videoElement,
}: {
	editor: EditorCore;
	videoElement: VideoElement;
}) {
	return editor.timeline.getTracks().some((track) => {
		if (track.type !== "audio") return false;
		return track.elements.some(
			(element) =>
				element.sourceType === "upload" &&
				element.mediaId === videoElement.mediaId &&
				element.metadata?.[DETACHED_FROM_VIDEO_KEY] === videoElement.id,
		);
	});
}

export function detachAudioFromVideo({
	editor,
	trackId,
	videoElement,
}: {
	editor: EditorCore;
	trackId: string;
	videoElement: VideoElement;
}) {
	if (hasDetachedAudioForVideo({ editor, videoElement })) {
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: videoElement.id,
					updates: { muted: true },
				},
			],
		});
		return false;
	}

	const tracks = editor.timeline.getTracks();
	const existingAudioTrack = tracks.find((track) => track.type === "audio");
	const audioTrackId =
		existingAudioTrack?.id ?? editor.timeline.addTrack({ type: "audio" });

	editor.timeline.insertElement({
		placement: { mode: "explicit", trackId: audioTrackId },
		element: {
			...buildUploadAudioElement({
				mediaId: videoElement.mediaId,
				name: `${videoElement.name} Audio`,
				duration: videoElement.duration,
				startTime: videoElement.startTime,
			}),
			trimStart: videoElement.trimStart,
			trimEnd: videoElement.trimEnd,
			sourceDuration: videoElement.sourceDuration ?? videoElement.duration,
			metadata: {
				[DETACHED_FROM_VIDEO_KEY]: videoElement.id,
			},
		},
	});

	editor.timeline.updateElements({
		updates: [
			{
				trackId,
				elementId: videoElement.id,
				updates: { muted: true },
			},
		],
	});

	return true;
}
