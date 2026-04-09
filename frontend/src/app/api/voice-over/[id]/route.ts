import { type NextRequest, NextResponse } from "next/server";

/**
 * Stub route for voice-over status polling.
 */
export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	return NextResponse.json(
		{
			error: `Voice-over ${id}: service not configured.`,
		},
		{ status: 501 },
	);
}
