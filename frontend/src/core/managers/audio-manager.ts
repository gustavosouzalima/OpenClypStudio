import type { EditorCore } from "@/core";
import type { AudioClipSource } from "@/lib/media/audio";
import { createAudioContext, collectAudioClips } from "@/lib/media/audio";
import { canTracktHaveAudio } from "@/lib/timeline";
import { canElementHaveAudio } from "@/lib/timeline/element-utils";
import { GENERATED_CAPTION_TRACK_NAME } from "@/lib/timeline/caption-tracks";
import {
	ALL_FORMATS,
	AudioBufferSink,
	BlobSource,
	Input,
	type WrappedAudioBuffer,
} from "mediabunny";

export class AudioManager {
	private audioContext: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private playbackStartTime = 0;
	private playbackStartContextTime = 0;
	private scheduleTimer: number | null = null;
	private lookaheadSeconds = 10;
	private scheduleIntervalMs = 100;
	private clips: AudioClipSource[] = [];
	private sinks = new Map<string, AudioBufferSink>();
	private inputs = new Map<string, Input>();
	private activeClipIds = new Set<string>();
	private clipIterators = new Map<
		string,
		AsyncGenerator<WrappedAudioBuffer, void, unknown>
	>();
	private queuedSources = new Set<AudioBufferSourceNode>();
	private playbackSessionId = 0;
	private lastIsPlaying = false;
	private lastVolume = 1;
	private playbackLatencyCompensationSeconds = 0;
	private changeDebounceTimer: number | null = null;
	private readonly CHANGE_DEBOUNCE_MS = 280;
	private lastAudioSignature: string | null = null;
	private lastMasterClockResyncMs = 0;
	private readonly MASTER_CLOCK_RESYNC_COOLDOWN_MS = 450;
	private lastCorrectionMs = 0;
	private readonly MASTER_CLOCK_CORRECTION_DEBOUNCE_MS = 250;
	private unsubscribers: Array<() => void> = [];

	constructor(private editor: EditorCore) {
		this.lastVolume = this.editor.playback.getVolume();

		this.unsubscribers.push(
			this.editor.playback.subscribe(this.handlePlaybackChange),
			this.editor.timeline.subscribe(this.handleTimelineChange),
			this.editor.media.subscribe(this.handleTimelineChange),
		);
		if (typeof window !== "undefined") {
			window.addEventListener("playback-seek", this.handleSeek);
			window.addEventListener("preview-master-clock", this.handleMasterClock as EventListener);
		}
	}

	dispose(): void {
		if (this.changeDebounceTimer !== null && typeof window !== "undefined") {
			window.clearTimeout(this.changeDebounceTimer);
			this.changeDebounceTimer = null;
		}
		this.stopPlayback();
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		if (typeof window !== "undefined") {
			window.removeEventListener("playback-seek", this.handleSeek);
			window.removeEventListener("preview-master-clock", this.handleMasterClock as EventListener);
		}
		this.disposeSinks();
		if (this.audioContext) {
			void this.audioContext.close();
			this.audioContext = null;
			this.masterGain = null;
		}
	}

	private handlePlaybackChange = (): void => {
		const isPlaying = this.editor.playback.getIsPlaying();
		const volume = this.editor.playback.getVolume();

		if (volume !== this.lastVolume) {
			this.lastVolume = volume;
			this.updateGain();
		}

		if (isPlaying !== this.lastIsPlaying) {
			this.lastIsPlaying = isPlaying;
			if (isPlaying) {
				void this.startPlayback({
					time: this.editor.playback.getCurrentTime(),
				});
			} else {
				this.stopPlayback();
			}
		}
	};

	private handleSeek = (event: Event): void => {
		const detail = (event as CustomEvent<{ time: number }>).detail;
		if (!detail) return;

		if (this.editor.playback.getIsScrubbing()) {
			this.stopPlayback();
			return;
		}

		if (this.editor.playback.getIsPlaying()) {
			void this.startPlayback({ time: detail.time });
			return;
		}

		this.stopPlayback();
	};

