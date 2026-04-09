"use client";
import "@/editor_runtime/styles/editor-tokens.css";
import Timeline from "./timeline";
import useStore from "./store/use-store";
import Navbar from "./navbar";
import useTimelineEvents from "./hooks/use-timeline-events";
import Scene from "./scene";
import { SceneRef } from "./scene/scene.types";
import StateManager, { DESIGN_LOAD } from "@designcombo/state";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/editor_runtime/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImperativePanelHandle } from "react-resizable-panels";
import { loadFonts } from "./utils/fonts";
import { SECONDARY_FONT, SECONDARY_FONT_URL } from "./constants/constants";
import MenuList from "./menu-list";
import { ControlItemContent } from "./control-item";
import CropModal from "./crop-modal/crop-modal";
import FloatingControl from "./control-item/floating-controls/floating-control";
import { useSceneStore } from "@/editor_runtime/store/use-scene-store";
import { dispatch } from "@designcombo/events";
import MenuListHorizontal from "./menu-list-horizontal";
import { useIsLargeScreen } from "@/editor_runtime/hooks/use-media-query";
import { ITrackItem } from "@designcombo/types";
import useLayoutStore from "./store/use-layout-store";
import ControlItemHorizontal from "./control-item-horizontal";
import { design } from "./mock";
import { Separator } from "@/editor_runtime/components/ui/separator";
import {
  ACTIVE_SPLIT,
  ADD_AUDIO,
  ADD_VIDEO,
  DESIGN_RESIZE,
  HISTORY_REDO,
  HISTORY_UNDO,
  LAYER_CLONE,
  LAYER_DELETE
} from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import { PLAYER_TOGGLE_PLAY } from "./constants/events";
import { getCurrentTime } from "./utils/time";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { MenuItem } from "./menu-item";
import { cn } from "@/editor_runtime/lib/utils";

const stateManager = new StateManager({
  size: {
    width: 1080,
    height: 1920,
  },
});

const resetEditorUiState = () => {
  const layoutState = useLayoutStore.getState();
  layoutState.setShowMenuItem(false);
  layoutState.setActiveMenuItem("uploads");
  layoutState.setTrackItem(null);
  layoutState.setFloatingControl(null);
  layoutState.setTypeControlItem("");
  layoutState.setLabelControlItem("");
  useStore.setState({
    activeIds: []
  });
};

type SaveStatus = "saved" | "unsaved" | "saving" | "error";

type PixelVideo = {
  id: string;
  title?: string;
  source_url?: string;
  local_path?: string;
  status?: string;
};

type PixelProject = {
  id: string;
  name?: string;
  videos?: PixelVideo[];
  config?: {
    editor_state?: Record<string, unknown>;
  };
};

function hasPersistedEditorState(editorState: Record<string, unknown>) {
  const tracks = Array.isArray(editorState.tracks) ? editorState.tracks : [];
  const trackItemsMap =
    editorState.trackItemsMap &&
    typeof editorState.trackItemsMap === "object" &&
    !Array.isArray(editorState.trackItemsMap)
      ? (editorState.trackItemsMap as Record<string, unknown>)
      : {};
  const transitionsMap =
    editorState.transitionsMap &&
    typeof editorState.transitionsMap === "object" &&
    !Array.isArray(editorState.transitionsMap)
      ? (editorState.transitionsMap as Record<string, unknown>)
      : {};

  return (
    tracks.length > 0 ||
    Object.keys(trackItemsMap).length > 0 ||
    Object.keys(transitionsMap).length > 0
  );
}

const AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".opus",
  ".wma",
];

function isLikelyAudioSource(video: PixelVideo) {
  const source = `${video.title || ""} ${video.local_path || ""} ${video.source_url || ""}`.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => source.includes(ext));
}

const SceneContainer = ({
  sceneRef,
  playerRef,
  stateManager,
  trackItem,
  loaded,
  isLargeScreen,
}: any) => {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen({
    containerRef: previewContainerRef,
  });

  return (
    <div className="relative flex h-full w-full flex-col bg-background">
      <div
        ref={previewContainerRef}
        className="flex-1 relative overflow-hidden w-full h-full"
      >
        <div className="flex h-full flex-1">
          <div className="flex-1 relative overflow-hidden w-full h-full">
            <div className="absolute right-4 top-4 z-[120]">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={toggleFullscreen}
                className="h-9 w-9 rounded-full border-white/15 bg-black/45 text-white backdrop-blur hover:bg-black/60"
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </Button>
            </div>
            <CropModal />
            <Scene ref={sceneRef} stateManager={stateManager} />
          </div>
        </div>
      </div>

      <div className="w-full">
        {playerRef && <Timeline stateManager={stateManager} />}
      </div>

      {!isLargeScreen && !trackItem && loaded && <MenuListHorizontal />}
      {!isLargeScreen && trackItem && <ControlItemHorizontal />}
    </div>
  );
};

