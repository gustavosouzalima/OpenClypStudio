import * as PIXI from "pixi.js";
import type { BaseNode } from "./nodes/base-node";
import { EditorCore } from "@/core";
import { GENERATED_CAPTION_TRACK_NAME } from "@/lib/timeline/caption-tracks";

export type PixiRendererParams = {
  width: number;
  height: number;
  fps: number;
};

type NativeEntry = {
  sprite: PIXI.Sprite;
  texture: PIXI.Texture;
  canvasSource: PIXI.CanvasSource;
  lastCanvas: HTMLCanvasElement | OffscreenCanvas;
  lastUsedFrame: number;
};

type NativeVideoEntry = {
  sprite: PIXI.Sprite;
  texture: PIXI.Texture;
  video: HTMLVideoElement;
  lastUsedFrame: number;
};

type NativeTextEntry = {
  text: PIXI.Text;
  lastUsedFrame: number;
  styleSignature: string;
};

type CaptionMeta = {
  start: number;
  end: number;
  isCaption: boolean;
};

// Maps CSS globalCompositeOperation names to PixiJS v8 blend mode strings.
const CSS_TO_PIXI_BLEND: Record<string, string> = {
  "source-over": "normal",
  "add": "add",
  "multiply": "multiply",
  "screen": "screen",
  "overlay": "overlay",
  "darken": "darken",
  "lighten": "lighten",
  "color-dodge": "color-dodge",
  "color-burn": "color-burn",
  "hard-light": "hard-light",
  "soft-light": "soft-light",
  "difference": "difference",
  "exclusion": "exclusion",
  "hue": "hue",
  "saturation": "saturation",
  "color": "color",
  "luminosity": "luminosity",
};

/**
 * GPU-accelerated renderer using PixiJS v8.
 *
 * Architecture:
 * - Internal HTMLCanvasElement (Canvas 2D): background elements (color fills, blur
 *   backgrounds) render here. Uploaded as a single PixiJS CanvasSource texture.
 * - Native sprite layer: video frames and canvas-backed images are composited as
 *   independent PixiJS sprites above the background. Each sprite has its own
 *   CanvasSource — only re-uploaded when its canvas pixels actually change.
 * - Off-DOM PixiJS Application: composites background + native sprites via WebGL
 *   onto pixiCanvas, then drawImage copies pixiCanvas to the display canvas.
 * - Falls back to direct Canvas 2D copy while PixiJS is initialising or if it fails.
 *
 * Performance contract:
 * - Background CanvasSource re-uploads only when fillRect content changes (rare).
 * - Video texture re-uploads only when a new decoded frame arrives (at video fps,
 *   not at the render fps cap) — the key saving vs the prior single-canvas approach.
 * - Text / sticker canvases that are stable are never re-uploaded.
 */
export class PixiRenderer {
  // Public API — compatible with CanvasRenderer and RendererLike
  canvas: HTMLCanvasElement | OffscreenCanvas;
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  width: number;
  height: number;
  fps: number;

  private app: PIXI.Application | null = null;
  private pixiCanvas: HTMLCanvasElement | null = null;
  private frameSprite: PIXI.Sprite | null = null;
  private frameSource: PIXI.CanvasSource | null = null;
  private _nativeContainer: PIXI.Container | null = null;
  // Pool: stable key → {sprite, texture, canvasSource, lastCanvas}
  private _nativePool = new Map<unknown, NativeEntry>();
  private _nativeVideoPool = new Map<unknown, NativeVideoEntry>();
  private _nativeTextPool = new Map<unknown, NativeTextEntry>();
  private _frameCounter = 0;
  private _currentRenderTime = 0;
  private _masterClockTime: number | null = null;
  private _masterClockVideo: HTMLVideoElement | null = null;
  private _masterClockCallbackId: number | null = null;
  private _captionMetaByElementId = new Map<string, CaptionMeta>();
  private _captionMetaDirty = true;
  private _captionMetaUnsubscribe: (() => void) | null = null;
  private readonly CAPTION_VIEWPORT_PADDING_SECONDS = 2;
  private backgroundAlpha = 0;
  private initDone = false;
  private readonly NATIVE_POOL_MAX = 128;
  private readonly NATIVE_POOL_STALE_FRAMES = 180;