	private handleTimelineChange = (): void => {
		if (typeof window !== "undefined") {
			if (this.changeDebounceTimer !== null) {
				window.clearTimeout(this.changeDebounceTimer);
			}
			this.changeDebounceTimer = window.setTimeout(() => {
				this.changeDebounceTimer = null;
				this._applyTimelineChange();
			}, this.CHANGE_DEBOUNCE_MS);
		} else {
			this._applyTimelineChange();
		}
	};

	private handleMasterClock = (event: Event): void => {
		if (!this.editor.playback.getIsPlaying()) return;
		if (this.editor.playback.getIsScrubbing()) return;
		if (!this.audioContext) return;

		const detail = (event as CustomEvent<{ mediaTime?: number }>).detail;
		const mediaTime = detail?.mediaTime;
		if (typeof mediaTime !== "number" || Number.isNaN(mediaTime)) return;

		const nowMs = Date.now();
		if (nowMs - this.lastCorrectionMs < this.MASTER_CLOCK_CORRECTION_DEBOUNCE_MS) {
			return;
		}
		this.lastCorrectionMs = nowMs;

		const localPlaybackTime = this.getPlaybackTime();
		const drift = mediaTime - localPlaybackTime;
		const absDrift = Math.abs(drift);

		// Soft correction first: avoid aggressive source restarts that cause stutter.
		if (absDrift > 0.08) {
			this.playbackStartTime += drift * 0.3;
			this.playbackStartContextTime = this.audioContext.currentTime;
			return;
		}

		// Hard resync only for extreme drift.
		if (
			absDrift > 0.5 &&
			nowMs - this.lastMasterClockResyncMs > this.MASTER_CLOCK_RESYNC_COOLDOWN_MS
		) {
			this.lastMasterClockResyncMs = nowMs;
			void this.startPlayback({ time: mediaTime });
		}
	};

	private _applyTimelineChange(): void {
		const nextSignature = this.computeAudioSignature();
		if (nextSignature === this.lastAudioSignature) {
			return;
		}
		this.lastAudioSignature = nextSignature;

		// While playing, avoid eager sink disposal before restart. Disposing first
		// introduces audible dropouts when timeline points are edited rapidly.
		// startPlayback() already handles session restart and scheduling.
		if (this.editor.playback.getIsPlaying()) {
			void this.startPlayback({ time: this.editor.playback.getCurrentTime() });
			return;
		}

		this.disposeSinks();
	}

	private ensureAudioContext(): AudioContext | null {
		if (this.audioContext) return this.audioContext;
		if (typeof window === "undefined") return null;

		this.audioContext = createAudioContext();
		this.masterGain = this.audioContext.createGain();
		this.masterGain.gain.value = this.lastVolume;
		this.masterGain.connect(this.audioContext.destination);
		return this.audioContext;
	}

	private updateGain(): void {
		if (!this.masterGain) return;
		this.masterGain.gain.value = this.lastVolume;
	}

	private getPlaybackTime(): number {
		if (!this.audioContext) return this.playbackStartTime;
		const elapsed =
			this.audioContext.currentTime - this.playbackStartContextTime;
		return this.playbackStartTime + elapsed;
	}

	private async startPlayback({ time }: { time: number }): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		this.stopPlayback();
		this.playbackSessionId++;
		this.playbackLatencyCompensationSeconds = 0;

		const tracks = this.editor.timeline.getTracks();
		const mediaAssets = this.editor.media.getAssets();
		this.lastAudioSignature = this.computeAudioSignature({ tracks, mediaAssets });
		const duration = this.editor.timeline.getTotalDuration();

		if (duration <= 0) return;

		if (audioContext.state === "suspended") {
			await audioContext.resume();
		}

		this.clips = await collectAudioClips({ tracks, mediaAssets });
		if (!this.editor.playback.getIsPlaying()) return;

		this.playbackStartTime = time;
		this.playbackStartContextTime = audioContext.currentTime;

		this.scheduleUpcomingClips();

