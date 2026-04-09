import {
	Input,
	ALL_FORMATS,
	BlobSource,
	CanvasSink,
	type WrappedCanvas,
} from "mediabunny";
import { VideoDecodeWorkerPool } from "./worker-pool";

// ---------------------------------------------------------------------------
// Ring buffer configuration
// ---------------------------------------------------------------------------

/**
 * Maximum decoded frames held in RAM per active video.
 *
 * Memory budget (uncompressed RGBA — browsers may compress internally):
 *   1080p  1920 × 1080 × 4 B ≈  7.9 MB/frame  → 30 frames ≈ 237 MB
 *   720p   1280 ×  720 × 4 B ≈  3.5 MB/frame  → 30 frames ≈ 105 MB
 *   480p    854 ×  480 × 4 B ≈  1.6 MB/frame  → 30 frames ≈  48 MB
 *
 * 30 frames ≈ 1 s @ 30 fps, 2 s @ 15 fps — sufficient for smooth scrubbing.
 */
const RING_BUFFER_SIZE = 30;

/**
 * Extra frames prefetched ahead of the playhead after each decode.
 * First frame always goes into `nextFrame` (existing behaviour);
 * the remaining (PREFETCH_AHEAD_FRAMES − 1) go straight to the ring.
 */
const PREFETCH_AHEAD_FRAMES = 4;

/**
 * Hard memory ceiling across ALL active videos (MB, uncompressed RGBA estimate).
 * When exceeded, the least-recently-accessed video's ring is cleared entirely
 * so its frames can be re-decoded on demand.
 *
 * With 2 × 1080p videos @ 30 frames each ≈ 474 MB — safely under this limit.
 */
const RING_MAX_TOTAL_MB = 400;

/**
 * Seconds tolerance when matching a requested `time` against a cached frame.
 * Half-frame at 30 fps ≈ 0.017 s.
 */
const RING_TOLERANCE_S = 0.017;

/**
 * Do not prefetch frames more than this many seconds ahead of the playhead.
 * Prevents filling the ring with frames the user may never reach.
 */
const PREFETCH_MAX_LOOKAHEAD_S = 2.0;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/**
 * An independent pixel copy of a decoded frame stored in the ring buffer.
 * Pixels are cloned so mediabunny's internal canvas pool can recycle freely.
 */
type RingFrame = {
	canvas: OffscreenCanvas | HTMLCanvasElement;
	timestamp: number;
	duration: number;
};

interface VideoSinkData {
	sink: CanvasSink;
	iterator: AsyncGenerator<WrappedCanvas, void, unknown> | null;
	currentFrame: WrappedCanvas | null;
	nextFrame: WrappedCanvas | null;
	lastTime: number;
	prefetching: boolean;
	prefetchPromise: Promise<void> | null;
	/** Ring buffer — key: Math.round(frame.timestamp × 1000) */
	ring: Map<number, RingFrame>;
	/** Playhead at last getFrameAt call — drives temporal LRU eviction. */
	lastPlayhead: number;
	/** Wall-clock ms of last getFrameAt call — drives cross-video eviction. */
	lastAccessedAt: number;
	/** Blob URL used by the decode worker path. */
	sourceUrl: string | null;
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/** Consistent integer key for a timestamp (millisecond precision). */
function tsKey(timestamp: number): number {
	return Math.round(timestamp * 1000);
}

/**
 * Allocates the best available off-screen canvas of the given dimensions.
 * Prefers OffscreenCanvas (available in Workers and modern browsers).
 */
function makeOffscreenCanvas(
	w: number,
	h: number,
): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D } | null {
	if (typeof OffscreenCanvas !== "undefined") {
		const canvas = new OffscreenCanvas(w, h);
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		return { canvas, ctx };
	}
	if (typeof document !== "undefined") {
		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		return { canvas, ctx };
	}
	return null;
}

