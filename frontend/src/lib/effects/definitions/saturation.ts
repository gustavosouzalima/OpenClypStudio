import type { EffectDefinition } from "@/types/effects";
import saturationFragmentShader from "./saturation.frag.glsl";

export const saturationEffectDefinition: EffectDefinition = {
	type: "saturation",
	name: "Saturation",
	keywords: ["saturation", "color", "vibrance"],
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
				fragmentShader: saturationFragmentShader,
				uniforms: ({ effectParams }) => {
					const amount =
						typeof effectParams.amount === "number"
							? effectParams.amount
							: Number.parseFloat(String(effectParams.amount));
					return {
						u_saturation: Math.max(0, 1 + amount / 100),
					};
				},
			},
		],
	},
};
