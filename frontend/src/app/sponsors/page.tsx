import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BasePage } from "@/app/base-page";
import { Card, CardContent } from "@/components/ui/card";
import { SPONSORS, SOCIAL_LINKS, type Sponsor } from "@/constants/site-constants";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

export const metadata: Metadata = {
	title: "Sponsors - OpenClyp Studio",
	description:
		"OpenClyp Studio is built on top of OpenCut. These sponsors support the upstream OpenCut editor.",
};

export default function SponsorsPage() {
	return (
		<BasePage
			title="Sponsors"
			description={
				<>
					OpenClyp Studio is built on top of{" "}
					<Link
						href={SOCIAL_LINKS.github}
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-4"
					>
						OpenCut
					</Link>
					. The organizations below sponsor the upstream OpenCut editor.
				</>
			}
		>
			<SponsorsGrid />
		</BasePage>
	);
}

function SponsorsGrid() {
	return (
		<div className="grid gap-6 sm:grid-cols-2">
			{SPONSORS.map((sponsor) => (
				<SponsorCard key={sponsor.name} sponsor={sponsor} />
			))}
		</div>
	);
}

function SponsorCard({ sponsor }: { sponsor: Sponsor }) {
	return (
		<Link
			href={sponsor.url}
			target="_blank"
			rel="noopener noreferrer"
			className="size-full"
		>
			<Card className="h-full">
				<CardContent className="flex h-full flex-col justify-center gap-8 p-8">
					<Image
						src={sponsor.logo}
						alt={`${sponsor.name} logo`}
						width={50}
						height={50}
						className={cn(
							"object-contain",
							sponsor.invertOnDark && "invert-0 dark:invert",
						)}
					/>
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-2">
							<h3 className="text-xl font-semibold group-hover:underline">
								{sponsor.name}
							</h3>
							<HugeiconsIcon
								icon={LinkSquare02Icon}
								className="text-muted-foreground size-4"
							/>
						</div>
						<p className="text-muted-foreground">{sponsor.description}</p>
					</div>
				</CardContent>
			</Card>
		</Link>
	);
}
