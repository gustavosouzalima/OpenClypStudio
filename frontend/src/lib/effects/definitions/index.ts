import { hasEffect, registerEffect } from "../registry";
import { blurEffectDefinition } from "./blur";
import { brightnessEffectDefinition } from "./brightness";
import { chromaticShiftEffectDefinition } from "./chromatic-shift";
import { contrastEffectDefinition } from "./contrast";
import { duotoneEffectDefinition } from "./duotone";
import { grayscaleEffectDefinition } from "./grayscale";
import { grainEffectDefinition } from "./grain";
import { hueShiftEffectDefinition } from "./hue-shift";
import { invertEffectDefinition } from "./invert";
import { pixelateEffectDefinition } from "./pixelate";
import { saturationEffectDefinition } from "./saturation";
import { sharpenEffectDefinition } from "./sharpen";
import { sepiaEffectDefinition } from "./sepia";
import { temperatureEffectDefinition } from "./temperature";
import { thresholdEffectDefinition } from "./threshold";
import { vignetteEffectDefinition } from "./vignette";

const defaultEffects = [
	blurEffectDefinition,
	brightnessEffectDefinition,
	contrastEffectDefinition,
	saturationEffectDefinition,
	grayscaleEffectDefinition,
	sepiaEffectDefinition,
	vignetteEffectDefinition,
	invertEffectDefinition,
	hueShiftEffectDefinition,
	pixelateEffectDefinition,
	grainEffectDefinition,
	temperatureEffectDefinition,
	thresholdEffectDefinition,
	duotoneEffectDefinition,
	sharpenEffectDefinition,
	chromaticShiftEffectDefinition,
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (hasEffect({ effectType: definition.type })) {
			continue;
		}
		registerEffect({ definition });
	}
}