/**
 * Copies a decoded WrappedCanvas frame to an independent canvas so the
 * mediabunny pool canvas can be recycled without corrupting the cache.
 * Returns null when no canvas context is available (e.g. SSR).
 */
function makeRingEntry(frame: WrappedCanvas): RingFrame | null {
	const src = frame.canvas;
	const result = makeOffscreenCanvas(src.width, src.height);
	if (!result) return null;
	result.ctx.drawImage(src as CanvasImageSource, 0, 0);
	return { canvas: result.canvas, timestamp: frame.timestamp, duration: frame.duration };
}

/**
 * Copies a raw VideoFrame (from a WebCodecs VideoDecoder pipeline) into an
 * independent canvas and then closes the VideoFrame to release GPU memory.
 *
 * VideoFrame timestamps and durations are in **microseconds**; they are
 * converted to seconds for consistency with the rest of the ring buffer.
 *
 * Returns null when no canvas context is available (e.g. SSR).
 */
function makeRingEntryFromVideoFrame(frame: VideoFrame): RingFrame | null {
	const w = frame.displayWidth;
	const h = frame.displayHeight;
	const result = makeOffscreenCanvas(w, h);
	if (!result) {
		frame.close();
		return null;
	}
	// drawImage(VideoFrame) is GPU-accelerated in Chromium — no CPU roundtrip.
	result.ctx.drawImage(frame as CanvasImageSource, 0, 0);
	// Release GPU-resident VideoFrame memory immediately after the blit.
	frame.close();
	return {
		canvas: result.canvas,
		timestamp: frame.timestamp / 1_000_000,
		duration: (frame.duration ?? 0) / 1_000_000,
	};
}

/**
 * Copies a worker-returned ImageBitmap into an independent canvas and closes
 * the ImageBitmap immediately to release GPU memory.
 */
function makeRingEntryFromImageBitmap({
	bitmap,
	timestamp,
	duration,
}: {
	bitmap: ImageBitmap;
	timestamp: number;
	duration: number;
}): RingFrame | null {
	const result = makeOffscreenCanvas(bitmap.width, bitmap.height);
	if (!result) {
		bitmap.close();
		return null;
	}
	result.ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	return {
		canvas: result.canvas,
		timestamp,
		duration,
	};
}

// ---------------------------------------------------------------------------
// VideoCache
// ---------------------------------------------------------------------------

export class VideoCache {
	private sinks = new Map<string, VideoSinkData>();
	private initPromises = new Map<string, Promise<void>>();
	private workerPool: VideoDecodeWorkerPool | null = null;
	private workerEnabled = false;

	constructor() {
		if (typeof window === "undefined") return;
		this.workerEnabled =
			process.env.NEXT_PUBLIC_VIDEO_DECODE_WORKER_ENABLED !== "false";
		if (this.workerEnabled && VideoDecodeWorkerPool.isSupported()) {
			this.workerPool = new VideoDecodeWorkerPool();
		}
	}

	async prewarm({
		mediaId,
		file,
	}: {
		mediaId: string;
		file: File;
	}): Promise<void> {
		await this.ensureSink({ mediaId, file });
	}

