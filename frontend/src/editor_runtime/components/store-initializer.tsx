"use client";
import { useEffect } from "react";
import type { Upload } from "@/editor_runtime/lib/types";

interface InitialData {
  uploads?: Upload[];
}

export function StoreInitializer() {
  // No-op, removed user store logic
  return null;
}

export function BackgroundUploadRunner() {
  return null;
}
