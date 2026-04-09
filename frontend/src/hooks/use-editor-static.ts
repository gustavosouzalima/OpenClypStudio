import { useMemo } from "react";
import { EditorCore } from "@/core";

/**
 * Returns the singleton editor instance without subscribing React to editor
 * store updates. Use this in high-frequency surfaces (preview/render loops)
 * where updates are driven by refs/RAF rather than React re-render cycles.
 */
export function useEditorStatic(): EditorCore {
	return useMemo(() => EditorCore.getInstance(), []);
}

