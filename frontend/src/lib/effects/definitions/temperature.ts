import type { EffectDefinition } from "@/types/effects";
import temperatureFragmentShader from "./temperature.frag.glsl";

export const temperatureEffectDefinition: EffectDefinition = {
	type: "temperature",
	name: "Temperature",
	keywords: ["temperature", "warm", "cool", "tone"],
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
				fragmentShader: temperatureFragmentShader,
				uniforms: ({ effectParams }) => {
					const amount =
						typeof effectParams.amount === "number"
							? effectParams.amount
							: Number.parseFloat(String(effectParams.amount));
					return {
						u_temperature: Math.max(-1, Math.min(1, amount / 100)),
					};
				},
			},
		],
	},
};
