import type { EffectDefinition } from "@/types/effects";
import chromaticShiftFragmentShader from "./chromatic-shift.frag.glsl";

export const chromaticShiftEffectDefinition: EffectDefinition = {
	type: "chromatic-shift",
	name: "Chromatic Shift",
	keywords: ["chromatic", "rgb split", "aberration", "glitch"],
	params: [
		{
			key: "amount",
			label: "Amount",
			type: "number",
			default: 2,
			min: 0,
			max: 24,
			step: 1,
		},
	],
	renderer: {
		type: "webgl",
		passes: [
			{
				fragmentShader: chromaticShiftFragmentShader,
				uniforms: ({ effectParams, width }) => {
					const amount =
						typeof effectParams.amount === "number"
							? effectParams.amount
							: Number.parseFloat(String(effectParams.amount));
					return {
						u_offset: Math.max(0, amount),
						u_texelWidth: width > 0 ? 1 / width : 0,
					};
				},
			},
		],
	},
};