		if (typeof window !== "undefined") {
			this.scheduleTimer = window.setInterval(() => {
				this.scheduleUpcomingClips();
			}, this.scheduleIntervalMs);
		}
	}

	private scheduleUpcomingClips(): void {
		if (!this.editor.playback.getIsPlaying()) return;

		const currentTime = this.getPlaybackTime();
		const windowEnd = currentTime + this.lookaheadSeconds;

		for (const clip of this.clips) {
			if (clip.muted) continue;
			if (this.activeClipIds.has(clip.id)) continue;

			const clipEnd = clip.startTime + clip.duration;
			if (clipEnd <= currentTime) continue;
			if (clip.startTime > windowEnd) continue;

			this.activeClipIds.add(clip.id);
			void this.runClipIterator({
				clip,
				startTime: currentTime,
				sessionId: this.playbackSessionId,
			});
		}
	}

	private stopPlayback(): void {
		if (this.scheduleTimer && typeof window !== "undefined") {
			window.clearInterval(this.scheduleTimer);
		}
		this.scheduleTimer = null;

		for (const iterator of this.clipIterators.values()) {
			void iterator.return();
		}
		this.clipIterators.clear();
		this.activeClipIds.clear();

		for (const source of this.queuedSources) {
			try {
				source.stop();
			} catch {}
			source.disconnect();
		}
		this.queuedSources.clear();
	}

	private async runClipIterator({
		clip,
		startTime,
		sessionId,
	}: {
		clip: AudioClipSource;
		startTime: number;
		sessionId: number;
	}): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		const sink = await this.getAudioSink({ clip });
		if (!sink || !this.editor.playback.getIsPlaying()) return;
		if (sessionId !== this.playbackSessionId) return;

		const clipStart = clip.startTime;
		const clipEnd = clip.startTime + clip.duration;
		const playbackTimeAfterSinkReady = this.getPlaybackTime();
		const iteratorStartTime = Math.max(
			startTime,
			clipStart,
			playbackTimeAfterSinkReady,
		);
		if (iteratorStartTime >= clipEnd) {
			return;
		}
		const sourceStartTime =
			clip.trimStart + (iteratorStartTime - clip.startTime);

		const iterator = sink.buffers(sourceStartTime);
		this.clipIterators.set(clip.id, iterator);
			let consecutiveDroppedBufferCount = 0;

		for await (const { buffer, timestamp } of iterator) {
			if (!this.editor.playback.getIsPlaying()) return;
			if (sessionId !== this.playbackSessionId) return;

			const timelineTime = clip.startTime + (timestamp - clip.trimStart);
			if (timelineTime >= clipEnd) break;

			const node = audioContext.createBufferSource();
			node.buffer = buffer;
			const clipGain = audioContext.createGain();
			node.connect(clipGain);
			clipGain.connect(this.masterGain ?? audioContext.destination);

			const startTimestamp =
				this.playbackStartContextTime +
				this.playbackLatencyCompensationSeconds +
				(timelineTime - this.playbackStartTime);

			const clipOffsetSeconds = Math.max(
				0,
				timelineTime - clip.startTime,
			);
			if (startTimestamp >= audioContext.currentTime) {
				this.scheduleClipGainAutomation({
					gainNode: clipGain,
					startTimestamp,
					bufferDuration: buffer.duration,
					clipOffsetSeconds,
					clipDuration: clip.duration,
					clipVolume: clip.volume,
					fadeInMs: clip.fadeInMs,
					fadeOutMs: clip.fadeOutMs,
				});
				node.start(startTimestamp);
				consecutiveDroppedBufferCount = 0;
			} else {
				const offset = audioContext.currentTime - startTimestamp;
				if (offset < buffer.duration) {
					this.scheduleClipGainAutomation({
						gainNode: clipGain,
						startTimestamp: audioContext.currentTime,
						bufferDuration: buffer.duration - offset,
						clipOffsetSeconds: clipOffsetSeconds + offset,
						clipDuration: clip.duration,
						clipVolume: clip.volume,
						fadeInMs: clip.fadeInMs,
						fadeOutMs: clip.fadeOutMs,
					});
					node.start(audioContext.currentTime, offset);
					consecutiveDroppedBufferCount = 0;
				} else {
					consecutiveDroppedBufferCount += 1;
					if (consecutiveDroppedBufferCount >= 5) {
						const nextCompensationSeconds = Math.max(
							this.playbackLatencyCompensationSeconds,
							Math.min(0.25, offset + 0.01),
						);
						if (
							nextCompensationSeconds >
							this.playbackLatencyCompensationSeconds + 0.001
						) {
							this.playbackLatencyCompensationSeconds =
								nextCompensationSeconds;
						}
						const resyncStartTime = this.getPlaybackTime();
						this.clipIterators.delete(clip.id);
						void this.runClipIterator({
							clip,
							startTime: resyncStartTime,
							sessionId,
						});
						return;
					}
					continue;
				}
			}

			this.queuedSources.add(node);
			node.addEventListener("ended", () => {
				node.disconnect();
				clipGain.disconnect();
				this.queuedSources.delete(node);
			});

			const aheadTime = timelineTime - this.getPlaybackTime();
			if (aheadTime >= 1) {
				await this.waitUntilCaughtUp({ timelineTime, targetAhead: 1 });
				if (sessionId !== this.playbackSessionId) return;
			}
		}

		this.clipIterators.delete(clip.id);
		// don't remove from activeClipIds - prevents scheduler from restarting this clip
		// the set is cleared on stopPlayback anyway
	}

	private scheduleClipGainAutomation({
		gainNode,
		startTimestamp,
		bufferDuration,
		clipOffsetSeconds,
		clipDuration,
		clipVolume,
		fadeInMs,
		fadeOutMs,
	}: {
		gainNode: GainNode;
		startTimestamp: number;
		bufferDuration: number;
		clipOffsetSeconds: number;
		clipDuration: number;
		clipVolume: number;
		fadeInMs: number;
		fadeOutMs: number;
	}) {
		const effectiveVolume = Math.max(0, clipVolume ?? 1);
		const fadeInSeconds = Math.max(0, fadeInMs ?? 0) / 1000;
		const fadeOutSeconds = Math.max(0, fadeOutMs ?? 0) / 1000;
		const gain = gainNode.gain;

		gain.cancelScheduledValues(startTimestamp);
		const startGain = this.resolveClipGainAtTime({
			clipOffsetSeconds,
			clipDuration,
			clipVolume: effectiveVolume,
			fadeInSeconds,
			fadeOutSeconds,
		});
		gain.setValueAtTime(startGain, startTimestamp);

		if (fadeInSeconds > 0 && clipOffsetSeconds < fadeInSeconds) {
			const fadeInEnd = startTimestamp + (fadeInSeconds - clipOffsetSeconds);
			gain.linearRampToValueAtTime(effectiveVolume, fadeInEnd);
		}

		if (fadeOutSeconds > 0) {
			const fadeOutStartOffset = Math.max(0, clipDuration - fadeOutSeconds);
			const chunkEndOffset = clipOffsetSeconds + bufferDuration;
			if (chunkEndOffset > fadeOutStartOffset) {
				const fadeOutStartTime = startTimestamp + Math.max(0, fadeOutStartOffset - clipOffsetSeconds);
				const fadeOutEndTime = startTimestamp + Math.max(0, clipDuration - clipOffsetSeconds);
				const fadeOutStartGain = this.resolveClipGainAtTime({
					clipOffsetSeconds: Math.max(clipOffsetSeconds, fadeOutStartOffset),
					clipDuration,
					clipVolume: effectiveVolume,
					fadeInSeconds,
					fadeOutSeconds,
				});
				gain.setValueAtTime(fadeOutStartGain, fadeOutStartTime);
				gain.linearRampToValueAtTime(0, fadeOutEndTime);
			}
		}
	}

	private resolveClipGainAtTime({
		clipOffsetSeconds,
		clipDuration,
		clipVolume,
		fadeInSeconds,
		fadeOutSeconds,
	}: {
		clipOffsetSeconds: number;
		clipDuration: number;
		clipVolume: number;
		fadeInSeconds: number;
		fadeOutSeconds: number;
	}) {
		let gain = clipVolume;

		if (fadeInSeconds > 0 && clipOffsetSeconds < fadeInSeconds) {
			gain = Math.min(gain, clipVolume * (clipOffsetSeconds / fadeInSeconds));
		}

		if (fadeOutSeconds > 0) {
			const remaining = Math.max(0, clipDuration - clipOffsetSeconds);
			if (remaining < fadeOutSeconds) {
				gain = Math.min(gain, clipVolume * (remaining / fadeOutSeconds));
			}
		}

		return Math.max(0, gain);
	}

	private waitUntilCaughtUp({
		timelineTime,
		targetAhead,
	}: {
		timelineTime: number;
		targetAhead: number;
	}): Promise<void> {
		return new Promise((resolve) => {
			const checkInterval = setInterval(() => {
				if (!this.editor.playback.getIsPlaying()) {
					clearInterval(checkInterval);
					resolve();
					return;
				}

				const playbackTime = this.getPlaybackTime();
				if (timelineTime - playbackTime < targetAhead) {
					clearInterval(checkInterval);
					resolve();
				}
			}, 100);
		});
	}

	private disposeSinks(): void {
		for (const iterator of this.clipIterators.values()) {
			void iterator.return();
		}
		this.clipIterators.clear();
		this.activeClipIds.clear();

		for (const input of this.inputs.values()) {
			input.dispose();
		}
		this.inputs.clear();
		this.sinks.clear();
	}

	private async getAudioSink({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBufferSink | null> {
		const existingSink = this.sinks.get(clip.sourceKey);
		if (existingSink) return existingSink;

		try {
			const input = new Input({
				source: new BlobSource(clip.file),
				formats: ALL_FORMATS,
			});
			const audioTrack = await input.getPrimaryAudioTrack();
			if (!audioTrack) {
				input.dispose();
				return null;
			}

			const sink = new AudioBufferSink(audioTrack);
			this.inputs.set(clip.sourceKey, input);
			this.sinks.set(clip.sourceKey, sink);
			return sink;
		} catch (error) {
			console.warn("Failed to initialize audio sink:", error);
			return null;
		}
	}

	private computeAudioSignature({
		tracks = this.editor.timeline.getTracks(),
		mediaAssets = this.editor.media.getAssets(),
	}: {
		tracks?: ReturnType<EditorCore["timeline"]["getTracks"]>;
		mediaAssets?: ReturnType<EditorCore["media"]["getAssets"]>;
	} = {}): string {
		const trackSnapshot = tracks
			// Caption tracks are type "text" and are already excluded by
			// canTracktHaveAudio, but this explicit guard documents intent and
			// prevents regressions if canTracktHaveAudio ever changes.
			.filter((track) => track.name !== GENERATED_CAPTION_TRACK_NAME)
			.filter((track) => canTracktHaveAudio(track))
			.map((track) => {
				const elements = track.elements
					.filter((element) => canElementHaveAudio(element))
					.map((element) => {
						const base = [
							element.id,
							element.type,
							element.startTime,
							element.duration,
							element.trimStart,
							element.trimEnd,
							"muted" in element ? element.muted : "",
						];
						if ("mediaId" in element) {
							base.push(element.mediaId);
						}
						if ("volume" in element) {
							base.push(element.volume ?? "");
							base.push(element.fadeInMs ?? "");
							base.push(element.fadeOutMs ?? "");
						}
						return base.join(":");
					})
					.join("|");
				return `${track.id}:${track.type}:${track.muted}:${elements}`;
			})
			.join("||");

		const mediaSnapshot = mediaAssets
			.filter((asset) => asset.type === "audio" || asset.type === "video")
			.map((asset) => `${asset.id}:${asset.type}:${asset.duration ?? 0}`)
			.join("||");

		return `${trackSnapshot}###${mediaSnapshot}`;
	}
}
