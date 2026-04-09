import { proxyPixel } from "@/app/api/pixel/_shared";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  const payload = await request.text();
  const upstream = await proxyPixel(`/api/projects/${projectId}/sync-editor-state`, {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") || "application/json"
    },
    body: payload
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store"
    }
  });
}

