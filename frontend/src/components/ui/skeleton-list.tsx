import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/ui";

interface SkeletonListProps {
	count?: number;
	variant?: "grid" | "list";
	className?: string;
}

/**
 * Premium skeleton loading state for lists - DS-10
 * Shows shimmering placeholders while content loads
 */
export function SkeletonList({
	count = 6,
	variant = "list",
	className,
}: SkeletonListProps) {
	const isGrid = variant === "grid";

	return (
		<div
			className={cn(
				isGrid ? "grid gap-2" : "flex flex-col gap-2",
				isGrid && { gridTemplateColumns: "repeat(auto-fill, 160px)" },
				className,
			)}
		>
			{Array.from({ length: count }).map((_, index) => (
				<SkeletonListItem key={index} variant={variant} index={index} />
			))}
		</div>
	);
}

interface SkeletonListItemProps {
	variant: "grid" | "list";
	index: number;
}

function SkeletonListItem({ variant, index }: SkeletonListItemProps) {
	const isGrid = variant === "grid";

	// Stagger animation delay for premium feel - DS-10
	const delay = Math.min(index * 50, 200);

	if (isGrid) {
		return (
			<div
				className="flex aspect-video flex-col gap-2 rounded-md p-2 border"
				style={{
					animationDelay: `${delay}ms`,
					animationDuration: "180ms",
					animationFillMode: "both",
				} as React.CSSProperties}
			>
				<div className="flex-1 rounded-md bg-muted/50" />
				<div className="h-3 w-3/4 rounded-md bg-muted/50" />
			</div>
		);
	}

	// List variant
	return (
		<div
			className="flex items-center gap-3 rounded-md p-2 border h-12"
			style={{
				animationDelay: `${delay}ms`,
				animationDuration: "180ms",
				animationFillMode: "both",
			} as React.CSSProperties}
		>
			<div className="size-8 rounded-md bg-muted/50 shrink-0" />
			<div className="flex-1 space-y-1">
				<div className="h-3 w-3/4 max-w-[200px] rounded-md bg-muted/50" />
				<div className="h-2 w-1/2 max-w-[120px] rounded-md bg-muted/50" />
			</div>
		</div>
	);
}