  constructor({ width, height, fps }: PixiRendererParams) {
    this.width = width;
    this.height = height;
    this.fps = fps;

    const internalCanvas = this._makeInternalCanvas(width, height);
    this.canvas = internalCanvas;
    const ctx = internalCanvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error("[PixiRenderer] Failed to get 2D context");
    this.context = ctx;

    if (typeof window !== "undefined") {
      this._setupCaptionMetaSubscription();
      void this._initPixi(width, height);
    }
  }

  get nativeStage(): PIXI.Container | null {
    return this._nativeContainer;
  }

  private _setupCaptionMetaSubscription(): void {
    try {
      const editor = EditorCore.getInstance();
      this._captionMetaUnsubscribe = editor.timeline.subscribe(() => {
        this._captionMetaDirty = true;
      });
    } catch {
      // Editor may not be ready at construction time in some bootstrap paths.
    }
  }

  private _makeInternalCanvas(width: number, height: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }

  private async _initPixi(width: number, height: number): Promise<void> {
    try {
      const pixiCanvas = document.createElement("canvas");
      pixiCanvas.width = width;
      pixiCanvas.height = height;

      const app = new PIXI.Application();
      await app.init({
        canvas: pixiCanvas,
        width,
        height,
        backgroundColor: 0x00000000,
        backgroundAlpha: 0,
        antialias: false,
        autoDensity: true,
        autoStart: false,
      });

      this._nativeContainer = new PIXI.Container();
      this._nativeContainer.sortableChildren = true;
      app.stage.sortableChildren = true;
      app.stage.scale.set(1, 1);
      app.stage.hitArea = app.screen;
      this.pixiCanvas = pixiCanvas;
      this.app = app;
    } catch (err) {
      console.warn("[PixiRenderer] PixiJS init failed, using Canvas 2D fallback:", err);
    }
    this.initDone = true;
  }

  setSize({ width, height }: { width: number; height: number }): void {
    this.width = width;
    this.height = height;

    const internalCanvas = this._makeInternalCanvas(width, height);
    const ctx = internalCanvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (ctx) {
      this.canvas = internalCanvas;
      this.context = ctx;
    }

    if (this.app && this.pixiCanvas) {
      this.pixiCanvas.width = width;
      this.pixiCanvas.height = height;
      this.app.renderer.resize(width, height);
      this.app.stage.scale.set(1, 1);
      this.app.stage.hitArea = this.app.screen;
      this.frameSprite = null;
      this.frameSource = null;
    }
  }

  async render({ node, time }: { node: BaseNode; time: number }): Promise<void> {
    this._clearInternal();
    await node.render({ renderer: this, time });
  }

  async renderToCanvas({
    node,
    time,
    targetCanvas,
  }: {
    node: BaseNode;
    time: number;
    targetCanvas: HTMLCanvasElement;
  }): Promise<void> {
    this._frameCounter += 1;
    this._currentRenderTime = this._masterClockTime ?? time;
    this._clearInternal();
    // Remove native sprites from the previous frame; pool entries are retained.
    this._nativeContainer?.removeChildren();

    await node.render({ renderer: this, time: this._currentRenderTime });
    this._pruneNativePool();
    this._pruneNativeVideoPool();
    this._pruneNativeTextPool();

    if (this.app && this.pixiCanvas) {
      this._blitViaPixi(targetCanvas);
    } else {
      this._blitDirect(targetCanvas);
    }
  }