const Sidebar = () => {
  const { showMenuItem, activeMenuItem, setShowMenuItem } = useLayoutStore();
  const activeLabelMap: Record<string, string> = {
    uploads: "Media",
    texts: "Text",
    videos: "Videos",
    captions: "Captions",
    images: "Images",
    audios: "Audio",
    transitions: "Transitions",
    "ai-voice": "AI Voice",
    sfx: "SFX",
  };
  const activeLabel = activeLabelMap[activeMenuItem || ""] || "Editor";

  return (
    <div
      className="flex h-[calc(100vh-52px)]"
      style={{
        backgroundColor: "var(--editor-bg-deep)",
        width: showMenuItem ? 352 : 76
      }}
    >
      <div className="w-[76px] flex-none border-r border-white/10">
        <MenuList />
      </div>
      <div
        className={
          showMenuItem
            ? "w-[276px] overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            : "w-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        }
        style={{ backgroundColor: 'var(--editor-bg-elevated)' }}
      >
        <div
          className={
            showMenuItem
              ? "flex h-full min-w-0 flex-col opacity-100 translate-x-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              : "flex h-full min-w-0 flex-col opacity-0 -translate-x-4 pointer-events-none transition-all duration-220 ease-in"
          }
        >
          <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
            <span className="text-sm font-semibold tracking-[0.01em] text-slate-100">{activeLabel}</span>
            <button
              type="button"
              onClick={() => setShowMenuItem(false)}
              className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-white/14 hover:bg-white/[0.08] hover:text-white"
            >
              Hide
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <MenuItem />
          </div>
        </div>
      </div>
    </div>
  );
};

const CollapsedPanelLabel = ({
  label,
  accent = false,
  side,
}: {
  label: string;
  accent?: boolean;
  side: "left" | "right";
}) => (
  <div
    className={cn(
      "absolute inset-y-0 flex w-[28px] items-center justify-center",
      side === "left" ? "left-0 border-r border-white/10" : "right-0 border-l border-white/10"
    )}
    style={{ backgroundColor: "var(--editor-bg-base)" }}
  >
    <div
      className={cn(
        "-rotate-90 text-[10px] uppercase tracking-[0.22em] transition-colors duration-200",
        accent ? "text-[var(--editor-accent)]" : "text-[var(--editor-text-muted)]"
      )}
    >
      {label}
    </div>
  </div>
);

