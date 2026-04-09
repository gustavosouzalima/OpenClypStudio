"use client";

import { useEffect, useRef, useState } from "react";
import { PanelView } from "./base-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/hooks/use-editor";
import { useElementSelection } from "@/hooks/timeline/element/use-element-selection";
import type { TimelineElement } from "@/types/timeline";
import { getAllTransitions, registerDefaultTransitions } from "@/lib/transitions";
import type { TransitionDefinition } from "@/types/transitions";

type TransitionApplyMode = "in" | "out" | "crossfade";

const TRANSITION_DURATION_PRESETS = [200, 350, 500, 800] as const;

function isTransitionTargetElement(
	element: TimelineElement,
): element is Extract<TimelineElement, { type: "video" | "image" }> {
	return element.type === "video" || element.type === "image";
}

export function TransitionsView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const [transitions, setTransitions] = useState<TransitionDefinition[]>([]);
	const [mode, setMode] = useState<TransitionApplyMode>("crossfade");
	const [durationMs, setDurationMs] = useState<number>(350);

	useEffect(() => {
		registerDefaultTransitions();
		setTransitions(getAllTransitions());
	}, []);

	const resolvedSelectedVisuals = editor.timeline
		.getElementsWithTracks({ elements: selectedElements })
		.flatMap(({ track, element }) =>
			isTransitionTargetElement(element) ? [{ track, element }] : [],
		);

	return (
		<PanelView title="Transitions">
			<div className="space-y-3 pb-3">
				<div className="rounded-sm border border-dashed p-3 text-xs text-muted-foreground">
					Transitions apply only to video and image clips. Use `Crossfade` only when the previous clip is adjacent on the same track.
				</div>
				<div className="flex flex-wrap gap-2">
					{(["crossfade", "in", "out"] as const).map((item) => (
						<Button
							key={item}
							type="button"
							size="sm"
							variant={mode === item ? "secondary" : "outline"}
							className="h-7 text-xs"
							onClick={() => setMode(item)}
						>
							{item === "crossfade"
								? "Crossfade"
								: item === "in"
									? "In"
									: "Out"}
						</Button>
					))}
				</div>
				<div className="flex flex-wrap gap-2">
					{TRANSITION_DURATION_PRESETS.map((preset) => (
						<Button
							key={preset}
							type="button"
							size="sm"
							variant={durationMs === preset ? "secondary" : "outline"}
							className="h-7 text-xs"
							onClick={() => setDurationMs(preset)}
						>
							{preset} ms
						</Button>
					))}
				</div>
				<div
					className="grid gap-2"
					style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
				>
					{transitions.map((transition) => (
						<TransitionCard
							key={transition.type}
							transition={transition}
							onApply={() =>
								applyTransitionToSelection({
									editor,
									selectedVisuals: resolvedSelectedVisuals,
									transition,
									mode,
									requestedDurationMs: durationMs,
								})
							}
							isDisabled={resolvedSelectedVisuals.length === 0}
						/>
					))}
				</div>
			</div>
		</PanelView>
	);
}

function TransitionCard({
	transition,
	onApply,
	isDisabled,
}: {
	transition: TransitionDefinition;
	onApply: () => void;
	isDisabled: boolean;
}) {
	return (
		<div className="rounded-sm border p-2">
			<div className="overflow-hidden rounded-sm border bg-accent">
				<TransitionPreviewCanvas transitionType={transition.type} />
			</div>
			<div className="space-y-2 px-1 pt-2">
				<div className="flex items-center justify-between gap-2">
					<div className="truncate text-sm font-medium">{transition.name}</div>
					<Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase">
						{transition.category}
					</Badge>
				</div>
				<p className="line-clamp-2 text-xs text-muted-foreground">
					{transition.description}
				</p>
				<div className="flex items-center justify-between gap-2">
					<span className="text-[11px] text-muted-foreground">
						{transition.defaultDurationMs} ms
					</span>
					<Button
						size="sm"
						variant="outline"
						className="h-7 text-xs"
						onClick={onApply}
						disabled={isDisabled}
					>
						Apply
					</Button>
				</div>
			</div>
		</div>
	);
}

