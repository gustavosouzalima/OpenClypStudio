import { useCurrentPlayerFrame } from "../hooks/use-current-frame";
import useStore from "../store/use-store";
import {
  MouseEvent,
  TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { timeMsToUnits, unitsToTimeMs } from "../utils/timeline";
import { TIMELINE_OFFSET_CANVAS_LEFT } from "../constants/constants";
import { useTimelineOffsetX } from "../hooks/use-timeline-offset";
import { useTheme } from "next-themes";
const Playhead = ({ scrollLeft }: { scrollLeft: number }) => {
  const playheadRef = useRef<HTMLDivElement>(null);
  const { playerRef, fps, scale } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartPositionRef = useRef(0);
  const timelineOffsetX = useTimelineOffsetX();

  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const currentTheme = useMemo(() => {
    if (!mounted) return "light";
    return (theme === "system" ? resolvedTheme : theme) as "dark" | "light";
  }, [mounted, theme, resolvedTheme]);

  const color = useMemo(() => {
    return currentTheme === "dark" ? "#ffffff" : "#000000";
  }, [currentTheme]);
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseDown = (
    e:
      | MouseEvent<HTMLDivElement, globalThis.MouseEvent>
      | TouchEvent<HTMLDivElement>
  ) => {
    e.preventDefault(); // Prevent default drag behavior
    setIsDragging(true);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    dragStartXRef.current = clientX;
    const currentFrame = playerRef?.current?.getCurrentFrame?.() ?? 0;
    dragStartPositionRef.current =
      timeMsToUnits((currentFrame / fps) * 1000, scale.zoom) - scrollLeft;
  };

  const handleMouseMove = useCallback((
    e: globalThis.MouseEvent | globalThis.TouchEvent
  ) => {
    if (isDragging) {
      e.preventDefault(); // Prevent default drag behavior
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const delta = clientX - dragStartXRef.current + scrollLeft;
      const newPosition = dragStartPositionRef.current + delta;

      const time = unitsToTimeMs(newPosition, scale.zoom);
      playerRef?.current?.seekTo(Math.round((time * fps) / 1000));
    }
  }, [fps, isDragging, playerRef, scale.zoom, scrollLeft]);

  useEffect(() => {
    const preventDefaultDrag = (e: Event) => {
      e.preventDefault();
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleMouseMove);
      document.addEventListener("touchend", handleMouseUp);
      document.addEventListener("dragstart", preventDefaultDrag);
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleMouseMove);
      document.removeEventListener("touchend", handleMouseUp);
      document.removeEventListener("dragstart", preventDefaultDrag);
    }

    // Cleanup event listeners on component unmount
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleMouseMove);
      document.removeEventListener("touchend", handleMouseUp);
      document.removeEventListener("dragstart", preventDefaultDrag);
    };
  }, [isDragging, handleMouseMove]);

  return (
    <div
      ref={playheadRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
      onDragStart={(e) => e.preventDefault()}
      id="playhead"
      style={{
        position: "absolute",
        left: timelineOffsetX + TIMELINE_OFFSET_CANVAS_LEFT,
        top: 50,
        width: 1,
        height: "calc(100% - 40px)",
        zIndex: 10,
        cursor: "pointer",
        touchAction: "none" // Prevent default touch actions
      }}
    >
      <div
        id="playhead-handle"
        style={{
          borderRadius: "0 0 4px 4px",
          backgroundColor: color
        }}
        className="absolute top-0 h-4 w-2 -translate-x-1/2 transform text-xs font-semibold text-zinc-800"
      />
      <div className="relative h-full">
        <div className="absolute top-0 h-full w-3 -translate-x-1/2 transform" />
        <div
          className="absolute top-0 h-full w-0.5 -translate-x-1/2 transform"
          style={{ backgroundColor: color }}
        />
      </div>
      <PlayheadPositionSync
        playheadRef={playheadRef}
        scrollLeft={scrollLeft}
        timelineOffsetX={timelineOffsetX}
      />
    </div>
  );
};

const PlayheadPositionSync = ({
  playheadRef,
  scrollLeft,
  timelineOffsetX
}: {
  playheadRef: React.RefObject<HTMLDivElement | null>;
  scrollLeft: number;
  timelineOffsetX: number;
}) => {
  const playerRef = useStore((state) => state.playerRef);
  const fps = useStore((state) => state.fps);
  const scale = useStore((state) => state.scale);
  const currentFrame = useCurrentPlayerFrame(playerRef);

  useEffect(() => {
    const playheadElement = playheadRef.current;
    if (!playheadElement) return;

    const position =
      timeMsToUnits((currentFrame / fps) * 1000, scale.zoom) - scrollLeft;
    playheadElement.style.left = `${timelineOffsetX + TIMELINE_OFFSET_CANVAS_LEFT + position}px`;
  }, [currentFrame, fps, playheadRef, scale.zoom, scrollLeft, timelineOffsetX]);

  return null;
};

export default Playhead;