const SidebarToggle = ({
  collapsed,
  active,
  onToggle
}: {
  collapsed: boolean;
  active: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    className={cn(
      "absolute -right-3 top-1/2 z-20 flex h-12 w-7 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur text-slate-300 transition-all duration-[var(--editor-duration-fast)] hover:scale-[1.06] hover:text-white",
      active
        ? "border-[var(--editor-accent)] text-[var(--editor-accent)] shadow-[var(--editor-shadow-glow)]"
        : "border-[var(--editor-border)] bg-[var(--editor-bg-elevated)]/92 hover:border-[var(--editor-accent)]/40"
    )}
    aria-label={collapsed ? "Expand left sidebar" : "Collapse left sidebar"}
  >
    <span
      className={cn(
        "absolute top-2 h-1.5 w-1.5 rounded-full transition-colors duration-[var(--editor-duration-fast)]",
        active ? "bg-[var(--editor-accent)] shadow-[var(--editor-shadow-glow)]" : "bg-[var(--editor-text-muted)]"
      )}
    />
    {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
  </button>
);

const InspectorToggle = ({
  collapsed,
  active,
  onToggle
}: {
  collapsed: boolean;
  active: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    className={cn(
      "absolute -left-3 top-1/2 z-20 flex h-12 w-7 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur text-slate-300 transition-all duration-[var(--editor-duration-fast)] hover:scale-[1.06] hover:text-white",
      active
        ? "border-[var(--editor-accent)] text-[var(--editor-accent)] shadow-[var(--editor-shadow-glow)]"
        : "border-[var(--editor-border)] bg-[var(--editor-bg-elevated)]/92 hover:border-[var(--editor-accent)]/40"
    )}
    aria-label={collapsed ? "Expand inspector" : "Collapse inspector"}
  >
    <span
      className={cn(
        "absolute top-2 h-1.5 w-1.5 rounded-full transition-colors duration-[var(--editor-duration-fast)]",
        active ? "bg-[var(--editor-accent)] shadow-[var(--editor-shadow-glow)]" : "bg-[var(--editor-text-muted)]"
      )}
    />
    {collapsed ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
  </button>
);

const InspectorPanel = ({
  trackItem,
  projectName,
  setProjectName,
  size,
  fps,
  duration,
  tracks,
  backgroundColor
}: {
  trackItem: ITrackItem | null;
  projectName: string;
  setProjectName: (name: string) => void;
  size: { width: number; height: number };
  fps: number;
  duration: number;
  tracks: Array<{ id: string }>;
  backgroundColor: string;
}) => {
  const inspectorTitleMap: Record<string, string> = {
    video: "Video",
    audio: "Audio",
    text: "Text",
    caption: "Caption",
    image: "Image"
  };
  const title = trackItem?.type
    ? inspectorTitleMap[trackItem.type] || "Inspector"
    : "Project & Canvas";
  const timelineItemsCount = tracks.reduce(
    (count, track) => count + ((track as { items?: unknown[] }).items?.length || 0),
    0
  );

  const applyCanvasPreset = (width: number, height: number, name: string) => {
    dispatch(DESIGN_RESIZE, {
      payload: {
        width,
        height,
        name
      }
    });
  };

  const openLibraryPanel = (
    menuItem: "uploads" | "texts" | "captions" | "audios"
  ) => {
    const layoutState = useLayoutStore.getState();
    layoutState.setActiveMenuItem(menuItem);
    layoutState.setShowMenuItem(true);
  };

  const updateBackgroundColor = (value: string) => {
    void useStore.getState().setState({
      background: {
        type: "color",
        value
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-52px)] flex-col border-l border-white/10" style={{ backgroundColor: 'var(--editor-bg-base)' }}>
      <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
        <span className="text-sm font-medium text-slate-100">{title}</span>
        <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--editor-text-secondary)]">
          {trackItem ? "Selected" : "No Selection"}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {trackItem ? (
          <ControlItemContent mode="inspector" />
        ) : (
          <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="rounded-xl border border-[var(--editor-border)] bg-[var(--editor-bg-elevated)] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--editor-text-secondary)]">
                Project
              </div>
              <div className="mt-3">
                <Input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Untitled video"
                  variant="editor-default"
                  size="sm"
                />
              </div>
              <p className="mt-2 text-xs text-[var(--editor-text-secondary)]">
                Select a clip to edit its properties. When nothing is selected,
                this panel shows the canvas and project overview.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--editor-border)] bg-[var(--editor-bg-elevated)] p-4">
              <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[var(--editor-text-secondary)]">
                Quick Actions
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => openLibraryPanel("uploads")}
                >
                  Media
                </Button>
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => openLibraryPanel("texts")}
                >
                  Text
                </Button>
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => openLibraryPanel("captions")}
                >
                  Captions
                </Button>
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => openLibraryPanel("audios")}
                >
                  Audio
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--editor-border)] bg-[var(--editor-bg-elevated)] p-4">
              <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[var(--editor-text-secondary)]">
                Canvas
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InspectorStat
                  label="Format"
                  value={`${size.width} × ${size.height}`}
                />
                <InspectorStat
                  label="Aspect"
                  value={getAspectRatioLabel(size.width, size.height)}
                />
                <InspectorStat label="FPS" value={String(fps)} />
                <InspectorStat
                  label="Duration"
                  value={formatDuration(duration)}
                />
              </div>
              <div className="mt-4">
                <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--editor-text-secondary)]">
                  Presets
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => applyCanvasPreset(1920, 1080, "16:9")}
                  >
                    16:9
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => applyCanvasPreset(1080, 1920, "9:16")}
                  >
                    9:16
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => applyCanvasPreset(1080, 1080, "1:1")}
                  >
                    1:1
                  </Button>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--editor-text-secondary)]">
                  Background
                </div>
                <label className="flex items-center gap-3 rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                  <input
                    type="color"
                    value={normalizeColorInputValue(backgroundColor)}
                    onChange={(event) => updateBackgroundColor(event.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
                  />
                  <span className="text-sm text-slate-200">
                    {normalizeColorInputValue(backgroundColor)}
                  </span>
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--editor-border)] bg-[var(--editor-bg-elevated)] p-4">
              <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[var(--editor-text-secondary)]">
                Timeline
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InspectorStat label="Tracks" value={String(tracks.length)} />
                <InspectorStat
                  label="Clips"
                  value={String(timelineItemsCount)}
                />
                <InspectorStat
                  label="State"
                  value={tracks.length ? "Ready" : "Empty"}
                />
                <InspectorStat
                  label="Selection"
                  value="Canvas"
                />
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-white/10 bg-transparent p-4">
              <div className="text-sm font-medium text-slate-200">
                Tip
              </div>
              <p className="mt-2 text-xs text-[var(--editor-text-secondary)]">
                Use the left panel to add media, text, captions, audio and effects.
                Click any clip in the timeline to open its contextual controls here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const InspectorStat = ({
  label,
  value
}: {
  label: string;
  value: string;
}) => (
  <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--editor-text-secondary)]">
      {label}
    </div>
    <div className="mt-1 text-sm font-medium text-slate-100">{value}</div>
  </div>
);

