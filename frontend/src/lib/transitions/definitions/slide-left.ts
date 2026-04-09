import type { TransitionDefinition } from "@/types/transitions";

export const slideLeftTransitionDefinition: TransitionDefinition = {
	type: "slide-left",
	name: "Slide Left",
	keywords: ["slide", "left", "push"],
	category: "movement",
	defaultDurationMs: 280,
	description: "Pushes the outgoing clip away while the next clip slides in.",
};
