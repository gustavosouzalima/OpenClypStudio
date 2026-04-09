import type { RendererLike } from "../renderer-types";
import { createOffscreenCanvas } from "../canvas-utils";
import { BaseNode } from "./base-node";
import type { Effect } from "@/types/effects";
import type { BlendMode } from "@/types/rendering";
import type { ClipTransition, Transform } from "@/types/timeline";
import type { ElementAnimations } from "@/types/animation";
import {
  getElementLocalTime,
  resolveOpacityAtTime,
  resolveTransformAtTime,
} from "@/lib/animation";
import { resolveEffectParamsAtTime } from "@/lib/animation/effect-param-channel";
import { TIME_EPSILON_SECONDS } from "@/constants/animation-constants";
import { getEffect } from "@/lib/effects";
import { webglEffectRenderer } from "../webgl-effect-renderer";

export interface VisualNodeParams {
  duration: number;
  timeOffset: number;
  trimStart: number;
  trimEnd: number;
  transitionIn?: ClipTransition;
  transitionOut?: ClipTransition;
  transform: Transform;
  animations?: ElementAnimations;
  opacity: number;
  blendMode?: BlendMode;
  effects?: Effect[];
}

type TransitionClip =
  | { mode: "none" }
  | { mode: "rect"; x: number; y: number; width: number; height: number };

export abstract class VisualNode<
  Params extends VisualNodeParams = VisualNodeParams,
