import Link from "next/link";
import { RiInstagramLine, RiTwitterXLine } from "react-icons/ri";
import { FaGithub } from "react-icons/fa6";
import Image from "next/image";
import { SOCIAL_LINKS } from "@/constants/site-constants";

const FOOTER_LOGO_URL = "/logos/logo.svg";

export function Footer() {
	return (
		<footer className="bg-background border-t">
			<div className="mx-auto max-w-5xl px-8 py-10">
				<div className="mb-8">
					{/* Brand Section */}
					<div className="max-w-sm">
						<div className="mb-4 flex items-center justify-start gap-2">
							<Image
								src={FOOTER_LOGO_URL}
								alt="OpenClyp Studio"
								width={180}
								height={68}
								className="h-12 w-auto dark:invert"
							/>
						</div>
						<p className="text-muted-foreground mb-5 text-sm md:text-left">
							AI-assisted video editing, transcription and compilation in one studio.
						</p>
						<div className="flex justify-start gap-3">
							<Link
								href={SOCIAL_LINKS.github}
								className="text-muted-foreground hover:text-foreground transition-colors"
								target="_blank"
								rel="noopener noreferrer"
							>
								<FaGithub className="size-5" />
							</Link>
							<Link
								href={SOCIAL_LINKS.x}
								className="text-muted-foreground hover:text-foreground transition-colors"
								target="_blank"
								rel="noopener noreferrer"
							>
								<RiTwitterXLine className="size-5" />
							</Link>
							<Link
								href={SOCIAL_LINKS.instagram}
								className="text-muted-foreground hover:text-foreground transition-colors"
								target="_blank"
								rel="noopener noreferrer"
							>
								<RiInstagramLine className="size-5" />
							</Link>
						</div>
					</div>
				</div>

				{/* Bottom Section */}
				<div className="flex flex-col items-start justify-between gap-4 pt-2 md:flex-row">
					<div className="text-muted-foreground flex items-center gap-4 text-sm">
						<span>
							© {new Date().getFullYear()} OpenClyp Studio, All Rights Reserved
						</span>
					</div>
				</div>
			</div>
		</footer>
	);
}
