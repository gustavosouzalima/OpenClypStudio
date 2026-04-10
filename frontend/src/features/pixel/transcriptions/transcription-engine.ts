import type { TranscriptionModelId } from "@/types/transcription";

export type TranscriptionEnginePreference =
	| "auto"
	| "server"
	| "local-gpu"
	| "local-cpu";

export type ResolvedTranscriptionEngine = "server" | "local-gpu" | "local-cpu";

export interface BrowserTranscriptionCapabilities {
	hasWebGpu: boolean;
	logicalCores: number;
	deviceMemoryGb: number | null;
}

export function detectBrowserTranscriptionCapabilities(): BrowserTranscriptionCapabilities {
	const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
	const logicalCores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 4 : 4;
	const navWithMemory = navigator as Navigator & { deviceMemory?: number };
	const deviceMemoryGb =
		typeof navigator !== "undefined" && typeof navWithMemory.deviceMemory === "number"
			? navWithMemory.deviceMemory
			: null;

	return {
		hasWebGpu,
		logicalCores,
		deviceMemoryGb,
	};
}

export function resolveTranscriptionEngine({
	preference,
	activeTab,
	totalFileSizeBytes,
	capabilities,
}: {
	preference: TranscriptionEnginePreference;
	activeTab: "upload" | "url";
	totalFileSizeBytes: number;
	capabilities: BrowserTranscriptionCapabilities;
}): {
	engine: ResolvedTranscriptionEngine;
	reason: string;
} {
	// URL mode needs server-side download/transcode support.
	if (activeTab === "url") {
		return {
			engine: "server",
			reason: "URL sources require backend downloader support.",
		};
	}

	const totalSizeMb = totalFileSizeBytes / (1024 * 1024);
	const hasStrongCpu =
		capabilities.logicalCores >= 8 ||
		(capabilities.deviceMemoryGb !== null && capabilities.deviceMemoryGb >= 8);

	if (preference === "server") {
		return { engine: "server", reason: "Server engine selected manually." };
	}

	if (preference === "local-gpu") {
		if (capabilities.hasWebGpu) {
			return { engine: "local-gpu", reason: "Local GPU selected manually." };
		}
		return {
			engine: "local-cpu",
			reason: "WebGPU unavailable; falling back to local CPU.",
		};
	}

	if (preference === "local-cpu") {
		return { engine: "local-cpu", reason: "Local CPU selected manually." };
	}

	// Auto mode heuristics tuned for shared VPS cost savings + better UX.
	if (capabilities.hasWebGpu && totalSizeMb <= 256) {
		return {
			engine: "local-gpu",
			reason: "Auto selected local GPU (WebGPU available and file size in local range).",
		};
	}

	if (hasStrongCpu && totalSizeMb <= 120) {
		return {
			engine: "local-cpu",
			reason: "Auto selected local CPU (strong client CPU/RAM and medium file size).",
		};
	}

	return {
		engine: "server",
		reason: "Auto selected backend for heavier workload.",
	};
}

export function mapServerModelToLocalModel({
	serverModel,
	engine,
}: {
	serverModel: string;
	engine: ResolvedTranscriptionEngine;
}): TranscriptionModelId {
	const normalized = serverModel.trim().toLowerCase();

	if (normalized === "tiny") return "whisper-tiny";
	if (normalized === "base" || normalized === "small") return "whisper-small";
	if (normalized === "medium") return "whisper-medium";
	if (normalized === "large-v3-turbo") return "whisper-large-v3-turbo";
	if (normalized === "large-v3") {
		// Local browser catalog exposes turbo as the large model option.
		return engine === "local-cpu" ? "whisper-medium" : "whisper-large-v3-turbo";
	}

	return engine === "local-cpu" ? "whisper-small" : "whisper-medium";
}