	async getFrameAt({
		mediaId,
		file,
		time,
	}: {
		mediaId: string;
		file: File;
		time: number;
	}): Promise<WrappedCanvas | null> {
		await this.ensureSink({ mediaId, file });

		const sinkData = this.sinks.get(mediaId);
		if (!sinkData) return null;

		sinkData.lastPlayhead = time;
		sinkData.lastAccessedAt = Date.now();

		// ── 1. Ring buffer hit — no decode needed ────────────────────────────
		const cached = this.getRingFrame(sinkData.ring, time);
		if (cached) {
			if (!sinkData.nextFrame && !sinkData.prefetching) {
				this.startPrefetch({ sinkData });
			}
			return cached as unknown as WrappedCanvas;
		}

		// ── 2. Advance via already-decoded nextFrame ──────────────────────────
		if (sinkData.nextFrame && sinkData.nextFrame.timestamp <= time) {
			sinkData.currentFrame = sinkData.nextFrame;
			sinkData.nextFrame = null;
			this.addToRing(sinkData, sinkData.currentFrame);
			this.startPrefetch({ sinkData });
		}

		if (
			sinkData.currentFrame &&
			this.isFrameValid({ frame: sinkData.currentFrame, time })
		) {
			if (!sinkData.nextFrame && !sinkData.prefetching) {
				this.startPrefetch({ sinkData });
			}
			return sinkData.currentFrame;
		}

		// ── 3. Forward iteration (within PREFETCH_MAX_LOOKAHEAD_S window) ─────
		if (
			sinkData.iterator &&
			sinkData.currentFrame &&
			time >= sinkData.lastTime &&
			time < sinkData.lastTime + PREFETCH_MAX_LOOKAHEAD_S
		) {
			const frame = await this.iterateToTime({ sinkData, targetTime: time });
			if (frame) {
				if (!sinkData.nextFrame && !sinkData.prefetching) {
					this.startPrefetch({ sinkData });
				}
				return frame;
			}
		}

		// ── 4. Seek (random access) ───────────────────────────────────────────
		const frame = await this.seekToTime({ mediaId, sinkData, time });
		if (frame && !sinkData.nextFrame && !sinkData.prefetching) {
			this.startPrefetch({ sinkData });
		}
		return frame;
	}

	/**
	 * Stores a raw VideoFrame from a WebCodecs VideoDecoder pipeline into the
	 * ring buffer for `mediaId`.
	 *
	 * The sink must have been initialised (via prewarm or getFrameAt) before
	 * calling this; frames for unknown mediaIds are silently dropped and closed.
	 *
	 * Use-case: Etapa 3 Worker-based decoder calls this on each
	 * VideoDecoder.output() callback, feeding the ring without going through
	 * mediabunny's CanvasSink.
	 */
	addVideoFrameToRing(mediaId: string, frame: VideoFrame): void {
		const sinkData = this.sinks.get(mediaId);
		if (!sinkData) {
			frame.close();
			return;
		}

		this.evictLeastRecentVideoIfOverLimit(sinkData);
		if (sinkData.ring.size >= RING_BUFFER_SIZE) {
			this.evictRing(sinkData.ring, sinkData.lastPlayhead);
		}

		const entry = makeRingEntryFromVideoFrame(frame);
		if (entry) {
			const key = tsKey(entry.timestamp);
			if (!sinkData.ring.has(key)) {
				sinkData.ring.set(key, entry);
			}
		}
	}

	// ── Ring buffer helpers ──────────────────────────────────────────────────

	/**
	 * Returns the cached frame that covers `time`, or null on miss.
	 * Scans all ring entries (≤ RING_BUFFER_SIZE) — O(60) is negligible.
	 */
	private getRingFrame(
		ring: Map<number, RingFrame>,
		time: number,
	): RingFrame | null {
		for (const frame of ring.values()) {
			if (
				time >= frame.timestamp - RING_TOLERANCE_S &&
				time < frame.timestamp + frame.duration + RING_TOLERANCE_S
			) {
				return frame;
			}
		}
		return null;
	}

	/**
	 * Copies a decoded frame into the ring buffer.
	 *
	 * Per-video eviction: removes the frame furthest from the playhead when the
	 * per-video limit is reached.
	 *
	 * Global eviction: if total cross-video memory would exceed RING_MAX_TOTAL_MB,
	 * clears the entire ring of the least-recently-accessed video first.
	 */
	private addToRing(sinkData: VideoSinkData, frame: WrappedCanvas): void {
		const ring = sinkData.ring;
		const key = tsKey(frame.timestamp);

		if (ring.has(key)) return; // already cached

		// Global ceiling check — evict a whole idle video's ring if needed.
		this.evictLeastRecentVideoIfOverLimit(sinkData);

		// Per-video limit.
		if (ring.size >= RING_BUFFER_SIZE) {
			this.evictRing(ring, sinkData.lastPlayhead);
		}

		const entry = makeRingEntry(frame);
		if (entry) ring.set(key, entry);
	}

