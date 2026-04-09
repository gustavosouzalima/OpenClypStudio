type SeekRequest = {
	mediaId: string;
	url: string;
	seekTime: number;
};

export type WorkerSeekResult = {
	mediaId: string;
	timestamp: number;
	duration: number;
	bitmap: ImageBitmap;
};

type SeekResultMessage = {
	type: "seek-result";
	requestId: string;
	mediaId: string;
	timestamp: number;
	duration: number;
	bitmap: ImageBitmap;
};

type SeekErrorMessage = {
	type: "seek-error";
	requestId: string;
	mediaId: string;
	error: string;
};

type WorkerMessage = SeekResultMessage | SeekErrorMessage;

type Pending = {
	resolve: (result: WorkerSeekResult) => void;
	reject: (error: Error) => void;
};

const MAX_WORKERS = 2;

export class VideoDecodeWorkerPool {
	private workers: Worker[] = [];
	private pending = new Map<string, Pending>();
	private rrIndex = 0;
	private mediaToWorker = new Map<string, Worker>();

	static isSupported(): boolean {
		return typeof window !== "undefined" && typeof Worker !== "undefined";
	}

	constructor() {
		if (!VideoDecodeWorkerPool.isSupported()) return;

		for (let i = 0; i < MAX_WORKERS; i += 1) {
			const worker = new Worker(new URL("./decode-worker.ts", import.meta.url), {
				type: "module",
			});
			worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
				const message = event.data;
				if (!message) return;

				const task = this.pending.get(message.requestId);
				if (!task) return;
				this.pending.delete(message.requestId);

				if (message.type === "seek-result") {
					task.resolve({
						mediaId: message.mediaId,
						timestamp: message.timestamp,
						duration: message.duration,
						bitmap: message.bitmap,
					});
					return;
				}

				task.reject(new Error(message.error));
			};
			this.workers.push(worker);
		}
	}

	get hasWorkers(): boolean {
		return this.workers.length > 0;
	}

	async seek(request: SeekRequest): Promise<WorkerSeekResult> {
		if (!this.hasWorkers) {
			throw new Error("No decode workers available");
		}

		const worker = this.getWorkerForMedia(request.mediaId);
		const requestId = `${request.mediaId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

		return new Promise<WorkerSeekResult>((resolve, reject) => {
			this.pending.set(requestId, { resolve, reject });
			worker.postMessage({
				type: "seek",
				requestId,
				mediaId: request.mediaId,
				url: request.url,
				seekTime: request.seekTime,
			});
		});
	}

	disposeMedia(mediaId: string): void {
		const worker = this.mediaToWorker.get(mediaId);
		if (!worker) return;
		worker.postMessage({ type: "dispose", mediaId });
		this.mediaToWorker.delete(mediaId);
	}

	disposeAll(): void {
		for (const worker of this.workers) {
			worker.terminate();
		}
		this.workers = [];
		this.pending.clear();
		this.mediaToWorker.clear();
	}

	private getWorkerForMedia(mediaId: string): Worker {
		const assigned = this.mediaToWorker.get(mediaId);
		if (assigned) return assigned;

		const worker = this.workers[this.rrIndex % this.workers.length];
		this.rrIndex += 1;
		this.mediaToWorker.set(mediaId, worker);
		return worker;
	}
}

