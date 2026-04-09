import type { TransitionDefinition } from "@/types/transitions";

export const zoomPushTransitionDefinition: TransitionDefinition = {
	type: "zoom-push",
	name: "Zoom Push",
	keywords: ["zoom", "push", "cinematic"],
	category: "cinematic",
	defaultDurationMs: 420,
	description: "Blends clips with a zoom-forward camera feel.",
};
