import type { TransitionDefinition } from "@/types/transitions";

export const zoomOutTransitionDefinition: TransitionDefinition = {
	type: "zoom-out",
	name: "Zoom Out",
	keywords: ["zoom", "out", "reveal"],
	category: "cinematic",
	defaultDurationMs: 400,
	description: "Pulls away from the outgoing shot as the next scene takes over.",
};
