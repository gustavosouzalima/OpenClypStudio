import { redirect } from "next/navigation";

export default async function EditorProjectPage({
	params,
}: {
	params: Promise<{ project_id: string }>;
}) {
	const { project_id } = await params;
	redirect(`/edit/${encodeURIComponent(project_id)}`);
}
