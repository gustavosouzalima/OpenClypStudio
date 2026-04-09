import { Button } from "@/editor_runtime/components/ui/button";
import { dispatch } from "@designcombo/events";
import {
  ACTIVE_SPLIT,
  DESIGN_LOAD,
  LAYER_CLONE,
  LAYER_DELETE,
  TIMELINE_SCALE_CHANGED
} from "@designcombo/state";
import { PLAYER_PAUSE, PLAYER_PLAY } from "../constants/events";
import type { ITrack } from "@designcombo/types";
import { frameToTimeString, getCurrentTime, timeToString } from "../utils/time";
import useStore from "../store/use-store";
import { Plus, SquareSplitHorizontal, Trash, ZoomIn, ZoomOut } from "lucide-react";
import {
  getFitZoomLevel,
  getNextZoomLevel,
  getPreviousZoomLevel,
  getZoomByIndex
} from "../utils/timeline";
import { useCurrentPlayerFrame } from "../hooks/use-current-frame";
import { Slider } from "@/editor_runtime/components/ui/slider";
import { useEffect, useState } from "react";
import useUpdateAnsestors from "../hooks/use-update-ansestors";
import { ITimelineScaleState } from "@designcombo/types";
import { useIsLargeScreen } from "@/editor_runtime/hooks/use-media-query";
import { useTimelineOffsetX } from "../hooks/use-timeline-offset";
import { generateId } from "@designcombo/timeline";
import StateManager from "@designcombo/state";

const timelineActionButtonClassName =
  "h-8 rounded-xl border border-[var(--editor-border)] bg-[var(--editor-bg-surface)] px-3 text-[var(--editor-text-secondary)] shadow-[var(--editor-shadow-sm)] transition-all duration-[var(--editor-duration-fast)] hover:border-[var(--editor-border-focus)] hover:bg-[var(--editor-bg-hover)] hover:text-[var(--editor-text-primary)]";

const timelineIconButtonClassName =
  "size-8 rounded-xl border border-[var(--editor-border)] bg-[var(--editor-bg-surface)] text-[var(--editor-text-secondary)] shadow-[var(--editor-shadow-sm)] transition-all duration-[var(--editor-duration-fast)] hover:border-[var(--editor-border-focus)] hover:bg-[var(--editor-bg-hover)] hover:text-[var(--editor-text-primary)]";

const destructiveTimelineButtonClassName =
  "border-[var(--editor-error)]/25 bg-[var(--editor-error-dim)] text-[var(--editor-error)] hover:border-[var(--editor-error)]/50 hover:bg-[var(--editor-error-dim)] hover:text-[#fecaca]";

const DEFAULT_TRACK_ACCEPTS = [
  "text",
  "image",
  "video",
  "audio",
  "composition",
  "caption",
  "template",
  "customTrack",
  "customTrack2",
  "illustration",
  "custom",
  "main",
  "shape",
  "linealAudioBars",
  "radialAudioBars",
  "progressFrame",
  "progressBar",
  "rect",
  "progressSquare"
] as const;

