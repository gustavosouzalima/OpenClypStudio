import type {
	TranscriptionLanguage,
	TranscriptionResult,
	TranscriptionProgress,
	TranscriptionModelId,
} from "@/types/transcription";
import {
	DEFAULT_TRANSCRIPTION_MODEL,
	TRANSCRIPTION_MODELS,
} from "@/constants/transcription-constants";
import type { WorkerMessage, WorkerResponse } from "./worker";

type ProgressCallback = (progress: TranscriptionProgress) => void;
type LogCallback = (message: string) => void;

export class TranscriptionService {
	private worker: Worker | null = null;
	private currentModelId: TranscriptionModelId | null = null;
	private isInitialized = false;
	private isInitializing = false;

	async transcribe({
		audioData,
		language = "auto",
		modelId = DEFAULT_TRANSCRIPTION_MODEL,
		sampleRate = 44100,
		devicePreference = "auto",
		returnTimestamps = true,
		onProgress,
		onLog,
	}: {
		audioData: Float32Array;
		language?: TranscriptionLanguage;
		modelId?: TranscriptionModelId;
		sampleRate?: number;
		devicePreference?: "auto" | "webgpu" | "wasm";
		returnTimestamps?: boolean;
		onProgress?: ProgressCallback;
		onLog?: LogCallback;
	}): Promise<TranscriptionResult> {
		console.log("[transcriptionService] Starting transcription:", {
			audioDataLength: audioData.length,
			language,
			modelId,
			sampleRate,
			devicePreference,
			returnTimestamps,
			durationSeconds: audioData.length / Math.max(sampleRate, 1),
		});
		onLog?.(
			`transcribe:start model=${modelId} duration=${(audioData.length / Math.max(sampleRate, 1)).toFixed(1)}s`,
		);

		await this.ensureWorker({ modelId, onProgress, onLog, devicePreference });

		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("Worker not initialized - try clicking 'Generate Captions' again"));
				return;
			}

			console.log("[transcriptionService] Worker ready, sending audio to worker...");
			onLog?.("worker:ready");

			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;

				console.log("[transcriptionService] Worker response:", {
					type: response.type,
				});

				switch (response.type) {
					case "log":
						onLog?.(response.message);
						break;

					case "transcribe-progress":
						onProgress?.({
							status: "transcribing",
							progress: response.progress,
							message: "Transcribing audio...",
						});
						onLog?.(`transcribe:progress ${response.progress}%`);
						break;

					case "transcribe-complete":
						console.log("[transcriptionService] Transcription complete:", {
							textLength: response.text?.length || 0,
							segmentsCount: response.segments?.length || 0,
						});
						onLog?.(
							`transcribe:complete segments=${response.segments?.length || 0} textLength=${response.text?.length || 0}`,
						);
						this.worker?.removeEventListener("message", handleMessage);
						resolve({
							text: response.text,
							segments: response.segments,
							language,
						});
						break;

					case "transcribe-error":
						console.error("[transcriptionService] Transcription error:", response.error);
						onLog?.(`transcribe:error ${response.error}`);
						this.worker?.removeEventListener("message", handleMessage);
						reject(new Error(`Transcription failed: ${response.error}`));
						break;

					case "cancelled":
						console.warn("[transcriptionService] Transcription cancelled");
						onLog?.("transcribe:cancelled");
						this.worker?.removeEventListener("message", handleMessage);
						reject(new Error("Transcription was cancelled"));
						break;
				}
			};

			this.worker.addEventListener("message", handleMessage);

			try {
				const { payloadAudio, transferables } = this.prepareAudioForTransfer(audioData);
				this.worker.postMessage({
					type: "transcribe",
					audio: payloadAudio,
					language,
					sampleRate,
					returnTimestamps,
				} satisfies WorkerMessage, transferables);
			} catch (error) {
				console.error("[transcriptionService] Failed to send audio to worker:", error);
				onLog?.(
					`worker:postMessage-error ${error instanceof Error ? error.message : "unknown error"}`,
				);
				reject(new Error(`Failed to send audio to worker: ${error instanceof Error ? error.message : "Unknown error"}`));
			}
		});
	}

	cancel() {
		this.worker?.postMessage({ type: "cancel" } satisfies WorkerMessage);
	}

	private async ensureWorker({
		modelId,
		onProgress,
		onLog,
		devicePreference,
	}: {
		modelId: TranscriptionModelId;
		onProgress?: ProgressCallback;
		onLog?: LogCallback;
		devicePreference?: "auto" | "webgpu" | "wasm";
	}): Promise<void> {
		const needsNewModel = this.currentModelId !== modelId;

		if (this.worker && this.isInitialized && !needsNewModel) {
			console.log("[transcriptionService] Worker already initialized with same model:", modelId);
			onLog?.("worker:reused");
			return;
		}

		if (this.isInitializing && !needsNewModel) {
			onLog?.("worker:init-wait");
			await this.waitForInit();
			return;
		}

		console.log("[transcriptionService] Terminating old worker and initializing new model:", {
			oldModelId: this.currentModelId || "none",
			newModelId: modelId,
			needsNewModel,
		});

		this.terminate();
		this.isInitializing = true;
		this.isInitialized = false;

		const model = TRANSCRIPTION_MODELS.find((m) => m.id === modelId);
		if (!model) {
			const availableModels = TRANSCRIPTION_MODELS.map((m) => `${m.id} (${m.name})`).join(", ");
			throw new Error(`Unknown model: ${modelId}. Available models: ${availableModels}`);
		}

		console.log("[transcriptionService] Loading model:", {
			id: model.id,
			name: model.name,
			huggingFaceId: model.huggingFaceId,
			devicePreference: devicePreference ?? "auto",
		});
		onLog?.(`worker:init-start model=${model.name}`);

		this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
			type: "module",
		});

		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("Failed to create worker - browser may not support Web Workers"));
				return;
			}

			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;

				console.log("[transcriptionService] Worker init response:", response.type);

				switch (response.type) {
					case "init-progress":
						onProgress?.({
							status: "loading-model",
							progress: response.progress,
							message: `Loading ${model.name} model...`,
						});
						onLog?.(`worker:init-progress ${response.progress}%`);
						break;

					case "init-complete":
						console.log("[transcriptionService] Model initialization complete");
						onLog?.("worker:init-complete");
						this.worker?.removeEventListener("message", handleMessage);
						this.isInitialized = true;
						this.isInitializing = false;
						this.currentModelId = modelId;
						resolve();
						break;

					case "init-error":
						console.error("[transcriptionService] Model initialization failed:", response.error);
						onLog?.(`worker:init-error ${response.error}`);
						this.worker?.removeEventListener("message", handleMessage);
						this.isInitializing = false;
						this.terminate();
						reject(new Error(`Failed to load model ${model.name}: ${response.error}`));
						break;
				}
			};

			this.worker.addEventListener("message", handleMessage);

			try {
				this.worker.postMessage({
					type: "init",
					modelId: model.huggingFaceId,
					devicePreference: devicePreference ?? "auto",
				} satisfies WorkerMessage);
			} catch (error) {
				console.error("[transcriptionService] Failed to initialize worker:", error);
				onLog?.(
					`worker:init-postMessage-error ${error instanceof Error ? error.message : "unknown error"}`,
				);
				this.worker?.removeEventListener("message", handleMessage);
				this.isInitializing = false;
				this.terminate();
				reject(new Error(`Failed to initialize model ${model.name}: ${error instanceof Error ? error.message : "Unknown error"}`));
			}
		});
	}

	private waitForInit(): Promise<void> {
		return new Promise((resolve) => {
			const checkInit = () => {
				if (this.isInitialized) {
					resolve();
				} else if (!this.isInitializing) {
					resolve();
				} else {
					setTimeout(checkInit, 100);
				}
			};
			checkInit();
		});
	}

	private prepareAudioForTransfer(audioData: Float32Array): {
		payloadAudio: Float32Array;
		transferables: Transferable[];
	} {
		const buffer = audioData.buffer;
		const ownsEntireBuffer =
			audioData.byteOffset === 0 && audioData.byteLength === buffer.byteLength;
		const isShared =
			typeof SharedArrayBuffer !== "undefined" &&
			buffer instanceof SharedArrayBuffer;
		const canTransferDirect = ownsEntireBuffer && !isShared;

		if (canTransferDirect) {
			return {
				payloadAudio: audioData,
				transferables: [buffer as ArrayBuffer],
			};
		}

		const copied = audioData.slice();
		return {
			payloadAudio: copied,
			transferables: [copied.buffer as ArrayBuffer],
		};
	}

	terminate() {
		this.worker?.terminate();
		this.worker = null;
		this.isInitialized = false;
		this.isInitializing = false;
		this.currentModelId = null;
	}
}

export const transcriptionService = new TranscriptionService();
