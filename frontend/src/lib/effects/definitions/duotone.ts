import type { EffectDefinition } from "@/types/effects";
import duotoneFragmentShader from "./duotone.frag.glsl";

function hexToRgb(hex: string): [number, number, number] {
	const normalized = hex.replace("#", "");
	const value =
		normalized.length === 3
			? normalized
					.split("")
					.map((part) => `${part}${part}`)
					.join("")
			: normalized;
	const int = Number.parseInt(value, 16);
	return [
		((int >> 16) & 255) / 255,
		((int >> 8) & 255) / 255,
		(int & 255) / 255,
	];
}

export const duotoneEffectDefinition: EffectDefinition = {
	type: "duotone",
	name: "Duotone",
	keywords: ["duotone", "color grade", "stylized", "poster"],
	params: [
		{
			key: "shadowColor",
			label: "Shadow",
			type: "color",
			default: "#1d4ed8",
		},
		{
			key: "highlightColor",
			label: "Highlight",
			type: "color",
			default: "#f59e0b",
		},
		{
			key: "mixAmount",
			label: "Mix",
			type: "number",
			default: 70,
			min: 0,
			max: 100,
			step: 1,
		},
	],
	renderer: {
		type: "webgl",
		passes: [
			{
				fragmentShader: duotoneFragmentShader,
				uniforms: ({ effectParams }) => {
					const mixAmount =
						typeof effectParams.mixAmount === "number"
							? effectParams.mixAmount
							: Number.parseFloat(String(effectParams.mixAmount));
					const shadowColor =
						typeof effectParams.shadowColor === "string"
							? effectParams.shadowColor
							: "#1d4ed8";
					const highlightColor =
						typeof effectParams.highlightColor === "string"
							? effectParams.highlightColor
							: "#f59e0b";
					return {
						u_shadowColor: hexToRgb(shadowColor),
						u_highlightColor: hexToRgb(highlightColor),
						u_mixAmount: Math.max(0, Math.min(1, mixAmount / 100)),
					};
				},
			},
		],
	},
};
