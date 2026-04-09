import { PixelProjectDetailShell } from "@/features/pixel/projects/project-detail-shell";

export default async function ProjectDetailPage({
	params,
}: {
	params: Promise<{ project_id: string }>;
}) {
	const { project_id } = await params;
	return <PixelProjectDetailShell projectId={project_id} />;
}
