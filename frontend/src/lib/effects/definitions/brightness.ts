import type { EffectDefinition } from "@/types/effects";
import brightnessFragmentShader from "./brightness.frag.glsl";

export const brightnessEffectDefinition: EffectDefinition = {
	type: "brightness",
	name: "Brightness",
	keywords: ["brightness", "exposure", "light"],
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
				fragmentShader: brightnessFragmentShader,
				uniforms: ({ effectParams }) => {
					const amount =
						typeof effectParams.amount === "number"
							? effectParams.amount
							: Number.parseFloat(String(effectParams.amount));
					return {
						u_brightness: Math.max(-1, Math.min(1, amount / 100)),
					};
				},
			},
		],
	},
};
