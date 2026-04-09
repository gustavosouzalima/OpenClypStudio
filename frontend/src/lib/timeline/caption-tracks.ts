import type { TextTrack, TimelineTrack } from "@/types/timeline";

/**
 * Stable sentinel name applied to auto-generated caption tracks.
 *
 * Using the track-level name (not individual element names) means caption
 * tracks survive element renames by the user.  Only the creation site in
 * captions.tsx must set this name; everything else derives from it.
 *
 * Future convergence note (Phase 3.4+):
 *   When the Python backend produces SRT/TXT transcription output, the
 *   import path should also stamp new tracks with this sentinel so that
 *   the same clear/regenerate logic works regardless of the origination
 *   source (in-browser Whisper WASM vs. backend pipeline).
 */
export const GENERATED_CAPTION_TRACK_NAME = "__captions_generated__";

/**
 * Returns true when a TextTrack was created by the automated caption
 * generator (either in-browser WASM or a future backend import).
 *
 * Detection priority (most-reliable first):
 *  1. Track name equals the sentinel string.
 *  2. Fallback: every element on the track still starts with "Caption "
 *     (backward-compat for projects saved before the sentinel was introduced).
 */
export function isGeneratedCaptionTrack(track: TextTrack): boolean {
	// Primary: track-level sentinel — stable across element renames.
	if (track.name === GENERATED_CAPTION_TRACK_NAME) {
		return true;
	}

	// Fallback: legacy heuristic for projects without the sentinel.
	// A track with zero elements is never treated as a caption track; this
	// avoids false-positives on ordinary empty text tracks.
	if (
		track.elements.length > 0 &&
		track.elements.every((el) => el.name.startsWith("Caption "))
	) {
		return true;
	}

	return false;
}

/**
 * Filters the full track list and returns only generated-caption TextTracks.
 */
export function getGeneratedCaptionTracks({
	tracks,
}: {
	tracks: TimelineTrack[];
}): TextTrack[] {
	return tracks.filter(
		(track): track is TextTrack =>
			track.type === "text" && isGeneratedCaptionTrack(track as TextTrack),
	);
}
