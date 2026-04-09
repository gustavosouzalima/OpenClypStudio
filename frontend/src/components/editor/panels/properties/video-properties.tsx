import type {
  ImageElement,
  StickerElement,
  VideoElement,
} from "@/types/timeline";
import { useEditor } from "@/hooks/use-editor";
import { Button } from "@/components/ui/button";
import {
  detachAudioFromVideo,
  hasDetachedAudioForVideo,
} from "@/lib/timeline/detach-audio";
import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "./section";
import { Badge } from "@/components/ui/badge";
import { getAllTransitions } from "@/lib/transitions";
import { BlendingSection, TransformSection } from "./sections";

const TRANSITION_DURATION_PRESETS = [200, 350, 500, 800] as const;

export function VideoProperties({
  element,
  trackId,
}: {
  element: VideoElement | ImageElement | StickerElement;
  trackId: string;
}) {
  const editor = useEditor();
  const isVideoElement = element.type === "video";
  const alreadyDetached =
    element.type === "video"
      ? hasDetachedAudioForVideo({ editor, videoElement: element })
      : false;

  const handleDetachAudio = () => {
    if (element.type !== "video") return;
    detachAudioFromVideo({ editor, trackId, videoElement: element });
  };

  const handleClearTransitions = () => {
    editor.timeline.updateElements({
      updates: [
        {
          trackId,
          elementId: element.id,
          updates: {
            transitionIn: undefined,
            transitionOut: undefined,
          },
        },
      ],
    });
  };

  const applyTransitionSide = ({
    side,
    type,
  }: {
    side: "in" | "out";
    type: string;
  }) => {
    const current =
      side === "in" ? element.transitionIn : element.transitionOut;
    editor.timeline.updateElements({
      updates: [
        {
          trackId,
          elementId: element.id,
          updates: {
            [side === "in" ? "transitionIn" : "transitionOut"]: {
              type,
              durationMs: current?.durationMs ?? 350,
            },
          },
        },
      ],
    });
  };

  const clearTransitionSide = ({ side }: { side: "in" | "out" }) => {
    editor.timeline.updateElements({
      updates: [
        {
          trackId,
          elementId: element.id,
          updates: {
            [side === "in" ? "transitionIn" : "transitionOut"]: undefined,
          },
        },
      ],
    });
  };

  const setTransitionDuration = ({ durationMs }: { durationMs: number }) => {
    editor.timeline.updateElements({
      updates: [
        {
          trackId,
          elementId: element.id,
          updates: {
            transitionIn: element.transitionIn
              ? { ...element.transitionIn, durationMs }
              : undefined,
            transitionOut: element.transitionOut
              ? { ...element.transitionOut, durationMs }
              : undefined,
          },
        },
      ],
    });
  };

  return (
    <div className="flex h-full flex-col">
      {isVideoElement ? (
        <Section
          collapsible
          defaultOpen
          sectionKey={`${element.type}:audio:${element.id}`}
          showTopBorder={false}
        >
          <SectionHeader>
            <SectionTitle>Audio</SectionTitle>
          </SectionHeader>
          <SectionContent>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Separates the clip audio into its own audio track and mutes the
                source video clip.
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                This allows you to edit audio independently — adjust levels, add
                effects, or move it to a different position on the timeline.
              </p>
              <Button className="w-full" onClick={handleDetachAudio}>
                {alreadyDetached ? "Detach Audio Again" : "Detach Audio"}
              </Button>
            </div>
          </SectionContent>
        </Section>
      ) : null}
      <Section
        collapsible
        defaultOpen
        sectionKey={`${element.type}:transitions:${element.id}`}
      >
        <SectionHeader>
          <SectionTitle>Transitions</SectionTitle>
        </SectionHeader>
        <SectionContent>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {element.transitionIn ? (
                <Badge variant="outline">
                  In: {element.transitionIn.type} (
                  {element.transitionIn.durationMs} ms)
                </Badge>
              ) : (
                <Badge variant="outline">In: none</Badge>
              )}
              {element.transitionOut ? (
                <Badge variant="outline">
                  Out: {element.transitionOut.type} (
                  {element.transitionOut.durationMs} ms)
                </Badge>
              ) : (
                <Badge variant="outline">Out: none</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Apply smooth entrance and exit animations. Transitions blend
              between clips or create fade effects at clip boundaries.
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              Tip: Shorter durations (200-350ms) work best for fast cuts.
              Longer durations (500-800ms) create smoother, cinematic fades.
            </p>
            <div className="flex flex-wrap gap-2">
              {TRANSITION_DURATION_PRESETS.map((durationMs) => (
                <Button
                  key={durationMs}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setTransitionDuration({ durationMs })}
                  disabled={!element.transitionIn && !element.transitionOut}
                >
                  {durationMs} ms
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Transition In
              </div>
              <div className="flex flex-wrap gap-2">
                {getAllTransitions().map((transition) => (
                  <Button
                    key={`in-${transition.type}`}
                    variant={
                      element.transitionIn?.type === transition.type
                        ? "secondary"
                        : "outline"
                    }
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      applyTransitionSide({
                        side: "in",
                        type: transition.type,
                      })
                    }
                  >
                    {transition.name}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => clearTransitionSide({ side: "in" })}
                  disabled={!element.transitionIn}
                >
                  Clear In
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Transition Out
              </div>
              <div className="flex flex-wrap gap-2">
                {getAllTransitions().map((transition) => (
                  <Button
                    key={`out-${transition.type}`}
                    variant={
                      element.transitionOut?.type === transition.type
                        ? "secondary"
                        : "outline"
                    }
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      applyTransitionSide({
                        side: "out",
                        type: transition.type,
                      })
                    }
                  >
                    {transition.name}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => clearTransitionSide({ side: "out" })}
                  disabled={!element.transitionOut}
                >
                  Clear Out
                </Button>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleClearTransitions}
              disabled={!element.transitionIn && !element.transitionOut}
            >
              Clear Transitions
            </Button>
          </div>
        </SectionContent>
      </Section>
      <TransformSection
        element={element}
        trackId={trackId}
        showTopBorder={!isVideoElement}
      />
      <BlendingSection element={element} trackId={trackId} />
    </div>
  );
}
