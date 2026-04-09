"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/utils/ui";

const Progress = React.forwardRef<
	React.ElementRef<typeof ProgressPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
	<ProgressPrimitive.Root
		ref={ref}
		className={cn(
			"bg-muted/50 relative h-2 w-full overflow-hidden rounded-full",
			className,
		)}
		{...props}
	>
		<ProgressPrimitive.Indicator
			className={cn(
				"bg-primary h-full rounded-full",
				// Smooth transition - DS-10
				"transition-transform duration-300 ease-out",
				// Shimmer effect for active progress - DS-10
				"bg-[position:0%_0%]",
				"bg-[size:200%_100%]",
				"bg-gradient-to-r from-transparent via-white/20 to-transparent",
				"animate-[shimmer_1.5s_infinite]",
			)}
			style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
		/>
	</ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
