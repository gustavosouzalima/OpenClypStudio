import type { TransitionDefinition } from "@/types/transitions";

export const zoomInTransitionDefinition: TransitionDefinition = {
	type: "zoom-in",
	name: "Zoom In",
	keywords: ["zoom", "in", "focus"],
	category: "cinematic",
	defaultDurationMs: 400,
	description: "Zooms into the incoming shot for a punchier scene change.",
};