	/**
	 * Removes the ring entry whose timestamp is furthest from `playhead`.
	 * Temporal eviction keeps the cache centred on the current position,
	 * which is ideal for both forward playback and random scrubbing.
	 */
	private evictRing(
		ring: Map<number, RingFrame>,
		playhead: number,
	): void {
		let worstKey = -1;
		let worstDist = -1;

		for (const [key, frame] of ring) {
			const dist = Math.abs(frame.timestamp - playhead);
			if (dist > worstDist) {
				worstDist = dist;
				worstKey = key;
			}
		}

		if (worstKey !== -1) ring.delete(worstKey);
	}

	/**
	 * Returns the estimated total RAM used by all ring buffers in MB.
	 * Uses actual canvas dimensions rather than a fixed 1080p estimate,
	 * so it stays accurate regardless of source resolution.
	 *
	 * Formula: width × height × 4 bytes (RGBA) per frame.
	 */
	private getTotalRingMemoryMB(): number {
		let totalBytes = 0;
		for (const sinkData of this.sinks.values()) {
			for (const frame of sinkData.ring.values()) {
				totalBytes += frame.canvas.width * frame.canvas.height * 4;
			}
		}
		return totalBytes / (1024 * 1024);
	}

	/**
	 * When global ring memory exceeds RING_MAX_TOTAL_MB, clears the ring of
	 * the least-recently-accessed video (excluding the one currently being
	 * written to, identified by `activeSinkData`).
	 *
	 * Clearing the ring does NOT destroy the sink — the video remains decodable
	 * on demand; it just loses its cached frames.
	 */
	private evictLeastRecentVideoIfOverLimit(activeSinkData: VideoSinkData): void {
		if (this.getTotalRingMemoryMB() < RING_MAX_TOTAL_MB) return;

		let oldestSink: VideoSinkData | null = null;
		let oldestTime = Infinity;

		for (const sinkData of this.sinks.values()) {
			if (sinkData === activeSinkData) continue; // never evict the active video
			if (sinkData.ring.size === 0) continue;
			if (sinkData.lastAccessedAt < oldestTime) {
				oldestTime = sinkData.lastAccessedAt;
				oldestSink = sinkData;
			}
		}

		if (oldestSink) {
			oldestSink.ring.clear();
		}
	}

	// ── Decode helpers (largely unchanged; addToRing calls added) ────────────

	private isFrameValid({
		frame,
		time,
	}: {
		frame: WrappedCanvas;
		time: number;
	}): boolean {
		return time >= frame.timestamp && time < frame.timestamp + frame.duration;
	}

	private async iterateToTime({
		sinkData,
		targetTime,
	}: {
		sinkData: VideoSinkData;
		targetTime: number;
	}): Promise<WrappedCanvas | null> {
		if (!sinkData.iterator) return null;

		try {
			while (true) {
				if (sinkData.prefetching && sinkData.prefetchPromise) {
					await sinkData.prefetchPromise;
				}

				if (
					sinkData.nextFrame &&
					sinkData.nextFrame.timestamp <= targetTime + 0.05
				) {
					sinkData.currentFrame = sinkData.nextFrame;
					sinkData.nextFrame = null;
				} else {
					const { value: frame, done } = await sinkData.iterator.next();
					if (done || !frame) break;
					sinkData.currentFrame = frame;
				}

				const frame = sinkData.currentFrame;
				if (!frame) break;

				sinkData.lastTime = frame.timestamp;
				this.addToRing(sinkData, frame);

				if (this.isFrameValid({ frame, time: targetTime })) {
					return frame;
				}

				if (frame.timestamp > targetTime + 1.0) break;
			}
		} catch (error) {
			console.warn("[VideoCache] Iterator failed, will restart:", error);
			sinkData.iterator = null;
		}

		return null;
	}