  /**
   * Composites a canvas source as a native PixiJS sprite.
   * Returns true when handled; false signals the caller to use Canvas 2D drawImage.
   */
  addNativeSprite(params: {
    source: HTMLCanvasElement | OffscreenCanvas;
    poolKey?: unknown;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    anchorX?: number;
    anchorY?: number;
    zIndex?: number;
    alpha: number;
    blendMode: string;
    isDynamicSource?: boolean;
  }): boolean {
    if (!this.app || !this._nativeContainer) return false;
    if (!this._shouldRenderCaption({ poolKey: params.poolKey })) {
      // Mark as handled so caller does not fallback to Canvas2D draw.
      return true;
    }

    const key = params.poolKey !== undefined ? params.poolKey : params.source;
    let entry = this._nativePool.get(key);

    if (!entry) {
      // First time this key is seen: create sprite + texture + source.
      const canvasSource = new PIXI.CanvasSource({
        resource: params.source as HTMLCanvasElement,
      });
      const texture = new PIXI.Texture({ source: canvasSource });
      const sprite = new PIXI.Sprite(texture);
      entry = {
        sprite,
        texture,
        canvasSource,
        lastCanvas: params.source,
        lastUsedFrame: this._frameCounter,
      };
      this._nativePool.set(key, entry);
    } else if (entry.lastCanvas !== params.source) {
      // Canvas reference changed (new decoded video frame) — swap texture.
      // Destroy the old GPU resources, then create fresh ones for the new canvas.
      entry.texture.destroy(true); // destroys texture + its CanvasSource
      const canvasSource = new PIXI.CanvasSource({
        resource: params.source as HTMLCanvasElement,
      });
      const texture = new PIXI.Texture({ source: canvasSource });
      entry.sprite.texture = texture;
      entry.texture = texture;
      entry.canvasSource = canvasSource;
      entry.lastCanvas = params.source;
    } else {
      // Same canvas object.
      // Only re-upload when caller declares the source as dynamic.
      if (params.isDynamicSource !== false) {
        entry.canvasSource.update();
      }
    }
    entry.lastUsedFrame = this._frameCounter;

    const sprite = entry.sprite;
    const anchorX = params.anchorX ?? 0.5;
    const anchorY = params.anchorY ?? 0.5;
    sprite.anchor.set(anchorX, anchorY);
    sprite.x = params.x;
    sprite.y = params.y;
    sprite.width = params.width;
    sprite.height = params.height;
    sprite.rotation = (params.rotation * Math.PI) / 180;
    sprite.zIndex = params.zIndex ?? 0;
    sprite.alpha = params.alpha;
    sprite.blendMode = (CSS_TO_PIXI_BLEND[params.blendMode] ?? "normal") as PIXI.BLEND_MODES;

    this._nativeContainer.addChild(sprite);
    return true;
  }

  addNativeVideoSprite(params: {
    videoElement: HTMLVideoElement;
    poolKey?: unknown;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    anchorX?: number;
    anchorY?: number;
    zIndex?: number;
    alpha: number;
    blendMode: string;
  }): boolean {
    if (!this.app || !this._nativeContainer) return false;
    if (params.videoElement.readyState < 2) return false;
    this._bindMasterClock(params.videoElement);

    const key = params.poolKey !== undefined ? params.poolKey : params.videoElement;
    let entry = this._nativeVideoPool.get(key);
    if (!entry || entry.video !== params.videoElement) {
      entry?.texture.destroy(true);
      entry?.sprite.destroy(false);

      const texture = PIXI.Texture.from(
        params.videoElement as unknown as PIXI.TextureSourceLike,
        { scaleMode: "linear" } as any,
      );
      const sprite = new PIXI.Sprite(texture);
      sprite.scale.set(1, 1);
      if ("source" in texture && texture.source) {
        (texture.source as { scaleMode?: unknown }).scaleMode = "linear";
      }
      entry = {
        sprite,
        texture,
        video: params.videoElement,
        lastUsedFrame: this._frameCounter,
      };
      this._nativeVideoPool.set(key, entry);
    }

    entry.lastUsedFrame = this._frameCounter;
    entry.sprite.anchor.set(params.anchorX ?? 0.5, params.anchorY ?? 0.5);
    entry.sprite.x = params.x;
    entry.sprite.y = params.y;
    entry.sprite.width = params.width;
    entry.sprite.height = params.height;
    entry.sprite.rotation = (params.rotation * Math.PI) / 180;
    entry.sprite.zIndex = params.zIndex ?? 0;
    entry.sprite.alpha = params.alpha;
    entry.sprite.blendMode = (CSS_TO_PIXI_BLEND[params.blendMode] ?? "normal") as PIXI.BLEND_MODES;
    this._nativeContainer.addChild(entry.sprite);
    return true;
  }

