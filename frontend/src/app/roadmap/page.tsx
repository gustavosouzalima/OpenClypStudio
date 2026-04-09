import type { Metadata } from "next";
import { BasePage } from "@/app/base-page";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/ui";

const LAST_UPDATED = "March 2026";

type StatusType = "complete" | "pending" | "default" | "info";

interface Status {
	text: string;
	type: StatusType;
}

interface RoadmapItem {
	title: string;
	description: string;
	status: Status;
}

const roadmapItems: RoadmapItem[] = [
	{
		title: "Python Backend + Transcription",
		description:
			"FastAPI server with Whisper-based transcription, FFmpeg audio pipeline, diarization, SQLite history, and local job processing. The foundation that everything runs on.",
		status: {
			text: "Completed",
			type: "complete",
		},
	},
	{
		title: "Editor Integration",
		description:
			"Embedded the OpenCut professional timeline editor as the manual editing surface. Full track management, transitions, text overlays, audio detach, blending modes, and caption presets.",
		status: {
			text: "Completed",
			type: "complete",
		},
	},
	{
		title: "React Frontend — Projects, Transcriptions, Documents",
		description:
			"Modern Next.js frontend replacing the legacy Alpine.js static interface. Projects workspace, Transcriptions workspace, Audio Recorder, History, AI Documents, and Settings — all connected to the Python backend.",
		status: {
			text: "Completed",
			type: "complete",
		},
	},
	{
		title: "AI Workflow — Script Generation and Compilation",
		description:
			"AI-assisted script generation from transcriptions, multi-provider support (LM Studio, Ollama, OpenAI, Gemini), video compilation pipeline, and YouTube publishing package.",
		status: {
			text: "Completed",
			type: "complete",
		},
	},
	{
		title: "Studio Branding and Surface Coherence",
		description:
			"Consolidating OpenClyp Studio as a unified product across all public surfaces. Consistent English interface, clean navigation, and reduced upstream noise.",
		status: {
			text: "In Progress",
			type: "pending",
		},
	},
	{
		title: "Clipping Pipeline — Precision and Social-First Export",
		description:
			"Smarter clip selection scoring, word-level highlight sync, short-form presets (vertical canvas, captions), multi-clip export variations, and tighter editor↔AI diff visibility.",
		status: {
			text: "Not Started",
			type: "default",
		},
	},
];

export const metadata: Metadata = {
	title: "Roadmap - OpenClyp Studio",
	description:
		"See what's coming next for OpenClyp Studio — AI-assisted video editing, transcription and compilation.",
	openGraph: {
		title: "OpenClyp Studio Roadmap",
		description:
			"See what's coming next for OpenClyp Studio — AI-assisted video editing, transcription and compilation.",
		type: "website",
	},
};

export default function RoadmapPage() {
	return (
		<BasePage
			title="Roadmap"
			description={`What's coming next for OpenClyp Studio (last updated: ${LAST_UPDATED})`}
		>
			<div className="mx-auto flex max-w-4xl flex-col gap-16">
				<div className="flex flex-col gap-6">
					{roadmapItems.map((item, index) => (
						<RoadmapItem key={item.title} item={item} index={index} />
					))}
				</div>
			</div>
		</BasePage>
	);
}

function RoadmapItem({ item, index }: { item: RoadmapItem; index: number }) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-medium">
				<span className="leading-normal select-none">{index + 1}</span>
				<h3>{item.title}</h3>
				<StatusBadge status={item.status} className="ml-1" />
			</div>
			<div className="text-foreground/70 leading-relaxed">
				{item.description}
			</div>
		</div>
	);
}

function StatusBadge({
	status,
	className,
}: {
	status: Status;
	className?: string;
}) {
	return (
		<Badge
			className={cn("shadow-none", className, {
				"bg-green-500! text-white": status.type === "complete",
				"bg-yellow-500! text-white": status.type === "pending",
				"bg-blue-500! text-white": status.type === "info",
				"bg-foreground/10! text-accent-foreground": status.type === "default",
			})}
		>
			{status.text}
		</Badge>
	);
}