function applyTransitionToSelection({
	editor,
	selectedVisuals,
	transition,
	mode,
	requestedDurationMs,
}: {
	editor: ReturnType<typeof useEditor>;
	selectedVisuals: Array<{
		track: ReturnType<ReturnType<typeof useEditor>["timeline"]["getElementsWithTracks"]>[number]["track"];
		element: ReturnType<ReturnType<typeof useEditor>["timeline"]["getElementsWithTracks"]>[number]["element"];
	}>;
	transition: TransitionDefinition;
	mode: TransitionApplyMode;
	requestedDurationMs: number;
}) {
	if (selectedVisuals.length === 0) return;

	const updates: Array<{
		trackId: string;
		elementId: string;
		updates: Record<string, unknown>;
	}> = [];

	for (const { track, element } of selectedVisuals) {
		const nextDurationMs = getSafeTransitionDurationMs({
			requestedDurationMs,
			clipDurationSeconds: element.duration,
		});

		updates.push({
			trackId: track.id,
			elementId: element.id,
			updates: {
				transitionIn:
					mode === "in" || mode === "crossfade"
						? {
								type: transition.type,
								durationMs: nextDurationMs,
							}
						: undefined,
				transitionOut:
					mode === "out"
						? {
								type: transition.type,
								durationMs: nextDurationMs,
							}
						: undefined,
			},
		});

		if (mode !== "crossfade") {
			continue;
		}

		const previousVisual = [...track.elements]
			.filter(isTransitionTargetElement)
			.filter((candidate) => candidate.id !== element.id)
			.filter(
				(candidate) =>
					candidate.startTime + candidate.duration <= element.startTime + 0.001,
			)
			.sort(
				(a, b) =>
					b.startTime + b.duration - (a.startTime + a.duration),
			)[0];

		if (!previousVisual) {
			updates.pop();
			continue;
		}

		const previousEnd = previousVisual.startTime + previousVisual.duration;
		const gap = element.startTime - previousEnd;
		if (gap > 0.05) {
			updates.pop();
			continue;
		}

		const crossfadeDurationMs = getSafeTransitionDurationMs({
			requestedDurationMs: Math.min(nextDurationMs, requestedDurationMs),
			clipDurationSeconds: Math.min(previousVisual.duration, element.duration),
		});

		updates.push({
			trackId: track.id,
			elementId: previousVisual.id,
			updates: {
				transitionOut: {
					type: transition.type,
					durationMs: crossfadeDurationMs,
				},
			},
		});

		updates[updates.length - 2] = {
			...updates[updates.length - 2],
			updates: {
				...updates[updates.length - 2].updates,
				transitionIn: {
					type: transition.type,
					durationMs: crossfadeDurationMs,
				},
			},
		};
	}

	if (updates.length > 0) {
		editor.timeline.updateElements({ updates });
	}
}

function getSafeTransitionDurationMs({
	requestedDurationMs,
	clipDurationSeconds,
}: {
	requestedDurationMs: number;
	clipDurationSeconds: number;
}) {
	return Math.min(
		requestedDurationMs,
		Math.max(120, Math.floor(clipDurationSeconds * 1000 * 0.35)),
	);
}

