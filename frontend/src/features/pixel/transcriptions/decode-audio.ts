export interface DecodedAudioBuffer {
	samples: Float32Array;
	sampleRate: number;
}

function resampleLinear({
	input,
	sourceRate,
	targetRate,
}: {
	input: Float32Array;
	sourceRate: number;
	targetRate: number;
}): Float32Array {
	if (sourceRate === targetRate) return input;
	const ratio = sourceRate / targetRate;
	const outputLength = Math.max(1, Math.floor(input.length / ratio));
	const output = new Float32Array(outputLength);

	for (let i = 0; i < outputLength; i += 1) {
		const sourcePosition = i * ratio;
		const left = Math.floor(sourcePosition);
		const right = Math.min(left + 1, input.length - 1);
		const frac = sourcePosition - left;
		output[i] = input[left] * (1 - frac) + input[right] * frac;
	}

	return output;
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
	{ targetSampleRate = 16000 }: { targetSampleRate?: number } = {},
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

		const safeTargetRate = Math.max(8000, Math.floor(targetSampleRate));
		const outputSamples = resampleLinear({
			input: monoSamples,
			sourceRate: decoded.sampleRate,
			targetRate: safeTargetRate,
		});

		return {
			samples: outputSamples,
			sampleRate: safeTargetRate,
		};
	} catch (error) {
		throw new Error(
			`Failed to decode audio blob: ${error instanceof Error ? error.message : "unknown error"}`,
		);
	} finally {
		void audioContext.close();
	}
}