const IconPlayerPlayFilled = ({ size }: { size: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" />
  </svg>
);

const IconPlayerPauseFilled = ({ size }: { size: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" />
    <path d="M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z" />
  </svg>
);
const IconPlayerSkipBack = ({ size }: { size: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M20 5v14l-12 -7z" />
    <path d="M4 5l0 14" />
  </svg>
);

const IconPlayerSkipForward = ({ size }: { size: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M4 5v14l12 -7z" />
    <path d="M20 5l0 14" />
  </svg>
);
const Header = ({ stateManager }: { stateManager: StateManager }) => {
  const [playing, setPlaying] = useState(false);
  const { duration, fps, scale, playerRef, activeIds } = useStore();
  const isLargeScreen = useIsLargeScreen();
  useUpdateAnsestors({ playing, playerRef });

  const doActiveDelete = () => {
    dispatch(LAYER_DELETE);
  };

  const doActiveSplit = () => {
    if (activeIds.length !== 1) return;

    const activeItem = useStore.getState().trackItemsMap[activeIds[0]];
    if (!activeItem?.display) return;

    const currentTime = getCurrentTime();
    const isCurrentTimeValid =
      currentTime > activeItem.display.from && currentTime < activeItem.display.to;
    const fallbackTime =
      activeItem.display.from +
      (activeItem.display.to - activeItem.display.from) / 2;

    dispatch(ACTIVE_SPLIT, {
      payload: {},
      options: {
        time: isCurrentTimeValid ? currentTime : fallbackTime
      }
    });
  };

  const changeScale = (scale: ITimelineScaleState) => {
    dispatch(TIMELINE_SCALE_CHANGED, {
      payload: {
        scale
      }
    });
  };

  const handlePlay = () => {
    dispatch(PLAYER_PLAY);
  };

  const handlePause = () => {
    dispatch(PLAYER_PAUSE);
  };

  const handleAddTrack = () => {
    const existingTracks: ITrack[] = Array.isArray(useStore.getState().tracks)
      ? [...useStore.getState().tracks]
      : [];

    const newTrack: ITrack = {
      id: generateId(),
      accepts: [...DEFAULT_TRACK_ACCEPTS],
      type: "video",
      items: [],
      muted: false,
      magnetic: false,
      static: false
    };

    console.log("Adding track:", newTrack);

    const nextTracks = [...existingTracks, newTrack];

    stateManager.updateState({
      tracks: nextTracks
    });

    useStore.getState().setState({
      tracks: nextTracks
    });

    useStore.getState().timeline?.requestRenderAll();
  };

  useEffect(() => {
    const currentPlayer = playerRef?.current;
    if (!currentPlayer) return;

    const handlePlayEvent = () => {
      setPlaying(true);
    };
    const handlePauseEvent = () => {
      setPlaying(false);
    };

    currentPlayer.addEventListener("play", handlePlayEvent);
    currentPlayer.addEventListener("pause", handlePauseEvent);

    return () => {
      currentPlayer.removeEventListener("play", handlePlayEvent);
      currentPlayer.removeEventListener("pause", handlePauseEvent);
    };
  }, [playerRef]);

  return (
    <div
      id="timeline-header"
      style={{
        position: "relative",
        height: "50px",
        flex: "none"
      }}
    >
      <div
        style={{
          position: "absolute",
          height: 50,
          width: "100%",
          display: "flex",
          alignItems: "center"
        }}
      >
        <div
          style={{
            height: 36,
            width: "100%",
            display: "grid",
            gridTemplateColumns: isLargeScreen
              ? "1fr 260px 1fr"
              : "1fr 1fr 1fr",
            alignItems: "center"
          }}
        >
          <div className="flex items-center gap-2 px-2">
            <Button
              onClick={handleAddTrack}
              variant={"outline"}
              size={isLargeScreen ? "sm" : "icon"}
              className={timelineActionButtonClassName}
            >
              <Plus size={14} />
              <span className="hidden lg:block">New Track</span>
            </Button>

            <Button
              disabled={!activeIds.length}
              onClick={doActiveDelete}
              variant={"outline"}
              size={isLargeScreen ? "sm" : "icon"}
              className={`${timelineActionButtonClassName} ${destructiveTimelineButtonClassName}`}
            >
              <Trash size={14} />{" "}
              <span className="hidden lg:block">Delete</span>
            </Button>

            <Button
              disabled={!activeIds.length}
              onClick={doActiveSplit}
              variant={"outline"}
              size={isLargeScreen ? "sm" : "icon"}
              className={timelineActionButtonClassName}
            >
              <SquareSplitHorizontal size={15} />{" "}
              <span className="hidden lg:block">Split</span>
            </Button>
            <Button
              disabled={!activeIds.length}
              onClick={() => {
                dispatch(LAYER_CLONE);
              }}
              variant={"outline"}
              size={isLargeScreen ? "sm" : "icon"}
              className={timelineActionButtonClassName}
            >
              <SquareSplitHorizontal size={15} />{" "}
              <span className="hidden lg:block">Clone</span>
            </Button>
          </div>
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--editor-border-subtle)] bg-[var(--editor-bg-base)]/72 px-2 py-1">
              <Button
                onClick={doActiveDelete}
                variant={"outline"}
                size={"icon"}
                disabled={!activeIds.length}
                aria-label="Previous clip"
                title="Previous clip"
                className={`hidden lg:inline-flex ${timelineIconButtonClassName}`}
              >
                <IconPlayerSkipBack size={14} />
              </Button>
              <Button
                onClick={() => {
                  if (playing) {
                    return handlePause();
                  }
                  handlePlay();
                }}
                variant={"outline"}
                size={"icon"}
                className={`${timelineIconButtonClassName} border-[var(--editor-border-accent)] bg-[var(--editor-accent-dim)] text-[var(--editor-text-primary)] hover:bg-[var(--editor-accent-dim)]`}
                aria-label={playing ? "Pause playback" : "Play playback"}
                title={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <IconPlayerPauseFilled size={14} />
                ) : (
                  <IconPlayerPlayFilled size={14} />
                )}
              </Button>
              <Button
                onClick={doActiveSplit}
                variant={"outline"}
                size={"icon"}
                disabled={!activeIds.length}
                aria-label="Next clip"
                title="Next clip"
                className={`hidden lg:inline-flex ${timelineIconButtonClassName}`}
              >
                <IconPlayerSkipForward size={14} />
              </Button>
            </div>
            <div
              className="text-xs font-light flex"
              style={{
                alignItems: "center",
                gridTemplateColumns: "54px 4px 54px",
                paddingTop: "2px",
                justifyContent: "center"
              }}
            >
              <div
                className="font-medium text-[var(--editor-text-primary)]"
                style={{
                  display: "flex",
                  justifyContent: "center"
                }}
                id="video-current-time"
              >
                <CurrentTimeDisplay fps={fps} playerRef={playerRef} />
              </div>
              <span className="px-1 text-[var(--editor-text-muted)]">|</span>
              <div
                className="text-muted-foreground hidden lg:block"
                style={{
                  display: "flex",
                  justifyContent: "center"
                }}
              >
                {timeToString({ time: duration })}
              </div>
            </div>
          </div>

          <ZoomControl
            scale={scale}
            onChangeTimelineScale={changeScale}
            duration={duration}
          />
        </div>
      </div>
    </div>
  );
};

const CurrentTimeDisplay = ({
  fps,
  playerRef
}: {
  fps: number;
  playerRef: ReturnType<typeof useStore.getState>["playerRef"];
}) => {
  const currentFrame = useCurrentPlayerFrame(playerRef);

  return (
    <span data-current-time={currentFrame / fps}>
      {frameToTimeString({ frame: currentFrame }, { fps })}
    </span>
  );
};

const ZoomControl = ({
  scale,
  onChangeTimelineScale,
  duration
}: {
  scale: ITimelineScaleState;
  onChangeTimelineScale: (scale: ITimelineScaleState) => void;
  duration: number;
}) => {
  const [localValue, setLocalValue] = useState(scale.index);
  const timelineOffsetX = useTimelineOffsetX();

  useEffect(() => {
    setLocalValue(scale.index);
  }, [scale.index]);

  const onZoomOutClick = () => {
    const previousZoom = getPreviousZoomLevel(scale);
    onChangeTimelineScale(previousZoom);
  };

  const onZoomInClick = () => {
    const nextZoom = getNextZoomLevel(scale);
    onChangeTimelineScale(nextZoom);
  };

  const onZoomFitClick = () => {
    const fitZoom = getFitZoomLevel(duration, scale.zoom, timelineOffsetX);
    onChangeTimelineScale(fitZoom);
  };

  return (
    <div className="flex items-center justify-end">
      <div className="flex items-center gap-2 border-l border-[var(--editor-border)] pl-4 pr-2">
        <Button
          size={"icon"}
          variant={"outline"}
          onClick={onZoomOutClick}
          className={timelineIconButtonClassName}
        >
          <ZoomOut size={16} />
        </Button>
        <Slider
          className="hidden w-28 lg:flex"
          value={[localValue]}
          min={0}
          max={12}
          step={1}
          onValueChange={(e) => {
            setLocalValue(e[0]); // Update local state
          }}
          onValueCommit={() => {
            const zoom = getZoomByIndex(localValue);
            onChangeTimelineScale(zoom); // Propagate value to parent when user commits change
          }}
        />
        <Button
          size={"icon"}
          variant={"outline"}
          onClick={onZoomInClick}
          className={timelineIconButtonClassName}
        >
          <ZoomIn size={16} />
        </Button>
        <Button
          onClick={onZoomFitClick}
          variant={"outline"}
          size={"icon"}
          className={timelineIconButtonClassName}
          title="Fit timeline"
          aria-label="Fit timeline"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M20 8V6h-2q-.425 0-.712-.288T17 5t.288-.712T18 4h2q.825 0 1.413.588T22 6v2q0 .425-.288.713T21 9t-.712-.288T20 8M2 8V6q0-.825.588-1.412T4 4h2q.425 0 .713.288T7 5t-.288.713T6 6H4v2q0 .425-.288.713T3 9t-.712-.288T2 8m18 12h-2q-.425 0-.712-.288T17 19t.288-.712T18 18h2v-2q0-.425.288-.712T21 15t.713.288T22 16v2q0 .825-.587 1.413T20 20M4 20q-.825 0-1.412-.587T2 18v-2q0-.425.288-.712T3 15t.713.288T4 16v2h2q.425 0 .713.288T7 19t-.288.713T6 20zm2-6v-4q0-.825.588-1.412T8 8h8q.825 0 1.413.588T18 10v4q0 .825-.587 1.413T16 16H8q-.825 0-1.412-.587T6 14"
            />
          </svg>
        </Button>
      </div>
    </div>
  );
};

export default Header;
