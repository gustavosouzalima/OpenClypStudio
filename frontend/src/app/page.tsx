import type { Metadata } from "next";
import Link from "next/link";
import {
	ArrowRight,
	AudioWaveform,
	Clapperboard,
	FileAudio2,
	FileText,
	FolderKanban,
	Github,
	ScissorsLineDashed,
	Sparkles,
	Workflow,
} from "lucide-react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SOCIAL_LINKS } from "@/constants/site-constants";
import { cn } from "@/utils/ui";

export const metadata: Metadata = {
	title: "OpenClyp Studio",
	description:
		"Open Source AI Video Studio with native OpenCut editing, transcription workspaces, and creator-first media workflows.",
};

type LauncherItem = {
	title: string;
	description: string;
	href: string;
	icon: React.ElementType;
	accent: string;
	eyebrow: string;
};

const launcherItems: LauncherItem[] = [
	{
		title: "Projects",
		description:
			"Open active workspaces, continue AI-assisted flows, and jump back into the editor.",
		href: "/projects",
		icon: FolderKanban,
		accent:
			"border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-300 shadow-[0_0_0_1px_rgba(34,211,238,0.18)]",
		eyebrow: "WORKSPACE",
	},
	{
		title: "Manual Edit Project",
		description:
			"Start a blank editing flow or prepare a direct media import path for manual-first editing.",
		href: "/new-project?mode=manual",
		icon: Clapperboard,
		accent:
			"border-blue-500/30 bg-blue-500/[0.08] text-blue-300 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]",
		eyebrow: "MANUAL-FIRST",
	},
	{
		title: "Transcriptions",
		description:
			"Transcribe raw audio and video before turning them into projects, clips, or documents.",
		href: "/transcriptions",
		icon: AudioWaveform,
		accent:
			"border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]",
		eyebrow: "SOURCE PIPELINE",
	},
	{
		title: "Audio Recorder",
		description:
			"Capture voice locally and send it into transcription, documents, or project creation.",
		href: "/audio-recorder",
		icon: FileAudio2,
		accent:
			"border-amber-500/30 bg-amber-500/[0.08] text-amber-300 shadow-[0_0_0_1px_rgba(245,158,11,0.18)]",
		eyebrow: "CAPTURE",
	},
	{
		title: "Documents",
		description:
			"Create AI-backed briefs, scripts, PRDs, and backlog docs from transcripts and project context.",
		href: "/documents",
		icon: FileText,
		accent:
			"border-fuchsia-500/30 bg-fuchsia-500/[0.08] text-fuchsia-300 shadow-[0_0_0_1px_rgba(217,70,239,0.18)]",
		eyebrow: "AI WRITING",
	},
];

const progressItems = [
	"Native OpenCut editor integrated into the new frontend",
	"Projects, Documents, History, Transcriptions, and Audio Recorder are already live",
	"Python backend remains the source of truth for pipeline, jobs, transcription, and render",
];

const pillars = [
	{
		title: "Native OpenCut Editor",
		description:
			"Manual editing lives inside the real OpenCut timeline, not in a simplified clone.",
	},
	{
		title: "Python Media Pipeline",
		description:
			"Transcription, diarization, AI generation, compilation, narration, and export remain backend-native.",
	},
	{
		title: "Open Roadmap for Contributors",
		description:
			"Planned phases, integration rules, and upstream strategy are documented so contributors can build confidently.",
	},
];

