import type { TransitionDefinition } from "@/types/transitions";

export const pushUpTransitionDefinition: TransitionDefinition = {
	type: "push-up",
	name: "Push Up",
	keywords: ["push", "up", "vertical"],
	category: "movement",
	defaultDurationMs: 320,
	description: "Incoming clip pushes the outgoing clip upward in one motion.",
};