const getAspectRatioLabel = (width: number, height: number) => {
  if (!width || !height) return "Unknown";

  const ratio = width / height;
  const presets = [
    { label: "16:9", value: 16 / 9 },
    { label: "9:16", value: 9 / 16 },
    { label: "1:1", value: 1 },
    { label: "4:3", value: 4 / 3 },
    { label: "3:4", value: 3 / 4 },
    { label: "2:1", value: 2 }
  ];

  const matched = presets.find((preset) => Math.abs(preset.value - ratio) < 0.03);
  return matched?.label || ratio.toFixed(2);
};

const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const normalizeColorInputValue = (value: string) => {
  if (!value || value === "transparent") return "#000000";
  return value.startsWith("#") ? value : "#000000";
};

const Editor = ({ tempId, id }: { tempId?: string; id?: string }) => {
  const [projectName, setProjectName] = useState<string>("Untitled video");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const { scene } = useSceneStore();
  const timelinePanelRef = useRef<ImperativePanelHandle>(null);
  const sceneRef = useRef<SceneRef>(null);
  const timeline = useStore((state) => state.timeline);
  const playerRef = useStore((state) => state.playerRef);
  const tracks = useStore((state) => state.tracks);
  const size = useStore((state) => state.size);
  const fps = useStore((state) => state.fps);
  const duration = useStore((state) => state.duration);
  const background = useStore((state) => state.background);
  const activeIds = useStore((state) => state.activeIds);
  const trackItemsMap = useStore((state) => state.trackItemsMap);
  const transitionsMap = useStore((state) => state.transitionsMap);
  const [loaded, setLoaded] = useState(false);
  const [trackItem, setTrackItem] = useState<ITrackItem | null>(null);
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isRightInspectorCollapsed, setIsRightInspectorCollapsed] = useState(false);
  const setLayoutTrackItem = useLayoutStore((state) => state.setTrackItem);
  const setFloatingControl = useLayoutStore((state) => state.setFloatingControl);
  const setLabelControlItem = useLayoutStore(
    (state) => state.setLabelControlItem
  );
  const setTypeControlItem = useLayoutStore((state) => state.setTypeControlItem);
  const showMenuItem = useLayoutStore((state) => state.showMenuItem);
  const isLargeScreen = useIsLargeScreen();
  const hydratedProjectIdsRef = useRef<Set<string>>(new Set());
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutosavedStateRef = useRef<string>("");
  const loadedEditorStateProjectIdsRef = useRef<Set<string>>(new Set());

  useTimelineEvents();

  // useEffect(() => {
  //   dispatch(DESIGN_LOAD, { payload: design });
  // }, []);

  useEffect(() => {
    loadFonts([
      {
        name: SECONDARY_FONT,
        url: SECONDARY_FONT_URL,
      },
    ]);
  }, []);

  useEffect(() => {
    const screenHeight = window.innerHeight;
    const desiredHeight = 300;
    const percentage = (desiredHeight / screenHeight) * 100;
    timelinePanelRef.current?.resize(percentage);
  }, []);

  const handleTimelineResize = () => {
    const timelineContainer = document.getElementById("timeline-container");
    if (!timelineContainer) return;

    timeline?.resize(
      {
        height: timelineContainer.clientHeight - 90,
        width: timelineContainer.clientWidth - 40,
      },
      {
        force: true,
      },
    );

    // Trigger zoom recalculation when timeline is resized
    setTimeout(() => {
      sceneRef.current?.recalculateZoom();
    }, 100);
  };

  useEffect(() => {
    const onResize = () => handleTimelineResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [timeline]);

  useEffect(() => {
    if (activeIds.length === 1) {
      const [id] = activeIds;
      const trackItem = trackItemsMap[id];
      if (trackItem) {
        setTrackItem(trackItem);
        setLayoutTrackItem(trackItem);
      } else console.log(transitionsMap[id]);
    } else {
      setTrackItem(null);
      setLayoutTrackItem(null);
    }
  }, [activeIds, trackItemsMap]);

  useEffect(() => {
    setFloatingControl("");
    setLabelControlItem("");
    setTypeControlItem("");
  }, [isLargeScreen]);

  useEffect(() => {
    if (!isLargeScreen) {
      setIsLeftSidebarCollapsed(false);
      setIsRightInspectorCollapsed(false);
    }
  }, [isLargeScreen]);

  useEffect(() => {
    setLoaded(true);
  }, []);

  useEffect(() => {
    resetEditorUiState();
    setTrackItem(null);
    setLayoutTrackItem(null);
    setSaveStatus("saved");
  }, [id, setLayoutTrackItem]);

  const buildEditorStatePayload = () => {
    const snapshot = stateManager.toJSON() as Record<string, unknown>;
    return {
      ...snapshot,
      activeIds: [],
      updatedAt: new Date().toISOString(),
    };
  };

  const saveProjectState = async ({
    immediate = false,
    payload,
    serialized,
  }: {
    immediate?: boolean;
    payload?: ReturnType<typeof buildEditorStatePayload>;
    serialized?: string;
  } = {}) => {
    if (!id) return false;
    if (!hydratedProjectIdsRef.current.has(id)) return false;

    const nextPayload = payload ?? buildEditorStatePayload();
    const nextSerialized = serialized ?? JSON.stringify(nextPayload);

    if (!immediate && nextSerialized === lastAutosavedStateRef.current) {
      setSaveStatus("saved");
      return true;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    setSaveStatus("saving");

    try {
      const response = await fetch(`/api/pixel/projects/${id}/sync-editor-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          editor_state: nextPayload,
        }),
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }

      lastAutosavedStateRef.current = nextSerialized;
      setSaveStatus("saved");
      return true;
    } catch (error) {
      console.error("[Editor] Save error:", error);
      setSaveStatus("error");
      return false;
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName.toLowerCase();
      const isTypingField =
        tag === "input" ||
        tag === "textarea" ||
        target.isContentEditable ||
        target.getAttribute("role") === "textbox";

      if (isTypingField) return;

      const primaryModifier = event.ctrlKey || event.metaKey;

      if (primaryModifier && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        dispatch(HISTORY_UNDO);
        return;
      }

      if (
        primaryModifier &&
        (
          event.key.toLowerCase() === "y" ||
          (event.key.toLowerCase() === "z" && event.shiftKey)
        )
      ) {
        event.preventDefault();
        dispatch(HISTORY_REDO);
        return;
      }

      if (primaryModifier && event.key.toLowerCase() === "b") {
        if (!activeIds.length) return;
        event.preventDefault();
        dispatch(ACTIVE_SPLIT, {
          payload: {},
          options: {
            time: getCurrentTime()
          }
        });
        return;
      }

      if (primaryModifier && event.key.toLowerCase() === "d") {
        if (!activeIds.length) return;
        event.preventDefault();
        dispatch(LAYER_CLONE);
        return;
      }

      if (event.code === "Space" || event.key === " ") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        dispatch(PLAYER_TOGGLE_PLAY);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!activeIds.length) return;
        event.preventDefault();
        dispatch(LAYER_DELETE);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIds]);

  useEffect(() => {
    if (!id) return;
    if (hydratedProjectIdsRef.current.has(id)) return;

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const maxAttempts = 5;

    const loadPixelProject = async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/pixel/projects/${id}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Failed to load project ${id}: ${response.status}`);
        }
        const project = (await response.json()) as PixelProject;
        if (cancelled) return;

        if (project.name?.trim()) {
          setProjectName(project.name);
        }

        resetEditorUiState();

        const savedEditorState = project.config?.editor_state;
        if (
          savedEditorState &&
          typeof savedEditorState === "object" &&
          hasPersistedEditorState(savedEditorState as Record<string, unknown>) &&
          !loadedEditorStateProjectIdsRef.current.has(id)
        ) {
          const currentDesignState = stateManager.toJSON() as Record<string, unknown>;
          const normalizedEditorState = {
            ...currentDesignState,
            ...savedEditorState,
            trackItemsMap:
              (savedEditorState.trackItemsMap as Record<string, unknown>) ||
              currentDesignState.trackItemsMap,
            transitionsMap:
              (savedEditorState.transitionsMap as Record<string, unknown>) ||
              currentDesignState.transitionsMap,
            tracks:
              (savedEditorState.tracks as Record<string, unknown>[]) ||
              currentDesignState.tracks,
            trackItemIds:
              (savedEditorState.trackItemIds as string[]) ||
              Object.keys(
                ((savedEditorState.trackItemsMap ||
                  currentDesignState.trackItemsMap) as Record<string, unknown>) || {}
              ),
            transitionIds:
              (savedEditorState.transitionIds as string[]) ||
              Object.keys(
                ((savedEditorState.transitionsMap ||
                  currentDesignState.transitionsMap) as Record<string, unknown>) || {}
              ),
            activeIds: [],
          };

          dispatch(DESIGN_LOAD, {
            payload: normalizedEditorState,
          });
          void useStore.getState().setState(normalizedEditorState);

          loadedEditorStateProjectIdsRef.current.add(id);
        }

        const currentState = useStore.getState();
        const projectPathToken = `/api/pixel/projects/${id}/`;
        const staleTrackItemIds = Object.values(currentState.trackItemsMap)
          .filter((item: any) => {
            const metadataProjectId = item?.metadata?.pixelProjectId;
            const src = String(item?.details?.src || "");
            const sourceUrl = String(item?.metadata?.sourceUrl || "");

            const belongsToAnotherPixelProject =
              typeof metadataProjectId === "string" && metadataProjectId !== id;
            const srcFromAnotherPixelProject =
              src.includes("/api/pixel/projects/") && !src.includes(projectPathToken);
            const captionFromAnotherPixelProject =
              sourceUrl.includes("/api/pixel/projects/") &&
              !sourceUrl.includes(projectPathToken);

            return (
              belongsToAnotherPixelProject ||
              srcFromAnotherPixelProject ||
              captionFromAnotherPixelProject
            );
          })
          .map((item: any) => item.id);

        if (staleTrackItemIds.length) {
          dispatch(LAYER_DELETE, {
            payload: {
              trackItemIds: staleTrackItemIds
            }
          });
        }

        const videos = project.videos || [];
        const existingPixelVideoIds = new Set(
          Object.values(useStore.getState().trackItemsMap)
            .map((item: any) => item?.metadata?.pixelVideoId)
            .filter(Boolean)
        );

        for (const video of videos) {
          if (existingPixelVideoIds.has(video.id)) {
            continue;
          }

          const mediaUrl = `/api/pixel/projects/${id}/videos/${video.id}/media`;
          if (isLikelyAudioSource(video)) {
            dispatch(ADD_AUDIO, {
              payload: {
                id: generateId(),
                type: "audio",
                details: { src: mediaUrl },
                metadata: {
                  pixelProjectId: id,
                  pixelVideoId: video.id,
                },
              },
              options: {},
            });
            existingPixelVideoIds.add(video.id);
            continue;
          }

          dispatch(ADD_VIDEO, {
            payload: {
              id: generateId(),
              details: { src: mediaUrl },
              metadata: {
                previewUrl: `/api/pixel/projects/${id}/videos/${video.id}/thumbnail`,
                pixelProjectId: id,
                pixelVideoId: video.id,
              },
            },
            options: {
              resourceId: "main",
              scaleMode: "fit",
            },
          });
          existingPixelVideoIds.add(video.id);
        }

        hydratedProjectIdsRef.current.add(id);
        setSaveStatus("saved");
      } catch (error) {
        console.error("[Editor] Failed to hydrate Pixel project", error);
        if (!cancelled && attempts < maxAttempts) {
          retryTimeout = setTimeout(() => {
            void loadPixelProject();
          }, 1200);
        }
      }
    };

    void loadPixelProject();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (!hydratedProjectIdsRef.current.has(id)) return;

    const payload = buildEditorStatePayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastAutosavedStateRef.current) {
      if (saveStatus !== "saving") {
        setSaveStatus("saved");
      }
      return;
    }

    setSaveStatus((current) => (current === "saving" ? current : "unsaved"));

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(async () => {
      await saveProjectState({ payload, serialized });
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [id, projectName, tracks, trackItemsMap, transitionsMap, size, fps, duration]);

  useEffect(() => {
    if (!timeline) return;
    if (!hydratedProjectIdsRef.current.has(id || "")) return;

    const timeout = setTimeout(() => {
      timeline.requestRenderAll();
    }, 60);

    return () => clearTimeout(timeout);
  }, [id, timeline, tracks, trackItemsMap, transitionsMap]);

  return (
    <div data-editor className="flex h-screen w-screen flex-col" style={{ backgroundColor: 'var(--editor-bg-deep)' }}>
      <Navbar
        projectName={projectName}
        saveStatus={saveStatus}
        user={null}
        stateManager={stateManager}
        setProjectName={setProjectName}
        onSave={() => void saveProjectState({ immediate: true })}
      />

      <div className="flex flex-1">
        {isLargeScreen ? (
          (() => {
            const sidebarPixelWidth = isLeftSidebarCollapsed ? 76 : showMenuItem ? 352 : 76;
            const inspectorPixelWidth = isRightInspectorCollapsed ? 28 : 336;

            return (
          <div className="flex h-full w-full overflow-hidden" style={{ backgroundColor: 'var(--editor-bg-deep)' }}>
            <div
              className="relative shrink-0 overflow-visible border-r border-white/8 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: sidebarPixelWidth }}
            >
              <div className="relative h-full">
                <div
                  className={cn(
                    "h-full origin-left overflow-hidden transition-[width,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    isLeftSidebarCollapsed
                      ? "w-[76px] opacity-100"
                      : "w-full opacity-100"
                  )}
                >
                  <Sidebar />
                </div>
                <SidebarToggle
                  collapsed={isLeftSidebarCollapsed}
                  active={showMenuItem || Boolean(trackItem)}
                  onToggle={() =>
                    setIsLeftSidebarCollapsed((current) => !current)
                  }
                />
              </div>
              <FloatingControl />
            </div>

            <div className="min-w-0 min-h-0 flex-1 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
              <SceneContainer
                sceneRef={sceneRef}
                playerRef={playerRef}
                stateManager={stateManager}
                trackItem={trackItem}
                loaded={loaded}
                isLargeScreen={isLargeScreen}
              />
            </div>

            <div
              className="relative shrink-0 overflow-visible border-l border-white/8 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: inspectorPixelWidth }}
            >
              <div className="relative h-full">
                <div
                  className={cn(
                    "h-full origin-right overflow-hidden transition-[width,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    isRightInspectorCollapsed
                      ? "w-[28px] opacity-95"
                      : "w-full opacity-100"
                  )}
                >
                  <div
                    className={cn(
                      "h-full transition-[transform,opacity] duration-300 ease-out",
                      isRightInspectorCollapsed
                        ? "translate-x-4 opacity-0 pointer-events-none"
                        : "translate-x-0 opacity-100"
                    )}
                  >
                    <InspectorPanel
                      trackItem={trackItem}
                      projectName={projectName}
                      setProjectName={setProjectName}
                      size={size}
                      fps={fps}
                      duration={duration}
                      tracks={tracks}
                      backgroundColor={background.value}
                    />
                  </div>
                </div>
                <InspectorToggle
                  collapsed={isRightInspectorCollapsed}
                  active={Boolean(trackItem) || !isRightInspectorCollapsed}
                  onToggle={() =>
                    setIsRightInspectorCollapsed((current) => !current)
                  }
                />
                {isRightInspectorCollapsed ? (
                  <CollapsedPanelLabel
                    label={trackItem ? "Selected" : "Inspector"}
                    accent={Boolean(trackItem)}
                    side="right"
                  />
                ) : null}
              </div>
            </div>
          </div>
            );
          })()
        ) : (
          <SceneContainer
            sceneRef={sceneRef}
            playerRef={playerRef}
            stateManager={stateManager}
            trackItem={trackItem}
            loaded={loaded}
            isLargeScreen={isLargeScreen}
          />
        )}
      </div>
    </div>
  );
};

export default Editor;