	private async seekToTime({
		mediaId,
		sinkData,
		time,
	}: {
		mediaId: string;
		sinkData: VideoSinkData;
		time: number;
	}): Promise<WrappedCanvas | null> {
		try {
			// Worker path first: offloads random-access seeks from main thread.
			if (
				this.workerEnabled &&
				this.workerPool?.hasWorkers &&
				sinkData.sourceUrl
			) {
				try {
					const decoded = await this.workerPool.seek({
						mediaId,
						url: sinkData.sourceUrl,
						seekTime: time,
					});
					const entry = makeRingEntryFromImageBitmap({
						bitmap: decoded.bitmap,
						timestamp: decoded.timestamp,
						duration: decoded.duration,
					});
					if (entry) {
						const key = tsKey(entry.timestamp);
						if (!sinkData.ring.has(key)) {
							sinkData.ring.set(key, entry);
						}
						const frame = {
							canvas: entry.canvas,
							timestamp: entry.timestamp,
							duration: entry.duration,
						} as unknown as WrappedCanvas;
						sinkData.currentFrame = frame;
						sinkData.lastTime = entry.timestamp;
						return frame;
					}
				} catch (workerError) {
					console.warn("[VideoCache] Worker seek failed, falling back:", workerError);
				}
			}

			if (sinkData.prefetching && sinkData.prefetchPromise) {
				await sinkData.prefetchPromise;
			}

			if (sinkData.iterator) {
				await sinkData.iterator.return();
				sinkData.iterator = null;
			}

			sinkData.nextFrame = null;
			sinkData.iterator = sinkData.sink.canvases(time);
			sinkData.lastTime = time;

			const { value: frame } = await sinkData.iterator.next();
			if (!frame) return null;

			sinkData.currentFrame = frame;
			this.addToRing(sinkData, frame);

			try {
				const { value: next } = await sinkData.iterator.next();
				if (next) {
					sinkData.nextFrame = next;
					this.addToRing(sinkData, next);
				}
			} catch (e) {
				console.warn("[VideoCache] Failed to pre-fetch next frame on seek:", e);
			}

			return frame;
		} catch (error) {
			console.warn("[VideoCache] Failed to seek video:", error);
		}

		return null;
	}

	private startPrefetch({ sinkData }: { sinkData: VideoSinkData }): void {
		if (sinkData.prefetching || !sinkData.iterator || sinkData.nextFrame) {
			return;
		}

		sinkData.prefetching = true;
		sinkData.prefetchPromise = this.prefetchNextFrame({ sinkData });
	}

	/**
	 * Fetches up to PREFETCH_AHEAD_FRAMES frames from the iterator.
	 *
	 * - Frame 1 → `nextFrame` (existing contract, keeps advancement logic working)
	 * - Frames 2…N → ring buffer only, up to PREFETCH_MAX_LOOKAHEAD_S ahead
	 */
	private async prefetchNextFrame({
		sinkData,
	}: {
		sinkData: VideoSinkData;
	}): Promise<void> {
		if (!sinkData.iterator) {
			sinkData.prefetching = false;
			sinkData.prefetchPromise = null;
			return;
		}

		try {
			let firstFetched = false;

			for (
				let i = 0;
				i < PREFETCH_AHEAD_FRAMES && sinkData.iterator;
				i++
			) {
				// Stop filling the ring when it is full
				if (sinkData.ring.size >= RING_BUFFER_SIZE) break;

				// Do not venture too far ahead of the playhead
				if (
					firstFetched &&
					sinkData.lastTime > sinkData.lastPlayhead + PREFETCH_MAX_LOOKAHEAD_S
				) {
					break;
				}

				const { value: frame, done } = await sinkData.iterator.next();
				if (done || !frame) break;

				if (!firstFetched) {
					// First frame: preserve existing nextFrame semantics
					sinkData.nextFrame = frame;
					firstFetched = true;
				}

				this.addToRing(sinkData, frame);
				sinkData.lastTime = frame.timestamp;
			}
		} catch (error) {
			console.warn("[VideoCache] Prefetch failed:", error);
			sinkData.iterator = null;
		} finally {
			sinkData.prefetching = false;
			sinkData.prefetchPromise = null;
		}
	}