> extends BaseNode<Params> {
  protected getSourceLocalTime({ time }: { time: number }): number {
    const transitionLeadTime =
      (this.params.transitionIn?.durationMs ?? 0) / 1000;
    return (
      time - this.params.timeOffset + this.params.trimStart + transitionLeadTime
    );
  }

  protected getAnimationLocalTime({ time }: { time: number }): number {
    return getElementLocalTime({
      timelineTime: time,
      elementStartTime: this.params.timeOffset,
      elementDuration: this.params.duration,
    });
  }

  protected isInRange({ time }: { time: number }): boolean {
    const transitionLeadTime =
      (this.params.transitionIn?.durationMs ?? 0) / 1000;
    const localTime = this.getSourceLocalTime({ time });
    return (
      time >= this.params.timeOffset - transitionLeadTime &&
      localTime >= this.params.trimStart - TIME_EPSILON_SECONDS &&
      localTime < this.params.trimStart + this.params.duration
    );
  }

  protected getTransitionOpacity({
    timelineTime,
  }: {
    timelineTime: number;
  }): number {
    let opacity = 1;

    const transitionInSeconds =
      (this.params.transitionIn?.durationMs ?? 0) / 1000;
    if (transitionInSeconds > 0) {
      const transitionStart = this.params.timeOffset - transitionInSeconds;
      const progress = (timelineTime - transitionStart) / transitionInSeconds;
      opacity *= Math.max(0, Math.min(1, progress));
    }

    const transitionOutSeconds =
      (this.params.transitionOut?.durationMs ?? 0) / 1000;
    if (transitionOutSeconds > 0) {
      const transitionStart =
        this.params.timeOffset + this.params.duration - transitionOutSeconds;
      const progress = (timelineTime - transitionStart) / transitionOutSeconds;
      opacity *= 1 - Math.max(0, Math.min(1, progress));
    }

    return opacity;
  }

  protected getTransitionProgress({
    timelineTime,
    transition,
    direction,
  }: {
    timelineTime: number;
    transition?: ClipTransition;
    direction: "in" | "out";
  }): number | null {
    if (!transition) return null;
    const durationSeconds = transition.durationMs / 1000;
    if (durationSeconds <= 0) return null;

    if (direction === "in") {
      const start = this.params.timeOffset - durationSeconds;
      return Math.max(0, Math.min(1, (timelineTime - start) / durationSeconds));
    }

    const start =
      this.params.timeOffset + this.params.duration - durationSeconds;
    return Math.max(0, Math.min(1, (timelineTime - start) / durationSeconds));
  }

  protected getTransitionVisualAdjustments({
    timelineTime,
    rendererWidth,
    rendererHeight,
    x,
    y,
    width,
    height,
  }: {
    timelineTime: number;
    rendererWidth: number;
    rendererHeight: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }): {
    offsetX: number;
    offsetY: number;
    scaleMultiplier: number;
    clip: TransitionClip;
  } {
    const adjustment = {
      offsetX: 0,
      offsetY: 0,
      scaleMultiplier: 1,
      clip: { mode: "none" } as TransitionClip,
    };

    const apply = ({
      transition,
      progress,
      direction,
    }: {
      transition?: ClipTransition;
      progress: number | null;
      direction: "in" | "out";
    }) => {
      if (!transition || progress === null) return;

      const inverse = 1 - progress;

      switch (transition.type) {
        case "slide-left":
          adjustment.offsetX +=
            direction === "in"
              ? rendererWidth * inverse
              : -rendererWidth * progress;
          break;
        case "push-right":
          adjustment.offsetX +=
            direction === "in"
              ? -rendererWidth * inverse
              : rendererWidth * progress;
          break;
        case "slide-up":
          adjustment.offsetY +=
            direction === "in"
              ? rendererHeight * inverse
              : -rendererHeight * progress;
          break;
        case "push-up":
          adjustment.offsetY +=
            direction === "in"
              ? rendererHeight * inverse
              : -rendererHeight * progress;
          break;
        case "zoom-in":
          if (direction === "in") {
            adjustment.scaleMultiplier *= 0.72 + 0.28 * progress;
          }
          break;
        case "zoom-out":
          if (direction === "out") {
            adjustment.scaleMultiplier *= 1 + 0.22 * progress;
          }
          break;
        case "zoom-push":
          adjustment.scaleMultiplier *=
            direction === "in" ? 0.84 + 0.16 * progress : 1 + 0.14 * progress;
          break;
        case "wipe-left":
          adjustment.clip =
            direction === "in"
              ? {
                  mode: "rect",
                  x: x + width * inverse,
                  y,
                  width: width * progress,
                  height,
                }
              : {
                  mode: "rect",
                  x,
                  y,
                  width: width * inverse,
                  height,
                };
          break;
        case "wipe-right":
          adjustment.clip =
            direction === "in"
              ? {
                  mode: "rect",
                  x,
                  y,
                  width: width * progress,
                  height,
                }
              : {
                  mode: "rect",
                  x: x + width * progress,
                  y,
                  width: width * inverse,
                  height,
                };
          break;
        default:
          break;
      }
    };

    apply({
      transition: this.params.transitionIn,
      progress: this.getTransitionProgress({
        timelineTime,
        transition: this.params.transitionIn,
        direction: "in",
      }),
      direction: "in",
    });
    apply({
      transition: this.params.transitionOut,
      progress: this.getTransitionProgress({
        timelineTime,
        transition: this.params.transitionOut,
        direction: "out",
      }),
      direction: "out",
    });

    return adjustment;
  }

  protected renderVisual({
    renderer,
    source,
    sourceWidth,
    sourceHeight,
    timelineTime,
    nativePoolKey,
    nativeZIndex = 5,
    fitMode = "contain",
  }: {
    renderer: RendererLike;
    source: CanvasImageSource;
    sourceWidth: number;
    sourceHeight: number;
    timelineTime: number;
    /** Stable pool key for native sprite reuse (e.g. mediaId for video nodes). */
    nativePoolKey?: unknown;
    /** Layer order for native sprite rendering. */
    nativeZIndex?: number;
    /** Fit strategy for source inside renderer bounds. */
    fitMode?: "contain" | "cover";
  }): void {
    renderer.context.save();

    const animationLocalTime = this.getAnimationLocalTime({
      time: timelineTime,
    });
    const transform = resolveTransformAtTime({
      baseTransform: this.params.transform,
      animations: this.params.animations,
      localTime: animationLocalTime,
    });
    const opacity =
      resolveOpacityAtTime({
        baseOpacity: this.params.opacity,
        animations: this.params.animations,
        localTime: animationLocalTime,
      }) * this.getTransitionOpacity({ timelineTime });
    const containScale = Math.min(
      renderer.width / sourceWidth,
      renderer.height / sourceHeight,
    );
    const coverScale = Math.max(
      renderer.width / sourceWidth,
      renderer.height / sourceHeight,
    );
    const fitScale = fitMode === "cover" ? coverScale : containScale;
    const scaledWidth = sourceWidth * fitScale * transform.scale;
    const scaledHeight = sourceHeight * fitScale * transform.scale;
    const baseX = renderer.width / 2 + transform.position.x - scaledWidth / 2;
    const baseY = renderer.height / 2 + transform.position.y - scaledHeight / 2;
    const transitionAdjustment = this.getTransitionVisualAdjustments({
      timelineTime,
      rendererWidth: renderer.width,
      rendererHeight: renderer.height,
      x: baseX,
      y: baseY,
      width: scaledWidth,
      height: scaledHeight,
    });
    const renderedWidth = scaledWidth * transitionAdjustment.scaleMultiplier;
    const renderedHeight = scaledHeight * transitionAdjustment.scaleMultiplier;
    const x =
      renderer.width / 2 +
      transform.position.x +
      transitionAdjustment.offsetX -
      renderedWidth / 2;
    const y =
      renderer.height / 2 +
      transform.position.y +
      transitionAdjustment.offsetY -
      renderedHeight / 2;

    renderer.context.globalCompositeOperation = (
      this.params.blendMode && this.params.blendMode !== "normal"
        ? this.params.blendMode
        : "source-over"
    ) as GlobalCompositeOperation;
    renderer.context.globalAlpha = opacity;

    if (transform.rotate !== 0) {
      const centerX = x + renderedWidth / 2;
      const centerY = y + renderedHeight / 2;
      renderer.context.translate(centerX, centerY);
      renderer.context.rotate((transform.rotate * Math.PI) / 180);
      renderer.context.translate(-centerX, -centerY);
    }

    if (transitionAdjustment.clip.mode === "rect") {
      renderer.context.beginPath();
      renderer.context.rect(
        transitionAdjustment.clip.x,
        transitionAdjustment.clip.y,
        transitionAdjustment.clip.width,
        transitionAdjustment.clip.height,
      );
      renderer.context.clip();
    }

    const enabledEffects =
      this.params.effects?.filter((effect) => effect.enabled) ?? [];

    if (enabledEffects.length === 0) {
      // Native sprite path: bypass drawImage to the Canvas 2D internal canvas.
      // Only viable when:
      //  • PixiJS is initialised (renderer.addNativeSprite exists)
      //  • source is a canvas (HTMLCanvasElement | OffscreenCanvas)
      //  • no clip-rect transition (clip() is Canvas 2D only)
      if (
        renderer.addNativeSprite &&
        transitionAdjustment.clip.mode === "none" &&
        (source instanceof HTMLCanvasElement ||
          (typeof OffscreenCanvas !== "undefined" &&
            source instanceof OffscreenCanvas))
      ) {
        renderer.context.restore();
        renderer.addNativeSprite({
          source: source as HTMLCanvasElement | OffscreenCanvas,
          poolKey: nativePoolKey,
          x,
          y,
          width: renderedWidth,
          height: renderedHeight,
          rotation: transform.rotate ?? 0,
          zIndex: nativeZIndex,
          alpha: opacity,
          blendMode:
            this.params.blendMode && this.params.blendMode !== "normal"
              ? this.params.blendMode
              : "source-over",
        });
        return;
      }

      renderer.context.drawImage(source, x, y, renderedWidth, renderedHeight);
      renderer.context.restore();
      return;
    }

    const elementCanvas = createOffscreenCanvas({
      width: Math.round(renderedWidth),
      height: Math.round(renderedHeight),
    });
    const elementCtx = elementCanvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!elementCtx) {
      renderer.context.drawImage(source, x, y, renderedWidth, renderedHeight);
      renderer.context.restore();
      return;
    }

    elementCtx.drawImage(source, 0, 0, renderedWidth, renderedHeight);

    let currentResult: CanvasImageSource = elementCanvas;

    for (const effect of enabledEffects) {
      const resolvedParams = resolveEffectParamsAtTime({
        effect,
        animations: this.params.animations,
        localTime: animationLocalTime,
      });
      const definition = getEffect({ effectType: effect.type });
      const passes = definition.renderer.passes.map((pass) => ({
        fragmentShader: pass.fragmentShader,
        uniforms: pass.uniforms({
          effectParams: resolvedParams,
          width: renderedWidth,
          height: renderedHeight,
        }),
      }));
      currentResult = webglEffectRenderer.applyEffect({
        source: currentResult,
        width: Math.round(renderedWidth),
        height: Math.round(renderedHeight),
        passes,
      });
    }

    renderer.context.drawImage(
      currentResult,
      x,
      y,
      renderedWidth,
      renderedHeight,
    );
    renderer.context.restore();
  }
}
