import type { Metadata } from "next";
import Link from "next/link";
import { BasePage } from "../base-page";
import { Button } from "@/components/ui/button";
import { SOCIAL_LINKS } from "@/constants/site-constants";

export const metadata: Metadata = {
	title: "Contributors - OpenClyp Studio",
	description:
		"OpenClyp Studio is built on top of OpenCut, an open-source video editor. Learn about the people who make the upstream editor possible.",
};

export default function ContributorsPage() {
	return (
		<BasePage
			title="Contributors"
			description="OpenClyp Studio is built on top of OpenCut."
		>
			<div className="mx-auto max-w-2xl space-y-8 text-center">
				<div className="space-y-4 text-muted-foreground leading-relaxed">
					<p>
						The professional timeline editor embedded in OpenClyp Studio is{" "}
						<Link
							href={SOCIAL_LINKS.github}
							target="_blank"
							rel="noopener noreferrer"
							className="text-foreground underline underline-offset-4"
						>
							OpenCut
						</Link>
						, an open-source video editor built and maintained by its community of contributors.
					</p>
					<p>
						The Python backend — transcription pipeline, AI providers, compilation,
						and the Pixel workspace — is developed independently as the
						OpenClyp Studio layer on top of that editor.
					</p>
				</div>

				<div className="flex justify-center gap-3">
					<Button asChild variant="outline">
						<Link
							href={SOCIAL_LINKS.github}
							target="_blank"
							rel="noopener noreferrer"
						>
							OpenCut on GitHub
						</Link>
					</Button>
					<Button asChild>
						<Link href="/projects">Open Studio</Link>
					</Button>
				</div>
			</div>
		</BasePage>
	);
}
