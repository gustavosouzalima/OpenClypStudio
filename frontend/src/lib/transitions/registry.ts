import type { TransitionDefinition } from "@/types/transitions";

const transitionDefinitions = new Map<string, TransitionDefinition>();

export function registerTransition({
	definition,
}: {
	definition: TransitionDefinition;
}) {
	transitionDefinitions.set(definition.type, definition);
}

export function hasTransition({
	transitionType,
}: {
	transitionType: string;
}) {
	return transitionDefinitions.has(transitionType);
}

export function getTransition({
	transitionType,
}: {
	transitionType: string;
}) {
	const definition = transitionDefinitions.get(transitionType);
	if (!definition) {
		throw new Error(`Unknown transition type: ${transitionType}`);
	}
	return definition;
}

export function getAllTransitions() {
	return Array.from(transitionDefinitions.values());
}
