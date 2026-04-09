import type { TransitionDefinition } from "@/types/transitions";

export const wipeLeftTransitionDefinition: TransitionDefinition = {
	type: "wipe-left",
	name: "Wipe Left",
	keywords: ["wipe", "left", "directional"],
	category: "movement",
	defaultDurationMs: 320,
	description: "Reveals the next clip with a horizontal wipe from right to left.",
};
