import { NextRequest, NextResponse } from "next/server";
import { registerLocalUpload } from "@/editor_runtime/lib/local-upload-store";

interface PresignRequest {
  userId: string;
  fileNames: string[];
  fileTypes?: string[];
}

interface LocalUploadResponse {
  fileName: string;
  filePath: string;
  contentType: string;
  presignedUrl: string;
  folder?: string | null;
  url: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PresignRequest;
    const { userId, fileNames, fileTypes = [] } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
      return NextResponse.json(
        { error: "fileNames array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (fileTypes.length && fileTypes.length !== fileNames.length) {
      return NextResponse.json(
        { error: "fileTypes array must match fileNames length" },
        { status: 400 }
      );
    }

    const uploads: LocalUploadResponse[] = fileNames.map((fileName, index) => {
      const contentType = fileTypes[index] || "application/octet-stream";
      const entry = registerLocalUpload(fileName, contentType);

      return {
        fileName: entry.fileName,
        filePath: entry.publicUrl,
        contentType: entry.contentType,
        presignedUrl: `/api/uploads/local/${entry.uploadId}`,
        folder: entry.folder,
        url: entry.publicUrl
      };
    });

    return NextResponse.json({ success: true, uploads });
  } catch (error) {
    console.error("Error in local presign route:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
