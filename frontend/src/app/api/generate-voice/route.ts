import { type NextRequest, NextResponse } from "next/server";

/**
 * Stub route for AI voice generation.
 * The editor calls POST /api/generate-voice with {text, voiceId, folder}.
 */
export async function POST(request: NextRequest) {
	return NextResponse.json(
		{
			error:
				"Voice generation service not configured. AI voice generation is not available in this environment.",
		},
		{ status: 501 },
	);
}
