import {
	pipeline,
	WhisperTextStreamer,
	type AutomaticSpeechRecognitionOutput,
	type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";
import type { TranscriptionSegment } from "@/types/transcription";
import {
	DEFAULT_CHUNK_LENGTH_SECONDS,
	DEFAULT_STRIDE_SECONDS,
	TRANSCRIPTION_MODELS,
} from "@/constants/transcription-constants";

export type WorkerMessage =
	| {
			type: "init";
			modelId: string;
			devicePreference?: "auto" | "webgpu" | "wasm";
	  }
	| {
			type: "transcribe";
			audio: Float32Array;
			language: string;
			sampleRate?: number;
			returnTimestamps?: boolean;
	  }
	| { type: "cancel" };

export type WorkerResponse =
	| { type: "init-progress"; progress: number }
	| { type: "init-complete" }
	| { type: "init-error"; error: string }
	| { type: "log"; message: string }
	| { type: "transcribe-progress"; progress: number }
	| {
			type: "transcribe-complete";
			text: string;
			segments: TranscriptionSegment[];
			language?: string | null;
	  }
	| { type: "transcribe-error"; error: string }
	| { type: "cancelled" };

type StreamChunk = {
	text: string;
	offset: number;
	timestamp: [number, number | null];
	finalised: boolean;
};

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let cancelled = false;
let lastReportedProgress = -1;
let currentDevice: "webgpu" | "wasm" = "wasm";
let currentModelHubId = "";
const fileBytes = new Map<string, { loaded: number; total: number }>();
const SILENCE_RMS_THRESHOLD = 0.0025;
const MAX_RMS_SAMPLES = 16000;

function estimateRms(audio: Float32Array): number {
	if (!audio.length) return 0;
	const step = Math.max(1, Math.floor(audio.length / MAX_RMS_SAMPLES));
	let sumSquares = 0;
	let count = 0;
	for (let i = 0; i < audio.length; i += step) {
		const sample = audio[i] ?? 0;
		sumSquares += sample * sample;
		count += 1;
	}
	return count > 0 ? Math.sqrt(sumSquares / count) : 0;
}

function toSegmentsFromOutput(
	output: AutomaticSpeechRecognitionOutput | null | undefined,
	durationSeconds: number,
): TranscriptionSegment[] {
	const segments: TranscriptionSegment[] = [];
	const rawChunks = (output as { chunks?: Array<Record<string, unknown>> } | null)?.chunks;
	if (Array.isArray(rawChunks)) {
		for (const chunk of rawChunks) {
			const text = typeof chunk.text === "string" ? chunk.text : "";
			const ts = chunk.timestamp;
			if (!Array.isArray(ts) || ts.length < 2) continue;
			const start = typeof ts[0] === "number" ? ts[0] : 0;
			const end = typeof ts[1] === "number" ? ts[1] : start;
			segments.push({ text, start, end });
		}
	}
	const outputText = typeof output?.text === "string" ? output.text.trim() : "";
	if (segments.length === 0 && outputText.length > 0) {
		segments.push({
			text: outputText,
			start: 0,
			end: durationSeconds,
		});
	}
	return segments;
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
	const message = event.data;

	switch (message.type) {
		case "init":
			await handleInit({
				modelId: message.modelId,
				devicePreference: message.devicePreference,
			});
			break;
		case "transcribe":
			await handleTranscribe({
				audio: message.audio,
				language: message.language,
				sampleRate: message.sampleRate,
				returnTimestamps: message.returnTimestamps,
			});
			break;
		case "cancel":
			cancelled = true;
			self.postMessage({ type: "cancelled" } satisfies WorkerResponse);
			break;
	}
};

async function handleInit({
	modelId,
	devicePreference,
}: {
	modelId: string;
	devicePreference?: "auto" | "webgpu" | "wasm";
}) {
	lastReportedProgress = -1;
	fileBytes.clear();

	try {
		const model =
			TRANSCRIPTION_MODELS.find((m) => m.id === modelId) ??
			TRANSCRIPTION_MODELS.find((m) => m.huggingFaceId === modelId);
		if (!model) {
			throw new Error(
				`Unknown model: ${modelId} - available models: ${TRANSCRIPTION_MODELS.map((m) => `${m.id} (${m.huggingFaceId})`).join(", ")}`,
			);
		}

		const hasWebGpu = Boolean((self as unknown as { navigator?: { gpu?: unknown } }).navigator?.gpu);
		if (devicePreference === "webgpu" && !hasWebGpu) {
			throw new Error("WebGPU is not available in this browser/runtime.");
		}
		currentDevice =
			devicePreference === "wasm" ? "wasm" : hasWebGpu ? "webgpu" : "wasm";
		currentModelHubId = model.huggingFaceId;

		const dtype = (
			currentDevice === "webgpu"
				? {
						encoder_model:
							model.huggingFaceId === "onnx-community/whisper-large-v3-turbo"
								? "fp16"
								: "fp32",
						decoder_model_merged: "q4",
					}
				: "q4"
		) as
			| "q4"
			| Record<
					string,
					"auto" | "fp16" | "fp32" | "q4" | "q8" | "int8" | "uint8" | "bnb4" | "q4f16"
			  >;

		transcriber = (await pipeline("automatic-speech-recognition", model.huggingFaceId, {
			dtype,
			device: currentDevice,
			progress_callback: (progressInfo: {
				status?: string;
				file?: string;
				loaded?: number;
				total?: number;
			}) => {
				const file = progressInfo.file;
				if (!file) return;

				const loaded = progressInfo.loaded ?? 0;
				const total = progressInfo.total ?? 0;

				if (progressInfo.status === "progress" && total > 0) {
					fileBytes.set(file, { loaded, total });
				} else if (progressInfo.status === "done") {
					const existing = fileBytes.get(file);
					if (existing) {
						fileBytes.set(file, {
							loaded: existing.total,
							total: existing.total,
						});
					}
				}

				let totalLoaded = 0;
				let totalSize = 0;
				for (const value of fileBytes.values()) {
					totalLoaded += value.loaded;
					totalSize += value.total;
				}
				if (totalSize === 0) return;

				const roundedProgress = Math.floor((totalLoaded / totalSize) * 100);
				if (roundedProgress !== lastReportedProgress) {
					lastReportedProgress = roundedProgress;
					self.postMessage({
						type: "init-progress",
						progress: roundedProgress,
					} satisfies WorkerResponse);
				}
			},
		})) as unknown as AutomaticSpeechRecognitionPipeline;

		self.postMessage({ type: "init-complete" } satisfies WorkerResponse);
	} catch (error) {
		self.postMessage({
			type: "init-error",
			error: error instanceof Error ? error.message : `Failed to load model ${modelId}: ${error}`,
		} satisfies WorkerResponse);
	}
}

async function handleTranscribe({
	audio,
	language,
	sampleRate,
	returnTimestamps = true,
}: {
	audio: Float32Array;
	language: string;
	sampleRate?: number;
	returnTimestamps?: boolean;
}) {
	if (!transcriber) {
		self.postMessage({
			type: "transcribe-error",
			error: "Model not initialized - please try again",
		} satisfies WorkerResponse);
		return;
	}

	cancelled = false;
	let timer: number | null = null;

	try {
		const effectiveSampleRate = sampleRate && sampleRate > 0 ? sampleRate : 44100;
		const durationSeconds = audio.length / effectiveSampleRate;
		const chunkRms = estimateRms(audio);
		if (chunkRms < SILENCE_RMS_THRESHOLD) {
			self.postMessage({
				type: "log",
				message: `worker:silence-skip rms=${chunkRms.toFixed(6)} duration=${durationSeconds.toFixed(1)}s`,
			} satisfies WorkerResponse);
			self.postMessage({
				type: "transcribe-progress",
				progress: 100,
			} satisfies WorkerResponse);
			self.postMessage({
				type: "transcribe-complete",
				text: "",
				segments: [],
				language: null,
			} satisfies WorkerResponse);
			return;
		}

		let syntheticProgress = 0;
		const estimatedMs = Math.max(15000, durationSeconds * 900);
		const startedAt = Date.now();
		let lastHeartbeatMs = 0;

		self.postMessage({
			type: "log",
			message: `worker:transcribe-start duration=${durationSeconds.toFixed(1)}s`,
		} satisfies WorkerResponse);

		timer = self.setInterval(() => {
			if (cancelled) return;
			const elapsedMs = Date.now() - startedAt;
			const ratio = Math.min(elapsedMs / estimatedMs, 1);
			const nextProgress = Math.min(95, Math.max(1, Math.floor(ratio * 95)));
			if (nextProgress > syntheticProgress) {
				syntheticProgress = nextProgress;
				self.postMessage({
					type: "transcribe-progress",
					progress: syntheticProgress,
				} satisfies WorkerResponse);
			}

			if (elapsedMs - lastHeartbeatMs >= 15000) {
				lastHeartbeatMs = elapsedMs;
				self.postMessage({
					type: "log",
					message: `worker:transcribe-running elapsed=${Math.floor(elapsedMs / 1000)}s progress=${syntheticProgress}%`,
				} satisfies WorkerResponse);
			}
		}, 1200);

		const requestedLanguage = language && language !== "auto" ? language : undefined;
		const task = "transcribe";
		const isDistilWhisper = currentModelHubId.includes("/distil-");
		const chunkLengthSeconds = isDistilWhisper ? 20 : DEFAULT_CHUNK_LENGTH_SECONDS;
		const strideSeconds = isDistilWhisper ? 3 : DEFAULT_STRIDE_SECONDS;
		const anyTranscriber = transcriber as unknown as {
			processor?: {
				feature_extractor?: { config?: { chunk_length?: number } };
			};
			model?: { config?: { max_source_positions?: number } };
			tokenizer?: unknown;
		};
		const numerator = anyTranscriber.processor?.feature_extractor?.config?.chunk_length ?? 0;
		const denominator = anyTranscriber.model?.config?.max_source_positions ?? 0;
		const timePrecision = numerator > 0 && denominator > 0 ? numerator / denominator : 0.02;
		const streamedChunks: StreamChunk[] = [];
		let chunkCount = 0;
		let startTime: number | null = null;
		let numTokens = 0;
		let tps = 0;

		const streamer =
			currentDevice === "webgpu" && returnTimestamps
				? new WhisperTextStreamer(anyTranscriber.tokenizer as never, {
						time_precision: timePrecision,
						on_chunk_start: (x: number) => {
							const offset = (chunkLengthSeconds - strideSeconds) * chunkCount;
							streamedChunks.push({
								text: "",
								timestamp: [offset + x, null],
								finalised: false,
								offset,
							});
						},
						token_callback_function: () => {
							startTime ??= performance.now();
							if (numTokens++ > 0 && startTime !== null) {
								tps = (numTokens / (performance.now() - startTime)) * 1000;
							}
						},
						callback_function: (x: string) => {
							if (streamedChunks.length === 0) return;
							const current = streamedChunks[streamedChunks.length - 1];
							current.text += x;
						},
						on_chunk_end: (x: number) => {
							const current = streamedChunks[streamedChunks.length - 1];
							if (!current) return;
							current.timestamp[1] = x + current.offset;
							current.finalised = true;
						},
						on_finalize: () => {
							startTime = null;
							numTokens = 0;
							chunkCount += 1;
						},
					} as never)
				: null;

		const rawOutput = await transcriber(audio, {
			top_k: 0,
			do_sample: false,
			chunk_length_s: chunkLengthSeconds,
			stride_length_s: strideSeconds,
			language: requestedLanguage,
			task,
			return_timestamps: returnTimestamps,
			force_full_sequences: false,
			...(streamer ? { streamer } : {}),
		});

		if (timer) {
			self.clearInterval(timer);
			timer = null;
		}

		if (cancelled) {
			self.postMessage({
				type: "log",
				message: "worker:transcribe-cancelled",
			} satisfies WorkerResponse);
			return;
		}

		const output = (Array.isArray(rawOutput) ? rawOutput[0] : rawOutput) as AutomaticSpeechRecognitionOutput;
		const outputText = typeof output?.text === "string" ? output.text.trim() : "";
		const streamedText = streamedChunks.map((chunk) => chunk.text).join("").trim();
		const finalText = outputText || streamedText;

		let segments = toSegmentsFromOutput(output, durationSeconds);
		if (segments.length === 0 && streamedChunks.length > 0) {
			segments = streamedChunks
				.filter((chunk) => chunk.text.trim().length > 0)
				.map((chunk) => ({
					text: chunk.text,
					start: chunk.timestamp[0] ?? 0,
					end: chunk.timestamp[1] ?? chunk.timestamp[0] ?? durationSeconds,
				}));
		}
		if (segments.length === 0 && finalText.length > 0) {
			segments = [
				{
					text: finalText,
					start: 0,
					end: durationSeconds,
				},
			];
		}

		self.postMessage({
			type: "transcribe-progress",
			progress: 100,
		} satisfies WorkerResponse);
		self.postMessage({
			type: "log",
			message: `worker:transcribe-complete segments=${segments.length} tps=${tps.toFixed(2)}`,
		} satisfies WorkerResponse);
		self.postMessage({
			type: "transcribe-complete",
			text: finalText,
			segments,
			language:
				typeof (rawOutput as Record<string, unknown>)?.language === "string"
					? ((rawOutput as Record<string, unknown>).language as string)
					: null,
		} satisfies WorkerResponse);
	} catch (error) {
		if (timer) {
			self.clearInterval(timer);
			timer = null;
		}
		if (cancelled) return;

		self.postMessage({
			type: "log",
			message: `worker:transcribe-failed ${error instanceof Error ? error.message : "unknown error"}`,
		} satisfies WorkerResponse);
		self.postMessage({
			type: "transcribe-error",
			error: error instanceof Error ? error.message : "Transcription failed - see console for details",
		} satisfies WorkerResponse);
	}
}
