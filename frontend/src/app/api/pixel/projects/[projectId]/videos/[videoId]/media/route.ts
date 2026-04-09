import { proxyPixel } from "@/app/api/pixel/_shared";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; videoId: string }> }
) {
  const { projectId, videoId } = await context.params;
  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("range", range);
  const upstream = await proxyPixel(
    `/api/projects/${projectId}/videos/${videoId}/media`,
    {
      headers: upstreamHeaders
    }
  );

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const acceptRanges = upstream.headers.get("accept-ranges");
  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  if (contentType) headers.set("content-type", contentType);
  if (acceptRanges) headers.set("accept-ranges", acceptRanges);
  if (contentLength) headers.set("content-length", contentLength);
  if (contentRange) headers.set("content-range", contentRange);
  headers.set("cache-control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    headers
  });
}
