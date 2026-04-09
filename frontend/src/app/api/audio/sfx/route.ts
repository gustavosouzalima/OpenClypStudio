import { webEnv } from "@opencut/env/web";
import { type NextRequest, NextResponse } from "next/server";

interface SfxRequestBody {
	limit?: number;
	page?: number;
	query?: { keys?: string[] } | Record<string, never>;
}

/**
 * Proxies SFX search requests to Freesound API.
 * Adapts the POST body format expected by the editor SFX component
 * to Freesound's GET search API.
 */
export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as SfxRequestBody;
		const limit = body.limit ?? 30;
		const page = body.page ?? 1;
		const keys = body.query?.keys || [];
		const query = keys.join(" ");

		const freesoundKey = webEnv.FREESOUND_API_KEY;
		if (
			!freesoundKey ||
			freesoundKey === "dev-key" ||
			freesoundKey === "your_api_key_here"
		) {
			return NextResponse.json({
				soundEffects: [],
				pagination: { hasMore: false },
			});
		}

		const params = new URLSearchParams({
			query: query || "sound effect",
			token: freesoundKey,
			page: page.toString(),
			page_size: limit.toString(),
			sort: "downloads_desc",
			fields:
				"id,name,description,previews,duration,type,tags,license,username",
		});

		params.append(
			"filter",
			"duration:[* TO 30.0]",
		);
		params.append(
			"filter",
			"tag:sound-effect OR tag:sfx OR tag:foley OR tag:ambient OR tag:nature OR tag:mechanical OR tag:electronic OR tag:impact OR tag:whoosh OR tag:explosion",
		);

		const response = await fetch(
			`https://freesound.org/apiv2/search/text/?${params.toString()}`,
		);

		if (!response.ok) {
			return NextResponse.json({
				soundEffects: [],
				pagination: { hasMore: false },
			});
		}

		const data = (await response.json()) as {
			count: number;
			next: string | null;
			results: Array<{
				id: number;
				name: string;
				description: string;
				previews?: {
					"preview-hq-mp3"?: string;
					"preview-lq-mp3"?: string;
				};
				type: string;
			}>;
		};

		const soundEffects = data.results.map((r) => ({
			id: String(r.id),
			src: r.previews?.["preview-hq-mp3"] || r.previews?.["preview-lq-mp3"] || "",
			name: r.name,
			type: r.type,
			description: r.description,
		}));

		return NextResponse.json({
			soundEffects,
			pagination: { hasMore: data.next !== null },
		});
	} catch (error) {
		console.error("Error searching SFX:", error);
		return NextResponse.json(
			{ error: "Failed to search sound effects" },
			{ status: 500 },
		);
	}
}
