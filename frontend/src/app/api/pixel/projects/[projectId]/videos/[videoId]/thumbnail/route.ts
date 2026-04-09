import { proxyPixel } from "@/app/api/pixel/_shared";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; videoId: string }> }
) {
  const { projectId, videoId } = await context.params;
  const upstream = await proxyPixel(
    `/api/projects/${projectId}/videos/${videoId}/thumbnail`
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "image/jpeg",
      "cache-control": "no-store"
    }
  });
}
