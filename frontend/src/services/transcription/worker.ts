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
	| { type: "init"; modelId: string }
	| { type: "transcribe"; audio: Float32Array; language: string }
	| { type: "cancel" };

export type WorkerResponse =
	| { type: "init-progress"; progress: number }
	| { type: "init-complete" }
	| { type: "init-error"; error: string }
	| { type: "transcribe-progress"; progress: number }
	| {
			type: "transcribe-complete";
			text: string;
			segments: TranscriptionSegment[];
	  }
	| { type: "transcribe-error"; error: string }
	| { type: "cancelled" };

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let cancelled: boolean = false;
let lastReportedProgress = -1;
const fileBytes = new Map<string, { loaded: number; total: number }>();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
	const message = event.data;

	switch (message.type) {
		case "init":
			await handleInit({ modelId: message.modelId });
			break;
		case "transcribe":
			await handleTranscribe({
				audio: message.audio,
				language: message.language,
			});
			break;
		case "cancel":
			cancelled = true;
			self.postMessage({ type: "cancelled" } satisfies WorkerResponse);
			break;
	}
};

async function handleInit({ modelId }: { modelId: string }) {
	console.log("[worker] handleInit called with modelId:", modelId);
	lastReportedProgress = -1;
	fileBytes.clear();

	try {
		const model = TRANSCRIPTION_MODELS.find((m) => m.id === modelId);
		if (!model) {
			throw new Error(`Unknown model: ${modelId} - available models: ${TRANSCRIPTION_MODELS.map((m) => m.id).join(", ")}`);
		}

		console.log("[worker] Loading model:", {
			modelId: model.id,
			modelName: model.name,
			huggingFaceId: model.huggingFaceId,
		});

		transcriber = (await pipeline("automatic-speech-recognition", modelId, {
			dtype: "q4",
			device: "auto",
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
}: {
	audio: Float32Array;
	language: string;
}) {
	console.log("[worker] handleTranscribe called:", {
		audioLength: audio.length,
		language,
	});

	if (!transcriber) {
		self.postMessage({
			type: "transcribe-error",
			error: "Model not initialized - please try again",
		} satisfies WorkerResponse);
		return;
	}

	cancelled = false;

	try {
		console.log("[worker] Starting transcription with Whisper pipeline...");
		const rawResult = await transcriber(audio, {
			chunk_length_s: DEFAULT_CHUNK_LENGTH_SECONDS,
			stride_length_s: DEFAULT_STRIDE_SECONDS,
			language: language === "auto" ? undefined : language,
			return_timestamps: true,
		});

		const result: AutomaticSpeechRecognitionOutput = Array.isArray(rawResult)
			? rawResult[0]
			: rawResult;

		console.log("[worker] Transcription raw result:", {
			type: typeof rawResult,
			isArray: Array.isArray(rawResult),
			hasChunks: !!result?.chunks,
			chunksCount: result?.chunks?.length || 0,
			textLength: result?.text?.length || 0,
		});

		if (cancelled) {
			console.log("[worker] Transcription cancelled");
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

		if (segments.length === 0) {
			throw new Error("No valid segments generated from transcription - audio may be too short or silent");
		}

		self.postMessage({
			type: "transcribe-complete",
			text: result.text,
			segments,
		} satisfies WorkerResponse);
	} catch (error) {
		if (cancelled) return;
		console.error("[worker] Transcription failed:", error);
		self.postMessage({
			type: "transcribe-error",
			error: error instanceof Error ? error.message : "Transcription failed - see console for details",
		} satisfies WorkerResponse);
	}
}
