import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import {
  consumeRegisteredUpload,
  getRegisteredUpload
} from "@/editor_runtime/lib/local-upload-store";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await params;
  const entry = getRegisteredUpload(uploadId);

  if (!entry) {
    return NextResponse.json(
      { error: "Upload entry not found" },
      { status: 404 }
    );
  }

  const body = await request.arrayBuffer();
  await fs.writeFile(entry.diskPath, Buffer.from(body));

  consumeRegisteredUpload(uploadId);

  return NextResponse.json({ success: true, url: entry.publicUrl });
}
