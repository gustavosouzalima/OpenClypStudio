"use client";

import { useEditor } from "@/hooks/use-editor";
import { formatTimeCode } from "@/lib/time";
import { invokeAction } from "@/lib/actions";
import { EditableTimecode } from "@/components/editable-timecode";
import { Button } from "@/components/ui/button";
import { usePreviewStore } from "@/stores/preview-store";
import {
	FullScreenIcon,
	PauseIcon,
	PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { OcSocialIcon } from "@opencut/ui/icons";
import { Separator } from "@/components/ui/separator";
import {
	TooltipProvider,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { KeyboardShortcutCombo } from "@/components/ui/keyboard-shortcut-badge";

export function PreviewToolbar({
	isFullscreen,
	onToggleFullscreen,
}: {
	isFullscreen: boolean;
	onToggleFullscreen: () => void;
}) {
	const editor = useEditor();
	const isPlaying = editor.playback.getIsPlaying();
	const currentTime = editor.playback.getCurrentTime();
	const totalDuration = editor.timeline.getTotalDuration();
	const fps = editor.project.getActive().settings.fps;
	const performanceMode = usePreviewStore((state) => state.performanceMode);
	const setPerformanceMode = usePreviewStore((state) => state.setPerformanceMode);

	return (
		<div className="grid grid-cols-[1fr_auto_1fr] items-center pb-4 pt-5 px-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out">
			<div className="flex items-center">
				<EditableTimecode
					time={currentTime}
					duration={totalDuration}
					format="HH:MM:SS:FF"
					fps={fps}
					onTimeChange={({ time }) => editor.playback.seek({ time })}
					className="text-center"
				/>
				<span className="text-muted-foreground px-2 font-mono text-xs">/</span>
				<span className="text-muted-foreground font-mono text-xs">
					{formatTimeCode({
						timeInSeconds: totalDuration,
						format: "HH:MM:SS:FF",
						fps,
					})}
				</span>
			</div>

			<TooltipProvider delayDuration={300}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => invokeAction("toggle-play")}
							aria-label={isPlaying ? "Pause" : "Play"}
							className="transition-all duration-180 ease-out hover:scale-105 active:scale-95"
						>
							<HugeiconsIcon icon={isPlaying ? PauseIcon : PlayIcon} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" className="flex items-center gap-2">
						<span>{isPlaying ? "Pause" : "Play"}</span>
						{/* Keyboard shortcut hint - DS-9 */}
						<KeyboardShortcutCombo variant="compact" keys={["Space"]} />
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<div className="justify-self-end flex items-center gap-2.5">
				<div className="flex items-center gap-1" role="group" aria-label="Preview quality mode">
					{([
						["quality", "Q"],
						["balanced", "B"],
						["performance", "P"],
					] as const).map(([mode, label]) => (
						<Button
							key={mode}
							variant={performanceMode === mode ? "secondary" : "ghost"}
							size="sm"
							className="h-7 min-w-7 px-2 text-xs transition-all duration-180 ease-out hover:scale-105 active:scale-95"
							onClick={() => setPerformanceMode(mode)}
							aria-label={`Preview ${mode} mode`}
							aria-pressed={performanceMode === mode}
						>
							{label}
						</Button>
					))}
				</div>
				<Separator orientation="vertical" className="h-4" />
				<Button
					variant="secondary"
					size="sm"
					className="[&_svg]:size-auto px-1 h-7 transition-all duration-180 ease-out hover:scale-105 active:scale-95"
					onClick={onToggleFullscreen}
					aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
				>
					<OcSocialIcon size={20} />
				</Button>
			</div>
		</div>
	);
}
