import { type NextRequest, NextResponse } from "next/server";

/**
 * Stub route for render/export requests.
 * The editor's use-download-state store calls POST /api/render to start
 * a render job and GET /api/render/{jobId} to poll status.
 * This endpoint is not yet connected to a rendering backend.
 */
export async function POST(request: NextRequest) {
	return NextResponse.json(
		{
			error:
				"Render service not configured. Export to MP4 is not available in this environment.",
		},
		{ status: 501 },
	);
}