  addNativeTextSprite(params: {
    poolKey?: unknown;
    text: string;
    style: {
      fontFamily: string;
      fontSize: number;
      fontWeight: string;
      fontStyle: string;
      fill: string;
      align: "left" | "center" | "right";
    };
    x: number;
    y: number;
    rotation: number;
    alpha: number;
    zIndex?: number;
    anchorX?: number;
    anchorY?: number;
    blendMode: string;
  }): boolean {
    if (!this.app || !this._nativeContainer) return false;
    if (!this._shouldRenderCaption({ poolKey: params.poolKey })) {
      return true;
    }

    const key = params.poolKey ?? `${params.text}:${params.style.fontFamily}:${params.style.fontSize}`;
    let entry = this._nativeTextPool.get(key);
    const nextStyleSignature = [
      params.text,
      params.style.fontFamily,
      params.style.fontSize,
      params.style.fontWeight,
      params.style.fontStyle,
      params.style.fill,
      params.style.align,
    ].join("|");
    if (!entry) {
      const text = new PIXI.Text(
        params.text,
        {
          fontFamily: params.style.fontFamily,
          fontSize: params.style.fontSize,
          fontWeight: params.style.fontWeight as PIXI.TextStyleFontWeight,
          fontStyle: params.style.fontStyle as PIXI.TextStyleFontStyle,
          fill: params.style.fill,
          align: params.style.align,
          stroke: { color: 0x000000, width: 0 },
          padding: 0,
        },
      );
      text.style.dropShadow = false;
      entry = {
        text,
        lastUsedFrame: this._frameCounter,
        styleSignature: nextStyleSignature,
      };
      this._nativeTextPool.set(key, entry);
    } else if (entry.styleSignature !== nextStyleSignature) {
      if (entry.text.text !== params.text) {
        entry.text.text = params.text;
      }
      if (entry.text.style.fontFamily !== params.style.fontFamily) {
        entry.text.style.fontFamily = params.style.fontFamily;
      }
      if (entry.text.style.fontSize !== params.style.fontSize) {
        entry.text.style.fontSize = params.style.fontSize;
      }
      if (entry.text.style.fontWeight !== params.style.fontWeight) {
        entry.text.style.fontWeight = params.style.fontWeight as PIXI.TextStyleFontWeight;
      }
      if (entry.text.style.fill !== params.style.fill) {
        entry.text.style.fill = params.style.fill;
      }
      if (entry.text.style.align !== params.style.align) {
        entry.text.style.align = params.style.align as PIXI.TextStyleAlign;
      }
      entry.styleSignature = nextStyleSignature;
    }

    entry.lastUsedFrame = this._frameCounter;
    entry.text.anchor.set(params.anchorX ?? 0.5, params.anchorY ?? 0.5);
    entry.text.x = params.x;
    entry.text.y = params.y;
    entry.text.rotation = (params.rotation * Math.PI) / 180;
    entry.text.alpha = params.alpha;
    entry.text.zIndex = params.zIndex ?? 20;
    entry.text.blendMode = (CSS_TO_PIXI_BLEND[params.blendMode] ?? "normal") as PIXI.BLEND_MODES;
    this._nativeContainer.addChild(entry.text);
    return true;
  }

