"use client";

import { useEffect, useState } from "react";
import { cn } from "@/utils/ui";
import { Check } from "lucide-react";

interface SuccessCelebrationProps {
	show?: boolean;
	onComplete?: () => void;
	message?: string;
	size?: "sm" | "md" | "lg";
}

/**
 * Success celebration with confetti and checkmark animation - DS-11
 * Triggers on mount when show=true
 */
export function SuccessCelebration({
	show = true,
	onComplete,
	message,
	size = "md",
}: SuccessCelebrationProps) {
	const [phase, setPhase] = useState<"idle" | "checking" | "confetti" | "done">("idle");
	const [isVisible, setIsVisible] = useState(show);

	useEffect(() => {
		if (!show) {
			setIsVisible(false);
			setPhase("idle");
			return;
		}

		setIsVisible(true);
		setPhase("checking");

		// Phase 1: Checkmark animation (300ms)
		const checkTimer = setTimeout(() => {
			setPhase("confetti");
		}, 300);

		// Phase 2: Confetti burst (800ms)
		const confettiTimer = setTimeout(() => {
			setPhase("done");
			onComplete?.();
		}, 1100);

		return () => {
			clearTimeout(checkTimer);
			clearTimeout(confettiTimer);
		};
	}, [show, onComplete]);

	if (!isVisible) return null;

	const sizeStyles = {
		sm: { container: "size-12", icon: "size-5", text: "text-sm" },
		md: { container: "size-16", icon: "size-6", text: "text-base" },
		lg: { container: "size-20", icon: "size-8", text: "text-lg" },
	};

	const styles = sizeStyles[size];

	return (
		<div className="flex flex-col items-center justify-center gap-3">
			{/* Success checkmark with animation */}
			<div
				className={cn(
					"relative flex items-center justify-center rounded-full bg-constructive text-constructive-foreground shadow-lg",
					styles.container,
					// Checkmark scale animation - DS-11
					"animate-[scale-in-bounce_0.4s_ease-out_forwards]",
				)}
			>
				<Check className={cn("shrink-0", styles.icon)} />
				{/* Ripple effect */}
				<div className="absolute inset-0 rounded-full border-2 border-constructive animate-[ripple_0.6s_ease-out]" />
			</div>

			{/* Confetti particles - DS-11 */}
			{phase === "confetti" || phase === "done" ? (
				<div className="relative pointer-events-none">
					<ConfettiParticles />
				</div>
			) : null}

			{/* Optional message */}
			{message && phase !== "idle" && (
				<p
					className={cn(
						"text-foreground font-medium",
						styles.text,
						"animate-[fade-up_0.3s_ease-out_0.2s_both]",
					)}
				>
					{message}
				</p>
			)}
		</div>
	);
}

/**
 * Confetti particles using pure CSS - DS-11
 */
function ConfettiParticles() {
	return (
		<div className="absolute inset-0 flex items-center justify-center">
			{Array.from({ length: 12 }).map((_, i) => {
				const angle = (i * 30) * (Math.PI / 180);
				const distance = 60 + Math.random() * 20;
				const x = Math.cos(angle) * distance;
				const y = Math.sin(angle) * distance;
				const color = [
					"bg-constructive",
					"bg-primary",
					"bg-yellow-400",
					"bg-blue-400",
					"bg-purple-400",
					"bg-pink-400",
				][i % 6];

				return (
					<div
						key={i}
						className={cn(
							"absolute w-2 h-2 rounded-sm",
							color,
							// Confetti explode animation - DS-11
							"animate-[confetti-explode_0.6s_ease-out_forwards]",
						)}
						style={
							{
								"--confetti-x": `${x}px`,
								"--confetti-y": `${y}px`,
								"--confetti-rotation": `${Math.random() * 360}deg`,
								animationDelay: `${Math.random() * 0.1}s`,
							} as React.CSSProperties
						}
					/>
				);
			})}
		</div>
	);
}
