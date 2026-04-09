import { type NextRequest, NextResponse } from "next/server";

/**
 * Stub route for render job status polling.
 */
export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const { jobId } = await params;
	return NextResponse.json(
		{
			error: `Render job ${jobId}: render service not configured.`,
		},
		{ status: 501 },
	);
}
