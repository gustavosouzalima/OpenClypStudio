import type { EffectDefinition } from "@/types/effects";
import hueShiftFragmentShader from "./hue-shift.frag.glsl";

export const hueShiftEffectDefinition: EffectDefinition = {
	type: "hue-shift",
	name: "Hue Shift",
	keywords: ["hue", "shift", "color wheel"],
	params: [
		{
			key: "angle",
			label: "Angle",
			type: "number",
			default: 45,
			min: -180,
			max: 180,
			step: 1,
		},
	],
	renderer: {
		type: "webgl",
		passes: [
			{
				fragmentShader: hueShiftFragmentShader,
				uniforms: ({ effectParams }) => {
					const angle =
						typeof effectParams.angle === "number"
							? effectParams.angle
							: Number.parseFloat(String(effectParams.angle));
					return { u_angle: (angle * 3.141592653589793) / 180.0 };
				},
			},
		],
	},
};
