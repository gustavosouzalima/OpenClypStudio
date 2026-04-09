import { Suspense } from "react";
import { PixelDocumentsShell } from "@/features/pixel/documents/documents-shell";

export default function DocumentsPage() {
	return (
		<Suspense>
			<PixelDocumentsShell />
		</Suspense>
	);
}
