/// <reference lib="webworker" />

import {
	Input,
	ALL_FORMATS,
	BlobSource,
	CanvasSink,
	type WrappedCanvas,
} from "mediabunny";

type DecodeSeekMessage = {
	type: "seek";
	requestId: string;
	mediaId: string;
	url: string;
	seekTime: number;
};

type DecodeDisposeMessage = {
	type: "dispose";
	mediaId: string;
};

type DecodeMessage = DecodeSeekMessage | DecodeDisposeMessage;

type DecoderState = {
	sink: CanvasSink;
	iterator: AsyncGenerator<WrappedCanvas, void, unknown> | null;
};

type SeekSuccess = {
	type: "seek-result";
	requestId: string;
	mediaId: string;
	timestamp: number;
	duration: number;
	bitmap: ImageBitmap;
};

type SeekFailure = {
	type: "seek-error";
	requestId: string;
	mediaId: string;
	error: string;
};

const decoders = new Map<string, DecoderState>();

async function ensureDecoder(mediaId: string, url: string): Promise<DecoderState> {
	const existing = decoders.get(mediaId);
	if (existing) return existing;

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch media blob URL (${response.status})`);
	}
	const blob = await response.blob();

	const input = new Input({
		source: new BlobSource(blob),
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

	const state: DecoderState = {
		sink,
		iterator: null,
	};
	decoders.set(mediaId, state);
	return state;
}

async function handleSeek(message: DecodeSeekMessage): Promise<void> {
	try {
		const decoder = await ensureDecoder(message.mediaId, message.url);

		if (decoder.iterator) {
			await decoder.iterator.return();
			decoder.iterator = null;
		}

		decoder.iterator = decoder.sink.canvases(message.seekTime);
		const { value: frame } = await decoder.iterator.next();
		if (!frame) {
			throw new Error("No frame decoded for requested seek time");
		}

		const bitmap = await createImageBitmap(frame.canvas as CanvasImageSource);

		const payload: SeekSuccess = {
			type: "seek-result",
			requestId: message.requestId,
			mediaId: message.mediaId,
			timestamp: frame.timestamp,
			duration: frame.duration,
			bitmap,
		};

		(self as DedicatedWorkerGlobalScope).postMessage(payload, [bitmap]);
	} catch (error) {
		const payload: SeekFailure = {
			type: "seek-error",
			requestId: message.requestId,
			mediaId: message.mediaId,
			error: error instanceof Error ? error.message : "Unknown worker decode error",
		};
		(self as DedicatedWorkerGlobalScope).postMessage(payload);
	}
}

async function handleDispose(message: DecodeDisposeMessage): Promise<void> {
	const decoder = decoders.get(message.mediaId);
	if (!decoder) return;
	if (decoder.iterator) {
		await decoder.iterator.return();
	}
	decoders.delete(message.mediaId);
}

self.onmessage = (event: MessageEvent<DecodeMessage>) => {
	const message = event.data;
	if (!message) return;

	if (message.type === "seek") {
		void handleSeek(message);
		return;
	}

	if (message.type === "dispose") {
		void handleDispose(message);
	}
};