  private _pruneNativePool(): void {
    if (this._nativePool.size === 0) return;

    const staleKeys: unknown[] = [];
    for (const [key, entry] of this._nativePool.entries()) {
      if (this._frameCounter - entry.lastUsedFrame > this.NATIVE_POOL_STALE_FRAMES) {
        staleKeys.push(key);
      }
    }

    for (const key of staleKeys) {
      const entry = this._nativePool.get(key);
      if (!entry) continue;
      entry.texture.destroy(true);
      entry.sprite.destroy(false);
      this._nativePool.delete(key);
    }

    if (this._nativePool.size <= this.NATIVE_POOL_MAX) return;

    const survivors = [...this._nativePool.entries()].sort(
      (a, b) => a[1].lastUsedFrame - b[1].lastUsedFrame,
    );
    const removeCount = this._nativePool.size - this.NATIVE_POOL_MAX;
    for (let index = 0; index < removeCount; index += 1) {
      const [key, entry] = survivors[index];
      entry.texture.destroy(true);
      entry.sprite.destroy(false);
      this._nativePool.delete(key);
    }
  }

  private _pruneNativeVideoPool(): void {
    if (this._nativeVideoPool.size === 0) return;

    for (const [key, entry] of this._nativeVideoPool.entries()) {
      if (this._frameCounter - entry.lastUsedFrame <= this.NATIVE_POOL_STALE_FRAMES) continue;
      entry.texture.destroy(true);
      entry.sprite.destroy(false);
      this._nativeVideoPool.delete(key);
    }
  }

  private _pruneNativeTextPool(): void {
    if (this._nativeTextPool.size === 0) return;

    for (const [key, entry] of this._nativeTextPool.entries()) {
      if (this._frameCounter - entry.lastUsedFrame <= this.NATIVE_POOL_STALE_FRAMES) continue;
      entry.text.destroy({ texture: true, textureSource: true });
      this._nativeTextPool.delete(key);
    }
  }

  private _clearInternal(): void {
    // Always clear first to avoid ghosting/black artifacts between frames.
    this.context.clearRect(0, 0, this.width, this.height);
    // Fill only when an opaque background is explicitly required.
    if (this.backgroundAlpha >= 1) {
      this.context.fillStyle = "#000000";
      this.context.fillRect(0, 0, this.width, this.height);
    }
  }

  private _bindMasterClock(videoElement: HTMLVideoElement): void {
    if (typeof window === "undefined") return;
    if (typeof videoElement.requestVideoFrameCallback !== "function") return;
    if (this._masterClockVideo === videoElement) return;

    if (
      this._masterClockVideo &&
      this._masterClockCallbackId !== null &&
      typeof this._masterClockVideo.cancelVideoFrameCallback === "function"
    ) {
      this._masterClockVideo.cancelVideoFrameCallback(this._masterClockCallbackId);
    }

    this._masterClockVideo = videoElement;
    this._masterClockCallbackId = null;

    const loop = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (!this._masterClockVideo) return;
      const mediaTime =
        Number.isFinite(this._masterClockVideo.currentTime) &&
        this._masterClockVideo.currentTime >= 0
          ? this._masterClockVideo.currentTime
          : metadata.mediaTime;
      this._masterClockTime = mediaTime;

      window.dispatchEvent(
        new CustomEvent("preview-master-clock", {
          detail: { mediaTime },
        }),
      );
      window.dispatchEvent(
        new CustomEvent("playback-update", {
          detail: { time: mediaTime, source: "preview-master-clock" },
        }),
      );

      if (typeof this._masterClockVideo.requestVideoFrameCallback === "function") {
        this._masterClockCallbackId = this._masterClockVideo.requestVideoFrameCallback(loop);
      }
    };

