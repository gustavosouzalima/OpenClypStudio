import type { EffectDefinition } from "@/types/effects";
import sepiaFragmentShader from "./sepia.frag.glsl";

export const sepiaEffectDefinition: EffectDefinition = {
	type: "sepia",
	name: "Sepia",
	keywords: ["sepia", "vintage", "warm"],
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
				fragmentShader: sepiaFragmentShader,
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
