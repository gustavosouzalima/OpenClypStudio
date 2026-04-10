const DEFAULT_PIXEL_API_BASE_URL = "http://127.0.0.1:8000";
const LOCAL_FALLBACK_PIXEL_API_BASE_URL = "http://127.0.0.1:8010";

export function getPixelApiKey() {
  return (
    process.env.PIXEL_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_PIXEL_API_KEY?.trim() ||
    ""
  );
}

export function getPixelApiBaseUrl() {
  const envValue = process.env.NEXT_PUBLIC_PIXEL_API_BASE_URL?.trim();
  if (envValue) return envValue.replace(/\/$/, "");
  return DEFAULT_PIXEL_API_BASE_URL;
}

export function getPixelApiBaseUrls() {
  const primary = getPixelApiBaseUrl();
  if (primary === DEFAULT_PIXEL_API_BASE_URL) {
    return [primary, LOCAL_FALLBACK_PIXEL_API_BASE_URL];
  }
  return [primary];
}

export async function proxyPixel(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const baseUrls = getPixelApiBaseUrls();
  const apiKey = getPixelApiKey();
  let lastError: unknown;

  for (const baseUrl of baseUrls) {
    const upstream = `${baseUrl}${path}`;

    try {
      const headers = new Headers(init?.headers);
      if (apiKey && !headers.has("x-api-key")) {
        headers.set("x-api-key", apiKey);
      }

      const response = await fetch(upstream, {
        ...init,
        headers,
        cache: "no-store"
      });

      if (response.status !== 404 || baseUrl === baseUrls[baseUrls.length - 1]) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (baseUrl === baseUrls[baseUrls.length - 1]) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error(`Unable to reach Pixel API for path: ${path}`);
}
