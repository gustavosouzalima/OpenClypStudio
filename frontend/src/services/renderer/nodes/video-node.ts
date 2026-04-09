import type { RendererLike } from "../renderer-types";
import { VisualNode, type VisualNodeParams } from "./visual-node";
import { videoCache } from "@/services/video-cache/service";
import {
  getElementLocalTime,
  resolveOpacityAtTime,
  resolveTransformAtTime,
} from "@/lib/animation";

/**
 * localStorage key for per-user override.
 * Set to "false" to disable WebCodecs; "true" to force-enable regardless of env.
 */
const WEBCODECS_STORAGE_KEY = "pixel.webcodecs.enabled";

/**
 * WebCodecs is the default path when the browser supports it.
 * Opt-OUT by setting NEXT_PUBLIC_WEBCODECS_ENABLED=false (env),
 * window.WEBCODECS_ENABLED=false (runtime), or localStorage key to "false".
 */
function isWebCodecsEnabled(): boolean {
  if (typeof window === "undefined") return false; // SSR: always fall back

  const runtimeOverride = (
    window as Window & { WEBCODECS_ENABLED?: boolean | string }
  ).WEBCODECS_ENABLED;

  if (runtimeOverride === false || runtimeOverride === "false") return false;
  if (runtimeOverride === true  || runtimeOverride === "true")  return true;

  try {
    const persisted = window.localStorage.getItem(WEBCODECS_STORAGE_KEY);
    if (persisted === "false") return false;
    if (persisted === "true")  return true;
  } catch {
    // Private-mode / storage access error — keep default.
  }

  // Default: enabled unless env var is explicitly "false".
  return process.env.NEXT_PUBLIC_WEBCODECS_ENABLED !== "false";
}

function supportsWebCodecs(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as Window & { VideoDecoder?: unknown }).VideoDecoder !==
      "undefined" &&
    typeof HTMLVideoElement !== "undefined" &&
    "requestVideoFrameCallback" in HTMLVideoElement.prototype
  );
}

export interface VideoNodeParams extends VisualNodeParams {
  url: string;
  file: File;
  mediaId: string;
}

export class VideoNode extends VisualNode<VideoNodeParams> {
  async render({ renderer, time }: { renderer: RendererLike; time: number }) {
    await super.render({ renderer, time });

    if (!this.isInRange({ time })) {
      return;
    }

    const anyRenderer = renderer as RendererLike & {
      addNativeVideoSprite?: (params: {
        videoElement: HTMLVideoElement;
        poolKey?: unknown;
        x: number;
        y: number;
        width: number;
        height: number;
        rotation: number;
        zIndex?: number;
        anchorX?: number;
        anchorY?: number;
        alpha: number;
        blendMode: string;
      }) => boolean;
    };

    if (
      typeof document !== "undefined" &&
      isWebCodecsEnabled() &&
      supportsWebCodecs() &&
      anyRenderer.addNativeVideoSprite &&
      (!this.params.effects || this.params.effects.length === 0)
    ) {
      const syncVideo = document.getElementById("preview-sync-video") as HTMLVideoElement | null;
      const syncMediaId = syncVideo?.dataset.mediaId;
      const isMatchingMedia = syncMediaId === this.params.mediaId;
      if (syncVideo && syncVideo.readyState >= 2 && isMatchingMedia) {
        const animationLocalTime = getElementLocalTime({
          timelineTime: time,
          elementStartTime: this.params.timeOffset,
          elementDuration: this.params.duration,
        });
        const transform = resolveTransformAtTime({
          baseTransform: this.params.transform,
          animations: this.params.animations,
          localTime: animationLocalTime,
        });
        const normalizedScale =
          Number.isFinite(transform.scale) && transform.scale > 0
            ? transform.scale
            : 1;
        const opacity =
          resolveOpacityAtTime({
            baseOpacity: this.params.opacity,
            animations: this.params.animations,
            localTime: animationLocalTime,
          }) * this.getTransitionOpacity({ timelineTime: time });

        const sourceWidth = Math.max(1, syncVideo.videoWidth || renderer.width);
        const sourceHeight = Math.max(1, syncVideo.videoHeight || renderer.height);
        const containScale = Math.min(
          renderer.width / sourceWidth,
          renderer.height / sourceHeight,
        );
        const scaledWidth = sourceWidth * containScale * normalizedScale;
        const scaledHeight = sourceHeight * containScale * normalizedScale;

        const handled = anyRenderer.addNativeVideoSprite({
          videoElement: syncVideo,
          poolKey: this.params.mediaId,
          x: renderer.width / 2 + transform.position.x,
          y: renderer.height / 2 + transform.position.y,
          width: scaledWidth,
          height: scaledHeight,
          rotation: transform.rotate ?? 0,
          zIndex: 0,
          anchorX: 0.5,
          anchorY: 0.5,
          alpha: opacity,
          blendMode:
            this.params.blendMode && this.params.blendMode !== "normal"
              ? this.params.blendMode
              : "source-over",
        });
        if (handled) {
          return;
        }
      }
    }

    const videoTime = this.getSourceLocalTime({ time });
    const frame = await videoCache.getFrameAt({
      mediaId: this.params.mediaId,
      file: this.params.file,
      time: videoTime,
    });

    if (frame) {
      this.renderVisual({
        renderer,
        source: frame.canvas,
        sourceWidth: frame.canvas.width,
        sourceHeight: frame.canvas.height,
        timelineTime: time,
        // Pool key keeps the PixiJS sprite alive across frames even when the
        // decoded canvas object changes on each new video frame.
        nativePoolKey: this.params.mediaId,
        nativeZIndex: 0,
        fitMode: "contain",
      });
    }
  }
}
