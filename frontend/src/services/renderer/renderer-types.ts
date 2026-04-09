/**
 * Common renderer interface for both CanvasRenderer and PixiRenderer.
 * Used by node render methods to accept either renderer implementation.
 *
 * IMPORTANT: This type is used to allow both renderer implementations to be
 * used interchangeably in the node tree. The context property provides the
 * Canvas 2D API compatibility layer.
 */
export interface RendererLike {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  context: any;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** Optional PixiJS Container for native sprite layering above the Canvas 2D background. */
  readonly nativeStage?: any;
  /**
   * Composites a canvas source as a native PixiJS sprite instead of drawing
   * it through the Canvas 2D intermediate. Returns true when handled natively,
   * false to signal that the caller should fall back to Canvas 2D drawImage.
   *
   * Only available when PixiJS is initialised. Falls back gracefully when absent.
   */
  addNativeSprite?(params: {
    source: HTMLCanvasElement | OffscreenCanvas;
    /** Stable pool key (e.g. mediaId) so the sprite/texture object is reused
     *  across frames even when the underlying canvas changes. */
    poolKey?: unknown;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Rotation in degrees. */
    rotation: number;
    /** Optional normalized anchor (0..1). Defaults to center for visuals. */
    anchorX?: number;
    anchorY?: number;
    /** Optional render ordering hint for PixiJS sortable children. */
    zIndex?: number;
    alpha: number;
    /** CSS composite-operation string, e.g. "source-over", "multiply". */
    blendMode: string;
    /**
     * Whether source pixels are expected to change every frame.
     * Set false for static caption/text canvases to avoid unnecessary GPU uploads.
     */
    isDynamicSource?: boolean;
  }): boolean;
  setSize(params: { width: number; height: number }): void;
  render(params: { node: any; time: number }): Promise<void>;
  renderToCanvas(params: {
    node: any;
    time: number;
    targetCanvas: HTMLCanvasElement;
  }): Promise<void>;
  dispose?(): void;
}
