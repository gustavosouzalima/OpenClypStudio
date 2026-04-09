import type { TransitionDefinition } from "@/types/transitions";

export const fadeTransitionDefinition: TransitionDefinition = {
	type: "fade",
	name: "Fade",
	keywords: ["fade", "crossfade", "dissolve"],
	category: "basic",
	defaultDurationMs: 350,
	description: "Crossfades between the outgoing and incoming clip.",
};
