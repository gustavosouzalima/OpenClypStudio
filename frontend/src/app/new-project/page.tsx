import { Suspense } from "react";
import { NewProjectShell } from "@/features/pixel/projects/new-project-shell";

export default function NewProjectPage() {
	return (
		<Suspense>
			<NewProjectShell />
		</Suspense>
	);
}
