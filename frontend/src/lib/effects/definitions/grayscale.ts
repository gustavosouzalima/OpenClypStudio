import type { EffectDefinition } from "@/types/effects";
import grayscaleFragmentShader from "./grayscale.frag.glsl";

export const grayscaleEffectDefinition: EffectDefinition = {
	type: "grayscale",
	name: "Grayscale",
	keywords: ["grayscale", "black and white", "mono"],
	params: [
		{
			key: "amount",
			label: "Amount",
			type: "number",
			default: 100,
			min: 0,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		type: "webgl",
		passes: [
			{
				fragmentShader: grayscaleFragmentShader,
				uniforms: ({ effectParams }) => {
					const amount =
						typeof effectParams.amount === "number"
							? effectParams.amount
							: Number.parseFloat(String(effectParams.amount));
					return {
						u_amount: Math.max(0, Math.min(1, amount / 100)),
					};
				},
			},
		],
	},
};
