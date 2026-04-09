import type { EffectDefinition } from "@/types/effects";
import pixelateFragmentShader from "./pixelate.frag.glsl";

export const pixelateEffectDefinition: EffectDefinition = {
	type: "pixelate",
	name: "Pixelate",
	keywords: ["pixelate", "mosaic", "blocky"],
	params: [
		{
			key: "size",
			label: "Size",
			type: "number",
			default: 12,
			min: 1,
			max: 80,
			step: 1,
		},
	],
	renderer: {
		type: "webgl",
		passes: [
			{
				fragmentShader: pixelateFragmentShader,
				uniforms: ({ effectParams }) => {
					const size =
						typeof effectParams.size === "number"
							? effectParams.size
							: Number.parseFloat(String(effectParams.size));
					return { u_pixel_size: Math.max(1, size) };
				},
			},
		],
	},
};
