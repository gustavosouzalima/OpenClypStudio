export interface TransitionDefinition {
	type: string;
	name: string;
	keywords: string[];
	category: "basic" | "movement" | "cinematic";
	defaultDurationMs: number;
	description: string;
}
