import type { EffectDefinition } from "@/types/effects";
import vignetteFragmentShader from "./vignette.frag.glsl";

export const vignetteEffectDefinition: EffectDefinition = {
	type: "vignette",
	name: "Vignette",
	keywords: ["vignette", "cinematic", "edge darken"],
	params: [
		{
			key: "intensity",
			label: "Intensity",
			type: "number",
			default: 60,
			min: 0,
			max: 100,
			step: 1,
		},
		{
			key: "softness",
			label: "Softness",
			type: "number",
			default: 45,
			min: 1,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		type: "webgl",
		passes: [
			{
				fragmentShader: vignetteFragmentShader,
				uniforms: ({ effectParams }) => {
					const intensity =
						typeof effectParams.intensity === "number"
							? effectParams.intensity
							: Number.parseFloat(String(effectParams.intensity));
					const softness =
						typeof effectParams.softness === "number"
							? effectParams.softness
							: Number.parseFloat(String(effectParams.softness));
					return {
						u_intensity: Math.max(0, Math.min(1, intensity / 100)),
						u_softness: Math.max(0.01, Math.min(0.99, softness / 100)),
					};
				},
			},
		],
	},
};
