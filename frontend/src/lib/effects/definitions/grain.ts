import type { EffectDefinition } from "@/types/effects";
import grainFragmentShader from "./grain.frag.glsl";

export const grainEffectDefinition: EffectDefinition = {
	type: "grain",
	name: "Film Grain",
	keywords: ["grain", "noise", "film"],
	params: [
		{
			key: "amount",
			label: "Amount",
			type: "number",
			default: 12,
			min: 0,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		type: "webgl",
		passes: [
			{
				fragmentShader: grainFragmentShader,
				uniforms: ({ effectParams }) => {
					const amount =
						typeof effectParams.amount === "number"
							? effectParams.amount
							: Number.parseFloat(String(effectParams.amount));
					return { u_amount: Math.max(0, Math.min(1, amount / 250)) };
				},
			},
		],
	},
};
