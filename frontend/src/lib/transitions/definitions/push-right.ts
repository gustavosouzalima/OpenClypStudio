import type { TransitionDefinition } from "@/types/transitions";

export const pushRightTransitionDefinition: TransitionDefinition = {
	type: "push-right",
	name: "Push Right",
	keywords: ["push", "right", "movement"],
	category: "movement",
	defaultDurationMs: 320,
	description: "Incoming clip pushes the outgoing clip toward the right edge.",
};
