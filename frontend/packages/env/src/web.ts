import { z } from "zod";

const webEnvSchema = z.object({
	// Node
	NODE_ENV: z.enum(["development", "production", "test"]),
	ANALYZE: z.string().optional(),
	NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

	// Public
	NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
	NEXT_PUBLIC_MARBLE_API_URL: z.string().url().optional(),

	// Server — optional so the app can run without cloud services (e.g. VPS / self-hosted)
	DATABASE_URL: z
		.string()
		.startsWith("postgres://")
		.or(z.string().startsWith("postgresql://"))
		.optional()
		.default("postgresql://unused:unused@localhost:5432/unused"),

	BETTER_AUTH_SECRET: z.string().optional().default("unused"),
	UPSTASH_REDIS_REST_URL: z.string().url().optional().default("https://unused.upstash.io"),
	UPSTASH_REDIS_REST_TOKEN: z.string().optional().default("unused"),
	MARBLE_WORKSPACE_KEY: z.string().optional().default(""),
	FREESOUND_CLIENT_ID: z.string().optional().default(""),
	FREESOUND_API_KEY: z.string().optional().default(""),
	CLOUDFLARE_ACCOUNT_ID: z.string().optional().default(""),
	R2_ACCESS_KEY_ID: z.string().optional().default(""),
	R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
	R2_BUCKET_NAME: z.string().optional().default(""),
	MODAL_TRANSCRIPTION_URL: z.string().url().optional().default("https://unused.modal.run"),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export const webEnv = webEnvSchema.parse(process.env);
