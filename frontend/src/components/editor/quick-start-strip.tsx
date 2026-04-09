"use client";

import { useCallback } from "react";
import { useEditor } from "@/hooks/use-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import {
	CloudUploadIcon,
	ScissorIcon,
	TransitionTopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";
import { invokeAction } from "@/lib/actions";

export function QuickStartStrip() {
	const editor = useEditor();
	const { setActiveTab } = useAssetsPanelStore();
	const mediaAssets = editor.media.getAssets();
	const activeProject = editor.project.getActiveOrNull();

	const hasMedia = mediaAssets.length > 0;
	const hasTimelineContent = editor.timeline.getTracks().some((track) => track.elements.length > 0);

	const handleImportStep = useCallback(() => {
		setActiveTab("media");
	}, [setActiveTab]);

	const handleTrimStep = useCallback(() => {
		if (!hasMedia) {
			setActiveTab("media");
			return;
		}
	}, [hasMedia, setActiveTab]);

	const handleExportStep = useCallback(() => {
	}, []);

	return (
		<div className="flex items-center justify-center gap-4 px-4 py-3">
			<div className="flex items-center gap-3">
				<QuickStartStep
					stepNumber={1}
					label="Import"
					icon={CloudUploadIcon}
					isComplete={hasMedia}
					isActive={!hasMedia}
					onClick={handleImportStep}
				/>
				<div className="text-muted-foreground/40 text-2xl">→</div>
				<QuickStartStep
					stepNumber={2}
					label="Trim & Edit"
					icon={ScissorIcon}
					isComplete={hasTimelineContent}
					isActive={hasMedia && !hasTimelineContent}
					onClick={handleTrimStep}
					disabled={!hasMedia}
				/>
				<div className="text-muted-foreground/40 text-2xl">→</div>
				<QuickStartStep
					stepNumber={3}
					label="Export"
					icon={TransitionTopIcon}
					isComplete={false}
					isActive={hasTimelineContent}
					onClick={handleExportStep}
					disabled={!hasTimelineContent || !activeProject}
				/>
			</div>
		</div>
	);
}

interface QuickStartStepProps {
	stepNumber: number;
	label: string;
	icon: typeof CloudUploadIcon;
	isComplete: boolean;
	isActive: boolean;
	onClick: () => void;
	disabled?: boolean;
}

function QuickStartStep({
	stepNumber,
	label,
	icon,
	isComplete,
	isActive,
	onClick,
	disabled,
}: QuickStartStepProps) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all duration-180 ease",
				isActive
					? "border-primary bg-primary/10 text-foreground"
					: isComplete
						? "border-border bg-muted/20 text-muted-foreground"
						: "border-border bg-background text-muted-foreground hover:border-border/60",
				disabled && "opacity-50 cursor-not-allowed",
				!disabled && !isComplete && "hover:border-border hover:bg-accent",
			)}
		>
			<div
				className={cn(
					"flex h-5 w-5 items-center justify-center rounded-[6px] text-[11px] font-medium",
					isActive
						? "bg-primary text-primary-foreground"
						: isComplete
							? "bg-muted text-muted-foreground"
							: "bg-muted/30 text-muted-foreground",
				)}
			>
				{isComplete ? "✓" : stepNumber}
			</div>
			<HugeiconsIcon icon={icon} className="size-4" />
			{label}
		</button>
	);
}