    this._masterClockCallbackId = videoElement.requestVideoFrameCallback(loop);
  }

  private _refreshCaptionMeta(): void {
    if (!this._captionMetaDirty) return;

    try {
      const editor = EditorCore.getInstance();
      const tracks = editor.timeline.getTracks();
      const next = new Map<string, CaptionMeta>();

      for (const track of tracks) {
        const isGeneratedCaptionTrack =
          track.type === "text" &&
          track.name === GENERATED_CAPTION_TRACK_NAME;
        if (!isGeneratedCaptionTrack) continue;

        for (const element of track.elements) {
          next.set(element.id, {
            start: element.startTime,
            end: element.startTime + element.duration,
            isCaption: true,
          });
        }
      }

      this._captionMetaByElementId = next;
      this._captionMetaDirty = false;
    } catch {
      // Editor may not be ready during early app startup; skip silently.
    }
  }

  private _shouldRenderCaption({ poolKey }: { poolKey?: unknown }): boolean {
    if (typeof poolKey !== "string") return true;

    this._refreshCaptionMeta();
    const meta = this._captionMetaByElementId.get(poolKey);
    if (!meta?.isCaption) return true;

    const viewportStart = this._currentRenderTime - this.CAPTION_VIEWPORT_PADDING_SECONDS;
    const viewportEnd = this._currentRenderTime + this.CAPTION_VIEWPORT_PADDING_SECONDS;
    return meta.start <= viewportEnd && meta.end >= viewportStart;
  }

  private _blitViaPixi(targetCanvas: HTMLCanvasElement): void {
    const app = this.app!;
    const pixiCanvas = this.pixiCanvas!;
    const targetWidth = targetCanvas.width;
    const targetHeight = targetCanvas.height;

    try {
      if (
        app.renderer.width !== targetWidth ||
        app.renderer.height !== targetHeight
      ) {
        app.renderer.resize(targetWidth, targetHeight);
        app.stage.scale.set(1, 1);
        app.stage.hitArea = app.screen;
      }

      if (!this.frameSprite || !this.frameSource) {
        // First frame: build background sprite + add native container above it.
        const source = new PIXI.CanvasSource({
          resource: this.canvas as HTMLCanvasElement,
        });
        const texture = new PIXI.Texture({ source });
        const sprite = new PIXI.Sprite(texture);
        sprite.width = this.width;
        sprite.height = this.height;
        app.stage.removeChildren();
        app.stage.addChild(sprite);
        if (this._nativeContainer) app.stage.addChild(this._nativeContainer);
        this.frameSprite = sprite;
        this.frameSource = source;
      } else {
        // Background canvas changed (project bg color, blur, etc.): re-upload.
        this.frameSource.update();
      }

      app.renderer.render(app.stage);

      const ctx = targetCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(pixiCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
      }
    } catch (err) {
      console.warn("[PixiRenderer] GPU blit error, using fallback:", err);
      this._blitDirect(targetCanvas);
    }
  }

  private _blitDirect(targetCanvas: HTMLCanvasElement): void {
    const ctx = targetCanvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(this.canvas, 0, 0, targetCanvas.width, targetCanvas.height);
    }
  }

  dispose(): void {
    if (this._captionMetaUnsubscribe) {
      this._captionMetaUnsubscribe();
      this._captionMetaUnsubscribe = null;
    }
    if (
      this._masterClockVideo &&
      this._masterClockCallbackId !== null &&
      typeof this._masterClockVideo.cancelVideoFrameCallback === "function"
    ) {
      this._masterClockVideo.cancelVideoFrameCallback(this._masterClockCallbackId);
    }
    this._masterClockVideo = null;
    this._masterClockCallbackId = null;
    this._masterClockTime = null;

    this._nativeContainer?.removeChildren();
    for (const entry of this._nativePool.values()) {
      entry.texture.destroy(true);
      entry.sprite.destroy(false);
    }
    this._nativePool.clear();
    for (const entry of this._nativeVideoPool.values()) {
      entry.texture.destroy(true);
      entry.sprite.destroy(false);
    }
    this._nativeVideoPool.clear();
    for (const entry of this._nativeTextPool.values()) {
      entry.text.destroy({ texture: true, textureSource: true });
    }
    this._nativeTextPool.clear();
    this._nativeContainer = null;

    this.frameSprite = null;
    this.frameSource = null;
    if (this.app) {
      this.app.destroy(false, { children: true });
      this.app = null;
    }
    this.pixiCanvas = null;
    this.initDone = false;
  }
}
