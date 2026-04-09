import type { EffectDefinition } from "@/types/effects";
import thresholdFragmentShader from "./threshold.frag.glsl";

export const thresholdEffectDefinition: EffectDefinition = {
	type: "threshold",
	name: "Threshold",
	keywords: ["threshold", "black and white", "poster", "binary"],
	params: [
		{
			key: "amount",
			label: "Amount",
			type: "number",
			default: 50,
			min: 0,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		type: "webgl",
		passes: [
			{
				fragmentShader: thresholdFragmentShader,
				uniforms: ({ effectParams }) => {
					const amount =
						typeof effectParams.amount === "number"
							? effectParams.amount
							: Number.parseFloat(String(effectParams.amount));
					return {
						u_threshold: Math.max(0, Math.min(1, amount / 100)),
					};
				},
			},
		],
	},
};
