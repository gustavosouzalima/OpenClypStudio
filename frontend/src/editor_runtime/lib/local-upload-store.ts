import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const uploadsRoot = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

interface LocalUploadEntry {
  uploadId: string;
  fileName: string;
  diskPath: string;
  publicUrl: string;
  contentType: string;
  folder: string | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __localUploadRegistry: Map<string, LocalUploadEntry> | undefined;
}

const registry =
  globalThis.__localUploadRegistry ?? new Map<string, LocalUploadEntry>();

if (!globalThis.__localUploadRegistry) {
  globalThis.__localUploadRegistry = registry;
}

function sanitizeFileName(name: string) {
  const base = path.basename(name);
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized || "uploaded-file";
}

export function registerLocalUpload(
  fileName: string,
  contentType: string
): LocalUploadEntry {
  const uploadId = randomUUID();
  const sanitizedFileName = sanitizeFileName(fileName);
  const diskFileName = `${uploadId}-${sanitizedFileName}`;
  const diskPath = path.join(uploadsRoot, diskFileName);
  const publicUrl = `/uploads/${diskFileName}`;

  const entry: LocalUploadEntry = {
    uploadId,
    fileName,
    diskPath,
    publicUrl,
    contentType: contentType || "application/octet-stream",
    folder: "local"
  };

  registry.set(uploadId, entry);
  return entry;
}

export function getRegisteredUpload(
  uploadId: string
): LocalUploadEntry | undefined {
  return registry.get(uploadId);
}

export function consumeRegisteredUpload(
  uploadId: string
): LocalUploadEntry | undefined {
  const entry = registry.get(uploadId);
  if (entry) {
    registry.delete(uploadId);
  }
  return entry;
}

export function getUploadsRoot() {
  return uploadsRoot;
}