function TransitionPreviewCanvas({
	transitionType,
}: {
	transitionType: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const width = 220;
		const height = 124;
		canvas.width = width;
		canvas.height = height;

		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = "#111827";
		ctx.fillRect(0, 0, width, height);

		const leftColor = "#2563eb";
		const rightColor = "#f97316";
		const progress = 0.52;

		if (transitionType === "fade" || transitionType === "dissolve") {
			ctx.globalAlpha = 1;
			ctx.fillStyle = leftColor;
			ctx.fillRect(0, 0, width, height);
			ctx.globalAlpha = progress;
			ctx.fillStyle = rightColor;
			ctx.fillRect(0, 0, width, height);
			ctx.globalAlpha = 1;
		} else if (transitionType === "dip-to-black") {
			ctx.fillStyle = leftColor;
			ctx.fillRect(0, 0, width, height);
			ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(progress * 1.4, 1)})`;
			ctx.fillRect(0, 0, width, height);
			ctx.fillStyle = `rgba(249, 115, 22, ${Math.max((progress - 0.45) * 2.2, 0)})`;
			ctx.fillRect(0, 0, width, height);
		} else if (transitionType === "wipe-left") {
			ctx.fillStyle = leftColor;
			ctx.fillRect(0, 0, width, height);
			ctx.fillStyle = rightColor;
			ctx.fillRect(width * (1 - progress), 0, width * progress, height);
		} else if (transitionType === "wipe-right") {
			ctx.fillStyle = leftColor;
			ctx.fillRect(0, 0, width, height);
			ctx.fillStyle = rightColor;
			ctx.fillRect(0, 0, width * progress, height);
		} else if (transitionType === "slide-left") {
			ctx.fillStyle = leftColor;
			ctx.fillRect(-width * progress, 0, width, height);
			ctx.fillStyle = rightColor;
			ctx.fillRect(width - width * progress, 0, width, height);
		} else if (transitionType === "push-right") {
			ctx.fillStyle = leftColor;
			ctx.fillRect(width * progress, 0, width, height);
			ctx.fillStyle = rightColor;
			ctx.fillRect(-width + width * progress, 0, width, height);
		} else if (transitionType === "slide-up") {
			ctx.fillStyle = leftColor;
			ctx.fillRect(0, width * 0.0, width, height);
			ctx.fillStyle = rightColor;
			ctx.fillRect(0, height - height * progress, width, height);
		} else if (transitionType === "push-up") {
			ctx.fillStyle = leftColor;
			ctx.fillRect(0, -height * progress, width, height);
			ctx.fillStyle = rightColor;
			ctx.fillRect(0, height - height * progress, width, height);
		} else if (transitionType === "zoom-push") {
			ctx.save();
			ctx.translate(width / 2, height / 2);
			ctx.scale(1 + progress * 0.15, 1 + progress * 0.15);
			ctx.translate(-width / 2, -height / 2);
			ctx.fillStyle = leftColor;
			ctx.fillRect(0, 0, width, height);
			ctx.restore();

			ctx.save();
			ctx.globalAlpha = progress;
			ctx.translate(width / 2, height / 2);
			ctx.scale(0.82 + progress * 0.18, 0.82 + progress * 0.18);
			ctx.translate(-width / 2, -height / 2);
			ctx.fillStyle = rightColor;
			ctx.fillRect(0, 0, width, height);
			ctx.restore();
			ctx.globalAlpha = 1;
		} else if (transitionType === "zoom-in") {
			ctx.fillStyle = leftColor;
			ctx.fillRect(0, 0, width, height);
			ctx.save();
			ctx.globalAlpha = progress;
			ctx.translate(width / 2, height / 2);
			ctx.scale(0.65 + progress * 0.35, 0.65 + progress * 0.35);
			ctx.translate(-width / 2, -height / 2);
			ctx.fillStyle = rightColor;
			ctx.fillRect(0, 0, width, height);
			ctx.restore();
			ctx.globalAlpha = 1;
		} else if (transitionType === "zoom-out") {
			ctx.save();
			ctx.translate(width / 2, height / 2);
			ctx.scale(1.0 + progress * 0.25, 1.0 + progress * 0.25);
			ctx.translate(-width / 2, -height / 2);
			ctx.fillStyle = leftColor;
			ctx.fillRect(0, 0, width, height);
			ctx.restore();
			ctx.globalAlpha = progress;
			ctx.fillStyle = rightColor;
			ctx.fillRect(0, 0, width, height);
			ctx.globalAlpha = 1;
		} else {
			ctx.fillStyle = leftColor;
			ctx.fillRect(0, 0, width / 2, height);
			ctx.fillStyle = rightColor;
			ctx.fillRect(width / 2, 0, width / 2, height);
		}

		ctx.strokeStyle = "rgba(255,255,255,0.14)";
		ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
	}, [transitionType]);

	return <canvas ref={canvasRef} className="block aspect-video h-auto w-full" />;
}