	// ── Sink lifecycle ───────────────────────────────────────────────────────

	private async ensureSink({
		mediaId,
		file,
	}: {
		mediaId: string;
		file: File;
	}): Promise<void> {
		if (this.sinks.has(mediaId)) return;

		if (this.initPromises.has(mediaId)) {
			await this.initPromises.get(mediaId);
			return;
		}

		const initPromise = this.initializeSink({ mediaId, file });
		this.initPromises.set(mediaId, initPromise);

		try {
			await initPromise;
		} finally {
			this.initPromises.delete(mediaId);
		}
	}

	private async initializeSink({
		mediaId,
		file,
	}: {
		mediaId: string;
		file: File;
	}): Promise<void> {
		try {
			const input = new Input({
				source: new BlobSource(file),
				formats: ALL_FORMATS,
			});

			const videoTrack = await input.getPrimaryVideoTrack();
			if (!videoTrack) {
				throw new Error("No video track found");
			}

			const canDecode = await videoTrack.canDecode();
			if (!canDecode) {
				throw new Error("Video codec not supported for decoding");
			}

			const sink = new CanvasSink(videoTrack, {
				poolSize: 6,
				fit: "contain",
			});

			this.sinks.set(mediaId, {
				sink,
				iterator: null,
				currentFrame: null,
				nextFrame: null,
				lastTime: -1,
				prefetching: false,
				prefetchPromise: null,
				ring: new Map(),
				lastPlayhead: 0,
				lastAccessedAt: Date.now(),
				sourceUrl:
					typeof URL !== "undefined" ? URL.createObjectURL(file) : null,
			});
		} catch (error) {
			console.error(
				`[VideoCache] Failed to initialize sink for ${mediaId}:`,
				error,
			);
			throw error;
		}
	}

	clearVideo({ mediaId }: { mediaId: string }): void {
		const sinkData = this.sinks.get(mediaId);
		if (sinkData) {
			if (sinkData.iterator) {
				void sinkData.iterator.return();
			}
			sinkData.ring.clear();
			if (sinkData.sourceUrl && typeof URL !== "undefined") {
				URL.revokeObjectURL(sinkData.sourceUrl);
			}
			this.sinks.delete(mediaId);
		}

		this.workerPool?.disposeMedia(mediaId);
		this.initPromises.delete(mediaId);
	}

	clearAll(): void {
		for (const [mediaId] of this.sinks) {
			this.clearVideo({ mediaId });
		}
	}

	getStats() {
		const sinkList = Array.from(this.sinks.values());
		return {
			totalSinks: this.sinks.size,
			activeSinks: sinkList.filter((s) => s.iterator).length,
			cachedFrames: sinkList.filter((s) => s.currentFrame).length,
			ringEntries: sinkList.reduce((sum, s) => sum + s.ring.size, 0),
			ringCapacity: RING_BUFFER_SIZE,
			ringMemoryMB: Math.round(this.getTotalRingMemoryMB() * 10) / 10,
			ringMemoryLimitMB: RING_MAX_TOTAL_MB,
			workerActive:
				Boolean(this.workerEnabled && this.workerPool?.hasWorkers) &&
				typeof window !== "undefined",
		};
	}
}

export const videoCache = new VideoCache();
