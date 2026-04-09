import type { TransitionDefinition } from "@/types/transitions";

export const wipeRightTransitionDefinition: TransitionDefinition = {
	type: "wipe-right",
	name: "Wipe Right",
	keywords: ["wipe", "right", "directional"],
	category: "movement",
	defaultDurationMs: 320,
	description: "Reveals the next clip with a horizontal wipe from left to right.",
};
