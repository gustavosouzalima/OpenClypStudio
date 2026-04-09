import { cn } from "@/utils/ui";

function Skeleton({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"rounded-md bg-muted",
				// Premium shimmer animation - DS-8
				"bg-gradient-to-r from-muted via-muted-foreground/10 to-muted",
				"bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]",
				// Subtle pulse as fallback
				"animate-pulse",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
