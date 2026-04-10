export interface DecodedAudioBuffer {
	samples: Float32Array;
	sampleRate: number;
}

function createAudioContext(): AudioContext {
	const AudioContextCtor =
		window.AudioContext ||
		(window as typeof window & { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;

	if (!AudioContextCtor) {
		throw new Error("Web Audio API is not available in this browser.");
	}

	return new AudioContextCtor();
}

export async function decodeAudioBlobToMonoFloat32(
	audioBlob: Blob,
): Promise<DecodedAudioBuffer> {
	const audioContext = createAudioContext();
	try {
		const arrayBuffer = await audioBlob.arrayBuffer();
		const decoded = await audioContext.decodeAudioData(arrayBuffer);
		const numChannels = decoded.numberOfChannels;
		const length = decoded.length;
		const monoSamples = new Float32Array(length);

		for (let i = 0; i < length; i += 1) {
			let sum = 0;
			for (let ch = 0; ch < numChannels; ch += 1) {
				sum += decoded.getChannelData(ch)[i];
			}
			monoSamples[i] = sum / numChannels;
		}

		return {
			samples: monoSamples,
			sampleRate: decoded.sampleRate,
		};
	} catch (error) {
		throw new Error(
			`Failed to decode audio blob: ${error instanceof Error ? error.message : "unknown error"}`,
		);
	} finally {
		void audioContext.close();
	}
}
