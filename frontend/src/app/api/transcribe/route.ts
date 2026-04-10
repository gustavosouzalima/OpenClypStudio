import { NextResponse } from "next/server";

interface TranscribeRequest {
  url: string;
  targetLanguage?: string;
  model?: string;
  beam_size?: number;
  batch_size?: number;
}

type PythonTranscriptionSegment = {
  text: string;
  start: number;
  end: number;
};

function getPixelApiBaseUrl() {
  const envValue = process.env.NEXT_PUBLIC_PIXEL_API_BASE_URL?.trim();
  if (envValue) return envValue.replace(/\/$/, "");
  return "http://127.0.0.1:8000";
}

function tryGetDirectPixelMediaUrl(rawUrl: string, requestUrl: string) {
  const pixelApiBaseUrl = getPixelApiBaseUrl();

  const toDirectPixelMediaPath = (pathname: string) => {
    const match = pathname.match(
      /^\/api\/pixel\/projects\/([^/]+)\/videos\/([^/]+)\/media$/
    );

    if (!match) return null;

    const [, projectId, videoId] = match;
    return `${pixelApiBaseUrl}/api/projects/${projectId}/videos/${videoId}/media`;
  };

  if (rawUrl.startsWith("/")) {
    return toDirectPixelMediaPath(rawUrl);
  }

  try {
    const resolvedUrl = new URL(rawUrl, requestUrl);
    return toDirectPixelMediaPath(resolvedUrl.pathname);
  } catch {
    return null;
  }
}

function resolveMediaUrl(rawUrl: string, requestUrl: string) {
  const directPixelMediaUrl = tryGetDirectPixelMediaUrl(rawUrl, requestUrl);
  if (directPixelMediaUrl) return directPixelMediaUrl;

  try {
    return new URL(rawUrl).toString();
  } catch {
    return new URL(rawUrl, requestUrl).toString();
  }
}

function inferExtension(contentType: string) {
  if (contentType.includes("audio/mpeg")) return ".mp3";
  if (contentType.includes("audio/wav")) return ".wav";
  if (contentType.includes("audio/mp4")) return ".m4a";
  if (contentType.includes("video/mp4")) return ".mp4";
  if (contentType.includes("video/webm")) return ".webm";
  return ".bin";
}

function segmentsToWords(segments: PythonTranscriptionSegment[]) {
  const words: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }> = [];

  for (const segment of segments || []) {
    const tokens = segment.text
      .trim()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    if (!tokens.length) continue;

    const segmentDuration = Math.max(0.001, segment.end - segment.start);
    const tokenDuration = segmentDuration / tokens.length;

    tokens.forEach((token, index) => {
      const start = segment.start + tokenDuration * index;
      const end = index === tokens.length - 1 ? segment.end : start + tokenDuration;
      words.push({
        word: token,
        start,
        end,
        confidence: 0.95
      });
    });
  }

  return words;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TranscribeRequest;

    if (!body.url) {
      return NextResponse.json(
        { message: "url is required" },
        { status: 400 }
      );
    }

    const mediaUrl = resolveMediaUrl(body.url, request.url);
    const mediaResponse = await fetch(mediaUrl, { cache: "no-store" });
    if (!mediaResponse.ok) {
      return NextResponse.json(
        { message: `Failed to fetch media source: ${mediaResponse.status}` },
        { status: 502 }
      );
    }

    const contentType =
      mediaResponse.headers.get("content-type") || "application/octet-stream";
    const extension = inferExtension(contentType);
    const fileBuffer = await mediaResponse.arrayBuffer();
    const fileBlob = new Blob([fileBuffer], { type: contentType });

    const formData = new FormData();
    formData.append("audio_file", fileBlob, `editor-media${extension}`);
    formData.append("model", body.model || "small");
    formData.append("language", (body.targetLanguage || "auto").toLowerCase());
    formData.append("beam_size", String(body.beam_size ?? 1));
    formData.append("batch_size", String(body.batch_size ?? 16));

    const pythonResponse = await fetch(
      `${getPixelApiBaseUrl()}/api/editor/transcribe`,
      {
        method: "POST",
        body: formData,
        cache: "no-store"
      }
    );

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      return NextResponse.json(
        {
          message:
            errorText || `Python transcription failed: ${pythonResponse.status}`
        },
        { status: pythonResponse.status }
      );
    }

    const pythonResult = (await pythonResponse.json()) as {
      text?: string;
      segments?: PythonTranscriptionSegment[];
      language?: string;
    };

    return NextResponse.json(
      {
        sourceUrl: body.url,
        results: {
          main: {
            words: segmentsToWords(pythonResult.segments || [])
          }
        },
        raw: pythonResult
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
