import { hasTransition, registerTransition } from "../registry";
import { dipToBlackTransitionDefinition } from "./dip-to-black";
import { dissolveTransitionDefinition } from "./dissolve";
import { fadeTransitionDefinition } from "./fade";
import { pushRightTransitionDefinition } from "./push-right";
import { pushUpTransitionDefinition } from "./push-up";
import { slideLeftTransitionDefinition } from "./slide-left";
import { slideUpTransitionDefinition } from "./slide-up";
import { wipeLeftTransitionDefinition } from "./wipe-left";
import { wipeRightTransitionDefinition } from "./wipe-right";
import { zoomInTransitionDefinition } from "./zoom-in";
import { zoomOutTransitionDefinition } from "./zoom-out";
import { zoomPushTransitionDefinition } from "./zoom-push";

const defaultTransitions = [
	fadeTransitionDefinition,
	dissolveTransitionDefinition,
	dipToBlackTransitionDefinition,
	wipeLeftTransitionDefinition,
	wipeRightTransitionDefinition,
	pushRightTransitionDefinition,
	pushUpTransitionDefinition,
	slideLeftTransitionDefinition,
	slideUpTransitionDefinition,
	zoomInTransitionDefinition,
	zoomOutTransitionDefinition,
	zoomPushTransitionDefinition,
];

export function registerDefaultTransitions() {
	for (const definition of defaultTransitions) {
		if (hasTransition({ transitionType: definition.type })) {
			continue;
		}
		registerTransition({ definition });
	}
}
