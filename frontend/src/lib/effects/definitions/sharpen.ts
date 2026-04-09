import type { EffectDefinition } from "@/types/effects";
import sharpenFragmentShader from "./sharpen.frag.glsl";

export const sharpenEffectDefinition: EffectDefinition = {
	type: "sharpen",
	name: "Sharpen",
	keywords: ["sharpen", "detail", "crisp", "focus"],
	params: [
		{
			key: "amount",
			label: "Amount",
			type: "number",
			default: 20,
			min: 0,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		type: "webgl",
		passes: [
			{
				fragmentShader: sharpenFragmentShader,
				uniforms: ({ effectParams, width, height }) => {
					const amount =
						typeof effectParams.amount === "number"
							? effectParams.amount
							: Number.parseFloat(String(effectParams.amount));
					return {
						u_amount: Math.max(0, Math.min(1, amount / 100)),
						u_texelWidth: width > 0 ? 1 / width : 0,
						u_texelHeight: height > 0 ? 1 / height : 0,
					};
				},
			},
		],
	},
};
