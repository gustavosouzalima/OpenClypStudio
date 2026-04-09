"use client";

import { useMemo } from "react";
import { PanelView } from "./base-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/hooks/use-editor";
import { useElementSelection } from "@/hooks/timeline/element/use-element-selection";
import { buildDefaultEffectInstance } from "@/lib/effects";
import { isVisualElement } from "@/lib/timeline";
import type { Effect } from "@/types/effects";
import type { VisualElement } from "@/types/timeline";

type FilterPreset = {
	id: string;
	name: string;
	description: string;
	effects: Array<{
		type: string;
		params?: Record<string, number | string | boolean>;
	}>;
};

const FILTER_EFFECT_TYPES = new Set([
	"brightness",
	"temperature",
	"contrast",
	"saturation",
	"grayscale",
	"sepia",
	"vignette",
	"invert",
	"hue-shift",
	"pixelate",
	"grain",
	"threshold",
	"duotone",
	"sharpen",
	"chromatic-shift",
]);

const FILTER_PRESETS: FilterPreset[] = [
	{
		id: "clean-pop",
		name: "Clean Pop",
		description: "Brightens the image and adds a touch of contrast and saturation.",
		effects: [
			{ type: "brightness", params: { amount: 8 } },
			{ type: "contrast", params: { amount: 12 } },
			{ type: "saturation", params: { amount: 10 } },
		],
	},
	{
		id: "cinematic-warm",
		name: "Cinematic Warm",
		description: "Warm sepia-inspired look with a soft vignette and contrast lift.",
		effects: [
			{ type: "contrast", params: { amount: 16 } },
			{ type: "sepia", params: { amount: 28 } },
			{ type: "temperature", params: { amount: 22 } },
			{ type: "vignette", params: { intensity: 42, softness: 62 } },
			{ type: "grain", params: { amount: 10 } },
		],
	},
	{
		id: "mono-doc",
		name: "Mono Doc",
		description: "Neutral grayscale documentary look with light contrast shaping.",
		effects: [
			{ type: "grayscale", params: { amount: 100 } },
			{ type: "contrast", params: { amount: 10 } },
		],
	},
	{
		id: "retro-screen",
		name: "Retro Screen",
		description: "Stylized digital look with hue shift, grain and softer saturation.",
		effects: [
			{ type: "hue-shift", params: { angle: 18 } },
			{ type: "saturation", params: { amount: -18 } },
			{ type: "grain", params: { amount: 18 } },
		],
	},
	{
		id: "dramatic-focus",
		name: "Dramatic Focus",
		description: "Sharper tonal separation with vignette for more scene focus.",
		effects: [
			{ type: "contrast", params: { amount: 24 } },
			{ type: "brightness", params: { amount: -4 } },
			{ type: "sharpen", params: { amount: 18 } },
			{ type: "vignette", params: { intensity: 54, softness: 48 } },
		],
	},
	{
		id: "mosaic-glitch",
		name: "Mosaic Glitch",
		description: "Stylized pixelated look for cutaways, humor beats or censored inserts.",
		effects: [
			{ type: "pixelate", params: { size: 18 } },
			{ type: "contrast", params: { amount: 8 } },
		],
	},
	{
		id: "duotone-poster",
		name: "Duotone Poster",
		description: "Stylized two-color poster look for promos, title cards and punch-ins.",
		effects: [
			{ type: "duotone", params: { shadowColor: "#0f172a", highlightColor: "#fb7185", mixAmount: 78 } },
			{ type: "contrast", params: { amount: 12 } },
		],
	},
	{
		id: "cold-thriller",
		name: "Cold Thriller",
		description: "Cooler tones, stronger contrast and subtle RGB separation for tension.",
		effects: [
			{ type: "temperature", params: { amount: -34 } },
			{ type: "contrast", params: { amount: 20 } },
			{ type: "chromatic-shift", params: { amount: 2 } },
		],
	},
	{
		id: "high-threshold",
		name: "High Threshold",
		description: "Hard graphic treatment for stylized inserts, memes and freeze frames.",
		effects: [
			{ type: "threshold", params: { amount: 58 } },
			{ type: "grain", params: { amount: 14 } },
		],
	},
];

function getElementEffects(element: VisualElement) {
	return element.effects ?? [];
}

function buildPresetEffects({
	preset,
}: {
	preset: FilterPreset;
}): Effect[] {
	return preset.effects.map((definition) => {
		const instance = buildDefaultEffectInstance({ effectType: definition.type });
		return {
			...instance,
			params: {
				...instance.params,
				...(definition.params ?? {}),
			},
		};
	});
}

export function FiltersView() {
	const editor = useEditor();
	const { selectedElements } = useElementSelection();

	const selectedVisuals = useMemo(() => {
		return editor.timeline
			.getElementsWithTracks({ elements: selectedElements })
			.flatMap(({ track, element }) =>
				isVisualElement(element) ? [{ track, element }] : [],
			);
	}, [editor, selectedElements]);

	const applyPreset = ({ preset }: { preset: FilterPreset }) => {
		if (selectedVisuals.length === 0) return;

		const presetEffects = buildPresetEffects({ preset });
		editor.timeline.previewElements({
			updates: selectedVisuals.map(({ track, element }) => {
				const currentEffects = getElementEffects(element).filter(
					(effect) => !FILTER_EFFECT_TYPES.has(effect.type),
				);

				return {
					trackId: track.id,
					elementId: element.id,
					updates: {
						effects: [...currentEffects, ...presetEffects],
					},
				};
			}),
		});
		editor.timeline.commitPreview();
	};

	const clearFilters = () => {
		if (selectedVisuals.length === 0) return;

		editor.timeline.previewElements({
			updates: selectedVisuals.map(({ track, element }) => ({
				trackId: track.id,
				elementId: element.id,
				updates: {
					effects: getElementEffects(element).filter(
						(effect) => !FILTER_EFFECT_TYPES.has(effect.type),
					),
				},
			})),
		});
		editor.timeline.commitPreview();
	};

	return (
		<PanelView
			title="Filters"
			actions={
				<Button
					size="sm"
					variant="outline"
					className="h-7 text-xs"
					onClick={clearFilters}
					disabled={selectedVisuals.length === 0}
				>
					Clear
				</Button>
			}
		>
			<div className="space-y-3 pb-3">
				<div className="rounded-sm border border-dashed p-3 text-xs text-muted-foreground">
					{selectedVisuals.length > 0
						? `Applying presets to ${selectedVisuals.length} selected visual element(s).`
						: "Select a video, image, text or sticker element to apply a filter preset."}
				</div>
				<div className="grid gap-2">
					{FILTER_PRESETS.map((preset) => (
						<div key={preset.id} className="rounded-sm border p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="space-y-1">
									<div className="text-sm font-medium">{preset.name}</div>
									<p className="text-xs text-muted-foreground">
										{preset.description}
									</p>
								</div>
								<Button
									size="sm"
									className="h-7 text-xs"
									onClick={() => applyPreset({ preset })}
									disabled={selectedVisuals.length === 0}
								>
									Apply
								</Button>
							</div>
							<div className="mt-3 flex flex-wrap gap-1.5">
								{preset.effects.map((effect) => (
									<Badge key={`${preset.id}-${effect.type}`} variant="outline">
										{effect.type}
									</Badge>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</PanelView>
	);
}
