import type { TransitionDefinition } from "@/types/transitions";

export const slideUpTransitionDefinition: TransitionDefinition = {
	type: "slide-up",
	name: "Slide Up",
	keywords: ["slide", "up", "push"],
	category: "movement",
	defaultDurationMs: 280,
	description: "Moves the next clip upward into frame over the previous clip.",
};
