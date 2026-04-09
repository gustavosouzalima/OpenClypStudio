import { HugeiconsIcon } from "@hugeicons/react";
import { UploadIcon, PlayCircleIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/utils/ui";

interface MediaDragOverlayProps {
	isVisible: boolean;
	isProcessing?: boolean;
	progress?: number;
	onClick?: () => void;
}

export function MediaDragOverlay({
	isVisible,
	isProcessing = false,
	progress = 0,
	onClick,
}: MediaDragOverlayProps) {
	if (!isVisible) return null;

	const handleClick = ({
		event,
	}: {
		event: React.MouseEvent<HTMLButtonElement>;
	}) => {
		if (isProcessing || !onClick) return;
		event.preventDefault();
		event.stopPropagation();
		onClick();
	};

	return (
		<button
			className={cn(
				"flex size-full flex-col items-center justify-center gap-6 rounded-lg p-8 text-center transition-all duration-200 ease-out",
				// Background with subtle pulse when drag over - DS-10
				"bg-muted/20 hover:bg-muted/30",
				isProcessing && "bg-muted/10",
			)}
			type="button"
			disabled={isProcessing || !onClick}
			onClick={(event) => handleClick({ event })}
		>
			<div className="flex flex-col items-center gap-4">
				<div className={cn(
					"flex items-center justify-center",
					// Bounce animation when idle - DS-10
					!isProcessing && "animate-[bounce-subtle_2s_ease-in-out_infinite]",
				)}>
					<HugeiconsIcon icon={UploadIcon} className="text-foreground size-10" />
				</div>

				<div className="space-y-3">
					<p className="text-foreground text-sm font-medium">
						{isProcessing ? "Processing your media..." : "Start by importing your media"}
					</p>
					<p className="text-muted-foreground max-w-xs text-xs leading-relaxed">
						{isProcessing
							? "This may take a moment depending on file size"
							: "Drag and drop videos, photos, and audio files here to begin editing"}
					</p>
				</div>

				{!isProcessing && onClick && (
					<Button
						variant="outline"
						onClick={(e) => {
							e.stopPropagation();
							onClick();
						}}
						className="gap-2"
					>
						<HugeiconsIcon icon={PlayCircleIcon} className="size-4" />
						Browse files
					</Button>
				)}
			</div>

			{isProcessing && (
				<div className="w-full max-w-xs animate-stagger-in">
					<div className="flex items-center justify-between mb-2">
						<p className="text-muted-foreground text-xs">
							Processing files
						</p>
						<p className="text-muted-foreground text-xs tabular-nums">
							{progress}%
						</p>
					</div>
					{/* Use premium Progress component - DS-10 */}
					<Progress value={progress} />
				</div>
			)}
		</button>
	);
}
