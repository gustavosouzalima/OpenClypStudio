import { PixelDocumentProjectShell } from "@/features/pixel/documents/document-project-shell";

export default async function DocumentProjectPage({
	params,
}: {
	params: Promise<{ project_id: string }>;
}) {
	const { project_id } = await params;
	return <PixelDocumentProjectShell projectId={project_id} />;
}
