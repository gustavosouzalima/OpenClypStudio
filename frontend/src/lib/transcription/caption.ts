import type { TranscriptionSegment, CaptionChunk } from "@/types/transcription";
import {
	DEFAULT_WORDS_PER_CAPTION,
	MIN_CAPTION_DURATION_SECONDS,
} from "@/constants/transcription-constants";

export function buildCaptionChunks({
	segments,
	wordsPerChunk = DEFAULT_WORDS_PER_CAPTION,
	minDuration = MIN_CAPTION_DURATION_SECONDS,
}: {
	segments: TranscriptionSegment[];
	wordsPerChunk?: number;
	minDuration?: number;
}): CaptionChunk[] {
	const captions: CaptionChunk[] = [];
	let globalEndTime = 0;

	for (const segment of segments) {
		const words = segment.text.trim().split(/\s+/);
		if (words.length === 0 || (words.length === 1 && words[0] === "")) continue;

		const segmentDuration = segment.end - segment.start;
		const wordsPerSecond = words.length / segmentDuration;

		const chunks: string[] = [];
		for (let i = 0; i < words.length; i += wordsPerChunk) {
			chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
		}

		let chunkStartTime = segment.start;
		for (const chunk of chunks) {
			const chunkWords = chunk.split(/\s+/).length;
			const chunkDuration = Math.max(minDuration, chunkWords / wordsPerSecond);
			const adjustedStartTime = Math.max(chunkStartTime, globalEndTime);

			captions.push({
				text: chunk,
				startTime: adjustedStartTime,
				duration: chunkDuration,
			});

			globalEndTime = adjustedStartTime + chunkDuration;
			chunkStartTime += chunkDuration;
		}
	}

	// Coalesce adjacent short cues to reduce render pressure in the editor.
	// This keeps visual readability while cutting the number of timeline elements.
	if (captions.length <= 1) return captions;

	const coalesced: CaptionChunk[] = [];
	for (const caption of captions) {
		const previous = coalesced[coalesced.length - 1];
		if (!previous) {
			coalesced.push(caption);
			continue;
		}

		const previousEnd = previous.startTime + previous.duration;
		const gap = caption.startTime - previousEnd;
		const mergedText = `${previous.text} ${caption.text}`.trim();
		const mergedWordCount = mergedText.split(/\s+/).filter(Boolean).length;
		const mergedDuration = caption.startTime + caption.duration - previous.startTime;

		const canMerge =
			gap <= 0.06 &&
			mergedWordCount <= wordsPerChunk * 2 &&
			mergedDuration <= 4.5;

		if (canMerge) {
			previous.text = mergedText;
			previous.duration = Math.max(minDuration, mergedDuration);
			continue;
		}

		coalesced.push(caption);
	}

	return coalesced;
}
