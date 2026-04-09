"use client";

import * as React from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { KeyboardShortcutCombo } from "@/components/ui/keyboard-shortcut-badge";
import { cn } from "@/utils/ui";

interface TooltipWithShortcutProps {
	children: React.ReactNode;
	content: string;
	shortcut?: string[] | string;
	sideOffset?: number;
	align?: "start" | "center" | "end";
	side?: "top" | "right" | "bottom" | "left";
	className?: string;
}

export function TooltipWithShortcut({
	children,
	content,
	shortcut,
	sideOffset = 4,
	align = "center",
	side = "top",
	className,
}: TooltipWithShortcutProps) {
	// Format shortcut: "ctrl+c" -> ["Ctrl", "C"]
	const formatShortcut = (key: string): string[] => {
		return key
			.split("+")
			.map((k) =>
				k
					.replace("ctrl", "Ctrl")
					.replace("shift", "Shift")
					.replace("alt", "Alt")
					.replace("meta", "Cmd")
					.replace("space", "␣")
					.toUpperCase(),
			);
	};

	const shortcutKeys = shortcut
		? Array.isArray(shortcut)
			? shortcut.map(formatShortcut)
			: [formatShortcut(shortcut)]
		: [];

	return (
		<TooltipProvider delayDuration={300}>
			<Tooltip>
				<TooltipTrigger asChild>{children}</TooltipTrigger>
				<TooltipContent
					sideOffset={sideOffset}
					align={align}
					side={side}
					className={cn("flex flex-col gap-1", className)}
				>
					<span className="text-sm">{content}</span>
					{shortcutKeys.length > 0 && (
						<div className="flex flex-wrap items-center gap-1 mt-0.5">
							{shortcutKeys.map((keys, index) => (
								<React.Fragment key={index}>
									<KeyboardShortcutCombo
										variant="compact"
										keys={keys}
									/>
									{index < shortcutKeys.length - 1 && (
										<span className="text-[10px] text-muted-foreground/50 mx-0.5">
											or
										</span>
									)}
								</React.Fragment>
							))}
						</div>
					)}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
