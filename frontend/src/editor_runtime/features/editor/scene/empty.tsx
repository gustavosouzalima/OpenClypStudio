import useStore from "../store/use-store";
import { useEffect, useRef, useState } from "react";
import { Droppable } from "@/editor_runtime/components/ui/droppable";
import { Film, Loader2, PlusIcon, Sparkles } from "lucide-react";
import { DroppableArea } from "./droppable";

const SceneEmpty = () => {
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [desiredSize, setDesiredSize] = useState({ width: 0, height: 0 });
  const { size } = useStore();

  useEffect(() => {
    const container = containerRef.current!;
    const PADDING = 96;
    const containerHeight = container.clientHeight - PADDING;
    const containerWidth = container.clientWidth - PADDING;
    const { width, height } = size;

    const desiredZoom = Math.min(
      containerWidth / width,
      containerHeight / height
    );
    setDesiredSize({
      width: width * desiredZoom,
      height: height * desiredZoom
    });
    setIsLoading(false);
  }, [size]);

  const onSelectFiles = (files: File[]) => {
    console.log({ files });
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-50 flex h-full w-full flex-1"
      style={{ backgroundColor: 'var(--editor-bg-deep)' }}
    >
      {!isLoading ? (
        <Droppable
          maxFileCount={4}
          maxSize={4 * 1024 * 1024}
          disabled={false}
          onValueChange={onSelectFiles}
          className="h-full w-full flex-1"
        >
          <DroppableArea
            onDragStateChange={setIsDraggingOver}
            className={`absolute h-[calc(100%-40px)] aspect-[9/16] left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 transform items-center justify-center border-2 border-dashed rounded-xl transition-all duration-[var(--editor-duration-normal)] ease-out ${
              isDraggingOver
                ? "border-[var(--editor-accent)] bg-[var(--editor-accent-dim)] shadow-[var(--editor-shadow-glow)] scale-[1.02]"
                : "border-[var(--editor-border)] bg-[var(--editor-bg-elevated)]/50"
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-5 pb-12">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-accent-dim)] text-[var(--editor-accent)] transition-all duration-[var(--editor-duration-fast)] hover:scale-110 hover:border-[var(--editor-accent)]/40 hover:shadow-[var(--editor-shadow-glow)]"
                style={{ cursor: "pointer" }}
              >
                {isDraggingOver ? (
                  <PlusIcon className="h-6 w-6" />
                ) : (
                  <Film className="h-6 w-6" />
                )}
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-medium text-[var(--editor-text-primary)]">
                  {isDraggingOver ? "Drop to add media" : "Click to upload"}
                </p>
                <p className="text-xs text-[var(--editor-text-muted)]">
                  {isDraggingOver ? "Release to add files to your project" : "Or drag and drop files here"}
                </p>
                {!isDraggingOver && (
                  <div className="mt-3 flex items-center gap-1.5 opacity-40">
                    <Sparkles className="h-3 w-3" />
                    <p className="text-[10px] text-[var(--editor-text-muted)]">
                      {Math.round(size.width)} x {Math.round(size.height)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </DroppableArea>
        </Droppable>
      ) : (
        <div className="fixed top-0 left-0 z-50 flex h-screen w-screen flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--editor-bg-deep)' }}>
          <Loader2 className="h-8 w-8 animate-spin text-[var(--editor-accent)]" />
          <p className="text-sm text-[var(--editor-text-secondary)]">Loading...</p>
        </div>
      )}
    </div>
  );
};

export default SceneEmpty;
