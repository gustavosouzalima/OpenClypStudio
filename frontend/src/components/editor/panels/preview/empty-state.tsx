"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { PlayCircleIcon, Image02Icon, Video01Icon, MusicNote03Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

interface PreviewEmptyStateProps {
	mediaCount?: number;
	videoCount?: number;
	imageCount?: number;
	audioCount?: number;
	className?: string;
}

export function PreviewEmptyState({
	mediaCount = 0,
	videoCount = 0,
	imageCount = 0,
	audioCount = 0,
	className,
}: PreviewEmptyStateProps) {
	const hasAnyMedia = mediaCount > 0 || videoCount > 0 || imageCount > 0 || audioCount > 0;

	if (hasAnyMedia) {
		return (
			<div className={cn(
				"flex flex-col items-center justify-center gap-4 p-6 text-center animate-in fade-in-0 zoom-in-95 duration-220 ease-out",
				className
			)}>
				<div className="flex size-16 items-center justify-center rounded-lg bg-muted/30 ring-1 ring-border/50">
					<HugeiconsIcon icon={Video01Icon} className="text-muted-foreground size-8" />
				</div>
				<div className="flex flex-col gap-2 max-w-xs">
					<p className="text-foreground text-sm font-semibold">
						{mediaCount} Media File{mediaCount !== 1 ? "s" : ""} Imported
					</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						Drag media to the timeline to start editing
					</p>
					{videoCount > 0 && (
						<p className="text-muted-foreground/70 mt-1 text-[11px]">
							{videoCount} Video, {imageCount} Image, {audioCount} Audio
						</p>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className={cn(
			"flex flex-col items-center justify-center gap-4 p-6 text-center animate-in fade-in-0 zoom-in-95 duration-220 ease-out",
			className
		)}>
			<div className="flex size-16 items-center justify-center rounded-lg bg-muted/30 ring-1 ring-border/50">
				<HugeiconsIcon icon={PlayCircleIcon} className="text-muted-foreground size-8" />
			</div>
			<div className="flex flex-col gap-2 max-w-xs">
				<p className="text-foreground text-sm font-semibold">
					Start by Adding Your First Clip
				</p>
				<p className="text-muted-foreground text-xs leading-relaxed">
					Import media from the Assets panel to begin editing
				</p>
				<p className="text-muted-foreground/70 mt-1 text-[11px]">
					Supported: Videos, Images, and Audio Files
				</p>
			</div>
		</div>
	);
}
