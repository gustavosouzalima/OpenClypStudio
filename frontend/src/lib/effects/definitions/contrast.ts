import type { EffectDefinition } from "@/types/effects";
import contrastFragmentShader from "./contrast.frag.glsl";

export const contrastEffectDefinition: EffectDefinition = {
	type: "contrast",
	name: "Contrast",
	keywords: ["contrast", "tone", "punch"],
	params: [
		{
			key: "amount",
			label: "Amount",
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		type: "webgl",
		passes: [
			{
				fragmentShader: contrastFragmentShader,
				uniforms: ({ effectParams }) => {
					const amount =
						typeof effectParams.amount === "number"
							? effectParams.amount
							: Number.parseFloat(String(effectParams.amount));
					return {
						u_contrast: Math.max(0, 1 + amount / 100),
					};
				},
			},
		],
	},
};
