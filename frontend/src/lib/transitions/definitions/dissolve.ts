import type { TransitionDefinition } from "@/types/transitions";

export const dissolveTransitionDefinition: TransitionDefinition = {
	type: "dissolve",
	name: "Dissolve",
	keywords: ["dissolve", "blend", "soft", "crossfade"],
	category: "basic",
	defaultDurationMs: 450,
	description: "A softer blended cross dissolve between two clips.",
};
