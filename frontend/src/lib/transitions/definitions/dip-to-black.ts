import type { TransitionDefinition } from "@/types/transitions";

export const dipToBlackTransitionDefinition: TransitionDefinition = {
	type: "dip-to-black",
	name: "Dip To Black",
	keywords: ["dip", "black", "fade", "cinematic"],
	category: "cinematic",
	defaultDurationMs: 500,
	description: "Fades down to black before revealing the incoming clip.",
};
