import { type NextRequest, NextResponse } from "next/server";

/**
 * Stub route for voice-over generation.
 * The editor calls POST /api/voice-over with {voiceId, text}
 * and polls GET /api/voice-over/{id} for status.
 */
export async function POST(request: NextRequest) {
	return NextResponse.json(
		{
			error:
				"Voice-over service not configured. AI voice-over generation is not available in this environment.",
		},
		{ status: 501 },
	);
}