export default function HomePage() {
	return (
		<section className="bg-background min-h-screen text-foreground">
			<Header />
			<main className="relative overflow-hidden">
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[110px]" />
					<div className="absolute top-48 right-0 h-[24rem] w-[24rem] rounded-full bg-fuchsia-500/10 blur-[120px]" />
					<div className="absolute bottom-0 left-0 h-[18rem] w-[22rem] rounded-full bg-amber-500/10 blur-[110px]" />
				</div>

				<div className="relative mx-auto flex max-w-7xl flex-col gap-20 px-6 pt-14 pb-24 md:pt-20">
					<section className="grid gap-8 lg:grid-cols-[1.35fr_0.9fr] lg:items-end">
						<div className="space-y-8">
							<div className="flex flex-wrap items-center gap-3">
								<Badge className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
									Open Source AI Video Studio
								</Badge>
								<Badge className="border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-300">
									Built on top of OpenCut
								</Badge>
							</div>

							<div className="max-w-4xl space-y-5">
								<h1 className="max-w-5xl text-5xl font-semibold tracking-[-0.05em] text-balance md:text-7xl">
									Clip faster with AI.
									<span className="block text-white/70">Edit freely with OpenCut.</span>
								</h1>
								<p className="max-w-3xl text-lg leading-8 text-muted-foreground md:text-xl">
									OpenClyp Studio combines transcription, AI-assisted clipping,
									manual timeline editing, and creator-first export workflows in
									one open source system.
								</p>
							</div>

							<div className="flex flex-wrap gap-3">
								<ModeBadge icon={Sparkles} label="AI-assisted clipping" />
								<ModeBadge icon={ScissorsLineDashed} label="Manual-first editing" />
							</div>

							<div className="flex flex-wrap gap-3">
								<Button asChild size="lg" className="min-w-44">
									<Link href="/projects">
										Start Editing
										<ArrowRight className="size-4" />
									</Link>
								</Button>
								<Button asChild variant="outline" size="lg" className="min-w-44">
									<Link href={SOCIAL_LINKS.github} target="_blank" rel="noreferrer">
										Contribute on GitHub
										<Github className="size-4" />
									</Link>
								</Button>
							</div>
						</div>

						<Card className="border-white/10 bg-white/[0.03] shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur">
							<CardContent className="space-y-6 p-6">
								<div className="space-y-2">
									<div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
										Current Shape
									</div>
									<h2 className="text-2xl font-semibold tracking-tight">
										Open source first. Product usable today.
									</h2>
								</div>

								<div className="grid gap-3">
									<SignalCard
										title="Mode A"
										value="AI-Assisted"
										copy="Transcribe, generate clips, build documents, compile, and publish."
									/>
									<SignalCard
										title="Mode B"
										value="Manual-First"
										copy="Enter a pure editing flow and shape the timeline directly in the native editor."
									/>
									<SignalCard
										title="Contributors"
										value="Roadmap Visible"
										copy="The roadmap, workspaces, and upstream strategy are documented for open collaboration."
									/>
								</div>
							</CardContent>
						</Card>
					</section>

					<section className="space-y-6">
						<div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
							<div className="space-y-2">
								<div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
									App Launcher
								</div>
								<h2 className="text-3xl font-semibold tracking-tight">
									Go Straight to the Part You Need.
								</h2>
							</div>
							<p className="max-w-2xl text-sm leading-7 text-muted-foreground">
								The root page should explain the project, but it should never hide
								the product. These entries stay one click away.
							</p>
						</div>

						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
							{launcherItems.map((item) => (
								<Link key={item.title} href={item.href} className="group">
									<Card className="h-full border-white/10 bg-white/[0.03] transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.05]">
										<CardContent className="flex h-full flex-col gap-6 p-5">
											<div
												className={cn(
													"inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em]",
													item.accent,
												)}
											>
												<item.icon className="size-3.5" />
												{item.eyebrow}
											</div>

											<div className="space-y-3">
												<h3 className="text-xl font-semibold tracking-tight">
													{item.title}
												</h3>
												<p className="text-sm leading-7 text-muted-foreground">
													{item.description}
												</p>
											</div>

											<div className="mt-auto flex items-center gap-2 text-sm font-medium text-foreground/85">
												Open Workspace
												<ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
											</div>
										</CardContent>
									</Card>
								</Link>
							))}
						</div>
					</section>

					<section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
						<Card className="border-white/10 bg-white/[0.03]">
							<CardContent className="space-y-6 p-6">
								<div className="space-y-2">
									<div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
										Why Contribute
									</div>
									<h2 className="text-3xl font-semibold tracking-tight">
										One system, clear boundaries.
									</h2>
								</div>

								<div className="grid gap-4">
									{pillars.map((pillar) => (
										<div
											key={pillar.title}
											className="rounded-2xl border border-white/10 bg-black/20 p-4"
										>
											<div className="text-base font-semibold">{pillar.title}</div>
											<p className="mt-2 text-sm leading-7 text-muted-foreground">
												{pillar.description}
											</p>
										</div>
									))}
								</div>

								<div className="flex flex-wrap gap-3">
									<Button asChild variant="outline">
										<Link href="/roadmap">Read Roadmap</Link>
									</Button>
									<Button asChild variant="outline">
										<Link href="/contributors">See Contribution Context</Link>
									</Button>
								</div>
							</CardContent>
						</Card>

						<Card className="border-white/10 bg-white/[0.03]">
							<CardContent className="space-y-6 p-6">
								<div className="space-y-2">
									<div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
										Recent Progress
									</div>
									<h2 className="text-3xl font-semibold tracking-tight">
										The studio is already alive.
									</h2>
								</div>

								<div className="space-y-3">
									{progressItems.map((item, index) => (
										<div
											key={item}
											className="flex gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
										>
											<div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-cyan-500/25 bg-cyan-500/10 text-xs font-semibold text-cyan-300">
												{index + 1}
											</div>
											<p className="text-sm leading-7 text-muted-foreground">{item}</p>
										</div>
									))}
								</div>

								<div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4">
									<div className="flex items-center gap-2 text-sm font-medium">
										<Workflow className="size-4 text-fuchsia-300" />
										OpenClyp Studio Is Not Just a Wrapper.
									</div>
									<p className="mt-2 text-sm leading-7 text-muted-foreground">
										It combines upstream editing power with a dedicated Python
										media pipeline, workspaces for raw transcription, recording,
										documents, and social-first project operations.
									</p>
								</div>
							</CardContent>
						</Card>
					</section>
				</div>
			</main>
			<Footer />
		</section>
	);
}

function ModeBadge({
	icon: Icon,
	label,
}: {
	icon: React.ElementType;
	label: string;
}) {
	return (
		<div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground/85">
			<Icon className="size-4 text-cyan-300" />
			{label}
		</div>
	);
}

function SignalCard({
	title,
	value,
	copy,
}: {
	title: string;
	value: string;
	copy: string;
}) {
	return (
		<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
			<div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
				{title}
			</div>
			<div className="mt-2 text-lg font-semibold tracking-tight">{value}</div>
			<p className="mt-2 text-sm leading-7 text-muted-foreground">{copy}</p>
		</div>
	);
}
