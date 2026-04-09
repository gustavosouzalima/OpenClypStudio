import { getPixelApiBaseUrls } from "@/app/api/pixel/_shared";

function buildUpstreamUrl(baseUrl: string, path: string[], requestUrl: string) {
  const upstreamUrl = new URL(requestUrl);
  upstreamUrl.protocol = new URL(baseUrl).protocol;
  upstreamUrl.host = new URL(baseUrl).host;
  upstreamUrl.pathname = `/${path.join("/")}`;
  return upstreamUrl.toString();
}

async function proxyRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
    redirect: "manual"
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const baseUrls = getPixelApiBaseUrls();
  let lastResponse: Response | null = null;

  for (const baseUrl of baseUrls) {
    const upstream = await fetch(buildUpstreamUrl(baseUrl, path, request.url), init);
    if (upstream.status !== 404 || baseUrl === baseUrls[baseUrls.length - 1]) {
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.set("cache-control", "no-store");

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders
      });
    }
    lastResponse = upstream;
  }

  return new Response(lastResponse?.body, {
    status: lastResponse?.status ?? 502,
    headers: lastResponse?.headers
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
