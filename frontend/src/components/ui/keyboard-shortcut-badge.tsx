import { cn } from "@/utils/ui";

interface KeyboardShortcutBadgeProps {
	children: React.ReactNode;
	className?: string;
	variant?: "default" | "compact";
}

export function KeyboardShortcutBadge({
	children,
	className,
	variant = "default",
}: KeyboardShortcutBadgeProps) {
	return (
		<kbd
			className={cn(
				"font-sans",
				// Base styles
				"inline-flex items-center justify-center",
				"rounded border shadow-sm",
				"text-[10px] sm:text-[11px]",
				// Variant styles
				variant === "default"
					? "h-5 min-w-5 px-1.5 text-foreground/80 bg-muted/50 border-border"
					: "h-4 min-w-4 px-1 text-muted-foreground bg-transparent border-border/50",
				className,
			)}
		>
			{children}
		</kbd>
	);
}

interface KeyboardShortcutComboProps {
	keys: string[];
	className?: string;
	variant?: "default" | "compact";
}

export function KeyboardShortcutCombo({
	keys,
	className,
	variant = "default",
}: KeyboardShortcutComboProps) {
	return (
		<div className={cn("flex items-center gap-0.5", className)}>
			{keys.map((key, index) => (
				<div key={key} className="flex items-center">
					<KeyboardShortcutBadge variant={variant}>
						{key}
					</KeyboardShortcutBadge>
					{index < keys.length - 1 && (
						<span className="mx-0.5 text-[10px] text-muted-foreground/50">+</span>
					)}
				</div>
			))}
		</div>
	);
}
