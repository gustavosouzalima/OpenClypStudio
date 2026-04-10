import {
	pipeline,
	type AutomaticSpeechRecognitionPipeline,
	type AutomaticSpeechRecognitionOutput,
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

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let cancelled: boolean = false;
let lastReportedProgress = -1;
const fileBytes = new Map<string, { loaded: number; total: number }>();
const EMPTY_TOKEN_IDS_ERROR = "token_ids must be a non-empty array of integers";
const SILENCE_RMS_THRESHOLD = 0.0025;
const MAX_RMS_SAMPLES = 16000;

function isEmptyTokenIdsError(error: unknown): boolean {
	return (
		error instanceof Error &&
		typeof error.message === "string" &&
		error.message.includes(EMPTY_TOKEN_IDS_ERROR)
	);
}

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

function collectChunkText(result: AutomaticSpeechRecognitionOutput): string {
	if (!Array.isArray(result.chunks) || result.chunks.length === 0) return "";
	return result.chunks
		.map((chunk) => (typeof chunk.text === "string" ? chunk.text.trim() : ""))
		.filter(Boolean)
		.join(" ");
}

function collectResultText(result: AutomaticSpeechRecognitionOutput): string {
	const directText = typeof result.text === "string" ? result.text.trim() : "";
	if (directText.length > 0) return directText;
	return collectChunkText(result);
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
	console.log("[worker] handleInit called with modelId:", modelId, "devicePreference:", devicePreference);
	lastReportedProgress = -1;
	fileBytes.clear();

	try {
		// Accept both internal ids (e.g. "whisper-small") and huggingFace ids
		// (e.g. "onnx-community/whisper-small") for compatibility with callers.
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
		const device: "webgpu" | "wasm" =
			devicePreference === "wasm" ? "wasm" : hasWebGpu ? "webgpu" : "wasm";

		const dtype = device === "webgpu" ? "fp16" : "q4";

		console.log("[worker] Loading model:", {
			modelId: model.id,
			modelName: model.name,
			huggingFaceId: model.huggingFaceId,
			device,
			dtype,
		});

		transcriber = (await pipeline("automatic-speech-recognition", model.huggingFaceId, {
			dtype,
			device,
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

				// sum all bytes
				let totalLoaded = 0;
				let totalSize = 0;
				for (const { loaded, total } of fileBytes.values()) {
					totalLoaded += loaded;
					totalSize += total;
				}

				if (totalSize === 0) return;

				const overallProgress = (totalLoaded / totalSize) * 100;
				const roundedProgress = Math.floor(overallProgress);

				if (roundedProgress !== lastReportedProgress) {
					lastReportedProgress = roundedProgress;
					console.log(`[worker] Model loading progress: ${roundedProgress}%`);
					self.postMessage({
						type: "init-progress",
						progress: roundedProgress,
					} satisfies WorkerResponse);
				}
			},
		})) as unknown as AutomaticSpeechRecognitionPipeline;

		console.log("[worker] Model loaded successfully");
		self.postMessage({ type: "init-complete" } satisfies WorkerResponse);
	} catch (error) {
		console.error("[worker] Model initialization failed:", error);
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
	console.log("[worker] handleTranscribe called:", {
		audioLength: audio.length,
		language,
		sampleRate,
	});

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

		console.log("[worker] Starting transcription with Whisper pipeline...");
		const inferenceChunkLength = returnTimestamps
			? DEFAULT_CHUNK_LENGTH_SECONDS
			: Math.max(DEFAULT_CHUNK_LENGTH_SECONDS, 60);
		const inferenceStride = returnTimestamps
			? DEFAULT_STRIDE_SECONDS
			: Math.min(DEFAULT_STRIDE_SECONDS, 2);

		const pipelineOpts: Record<string, unknown> = {
			chunk_length_s: inferenceChunkLength,
			stride_length_s: inferenceStride,
			return_timestamps: returnTimestamps,
		};

		if (language && language !== "auto") {
			pipelineOpts.language = language;
		} else {
			pipelineOpts.task = "transcribe";
		}

		let rawResult: AutomaticSpeechRecognitionOutput | AutomaticSpeechRecognitionOutput[];
		try {
			rawResult = await transcriber(audio, pipelineOpts);
		} catch (firstError) {
			if (!isEmptyTokenIdsError(firstError)) {
				throw firstError;
			}

			self.postMessage({
				type: "log",
				message: "worker:empty-token-ids retry-without-timestamps",
			} satisfies WorkerResponse);

			// Some WebGPU runs fail on timestamp decoding for near-silent chunks.
			// Retry without timestamps to salvage plain text when possible.
			try {
				rawResult = await transcriber(audio, {
					...pipelineOpts,
					return_timestamps: false,
					chunk_length_s: Math.max(inferenceChunkLength, 60),
					stride_length_s: Math.min(inferenceStride, 2),
				});
			} catch (retryError) {
				if (!isEmptyTokenIdsError(retryError)) {
					throw retryError;
				}

				if (timer) {
					self.clearInterval(timer);
					timer = null;
				}

				self.postMessage({
					type: "log",
					message: "worker:empty-token-ids fallback-empty-chunk",
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
		}
		if (timer) {
			self.clearInterval(timer);
			timer = null;
		}

		let result: AutomaticSpeechRecognitionOutput = Array.isArray(rawResult)
			? rawResult[0]
			: rawResult;

		if (returnTimestamps && collectResultText(result).length === 0) {
			self.postMessage({
				type: "log",
				message: "worker:empty-text retry-without-timestamps",
			} satisfies WorkerResponse);
			try {
				const retryRaw = await transcriber(audio, {
					...pipelineOpts,
					return_timestamps: false,
					chunk_length_s: Math.max(inferenceChunkLength, 60),
					stride_length_s: Math.min(inferenceStride, 2),
				});
				const retryResult: AutomaticSpeechRecognitionOutput = Array.isArray(retryRaw)
					? retryRaw[0]
					: retryRaw;
				if (collectResultText(retryResult).length > 0) {
					rawResult = retryRaw;
					result = retryResult;
					self.postMessage({
						type: "log",
						message: "worker:empty-text retry-succeeded",
					} satisfies WorkerResponse);
				} else {
					self.postMessage({
						type: "log",
						message: "worker:empty-text retry-still-empty",
					} satisfies WorkerResponse);
				}
			} catch (retryError) {
				self.postMessage({
					type: "log",
					message: `worker:empty-text retry-failed ${retryError instanceof Error ? retryError.message : "unknown error"}`,
				} satisfies WorkerResponse);
			}
		}

		console.log("[worker] Transcription raw result:", {
			type: typeof rawResult,
			isArray: Array.isArray(rawResult),
			hasChunks: !!result?.chunks,
			chunksCount: result?.chunks?.length || 0,
			textLength: result?.text?.length || 0,
		});

		if (cancelled) {
			console.log("[worker] Transcription cancelled");
			self.postMessage({
				type: "log",
				message: "worker:transcribe-cancelled",
			} satisfies WorkerResponse);
			return;
		}

		console.log("[worker] Processing transcription result:", {
			hasTimestamps: !!result.chunks?.[0]?.timestamp,
			timestampsLength: result.chunks?.[0]?.timestamp?.length || 0,
			textLength: result.text?.length || 0,
		});

		const segments: TranscriptionSegment[] = [];

		if (result.chunks) {
			for (const chunk of result.chunks) {
				if (chunk.timestamp && chunk.timestamp.length >= 2) {
					segments.push({
						text: chunk.text,
						start: chunk.timestamp[0] ?? 0,
						end: chunk.timestamp[1] ?? chunk.timestamp[0] ?? 0,
					});
				}
			}
		} else {
			console.warn("[worker] No timestamp chunks found in result, trying to extract text-based segments");
		}

		console.log("[worker] Generated segments:", {
			segmentsCount: segments.length,
		segments,
		});

		const finalText = collectResultText(result);

		if (segments.length === 0 && finalText.length > 0) {
			segments.push({
				text: finalText,
				start: 0,
				end: durationSeconds,
			});
		}
		self.postMessage({
			type: "transcribe-progress",
			progress: 100,
		} satisfies WorkerResponse);
		self.postMessage({
			type: "log",
			message: `worker:transcribe-complete segments=${segments.length}`,
		} satisfies WorkerResponse);

		self.postMessage({
			type: "transcribe-complete",
			text: finalText,
			segments,
			language: typeof (rawResult as Record<string, unknown>)?.language === "string"
				? (rawResult as Record<string, unknown>).language as string
				: null,
		} satisfies WorkerResponse);
	} catch (error) {
		if (timer) {
			self.clearInterval(timer);
			timer = null;
		}
		if (cancelled) return;
		console.error("[worker] Transcription failed:", error);
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
