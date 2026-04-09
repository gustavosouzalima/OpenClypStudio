import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export function buildEditorUrl(projectId: string) {
	return `/editor/${encodeURIComponent(projectId)}`;
}

export function navigateToEditor(router: AppRouterInstance, projectId: string) {
	const href = buildEditorUrl(projectId);
	router.push(href);
}
