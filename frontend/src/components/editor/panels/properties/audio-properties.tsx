import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import {
  Section,
  SectionContent,
  SectionField,
  SectionFields,
  SectionHeader,
  SectionTitle,
} from "./section";
import type { AudioElement } from "@/types/timeline";
import { useEditor } from "@/hooks/use-editor";
import { usePropertyDraft } from "./hooks/use-property-draft";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";

export function AudioProperties({
  element,
  trackId,
}: {
  element: AudioElement;
  trackId: string;
}) {
  const editor = useEditor();
  const { requestRevealMedia } = useAssetsPanelStore();

  const volume = usePropertyDraft({
    displayValue: Math.round((element.volume ?? 1) * 100).toString(),
    parse: (input) => {
      const parsed = Number.parseFloat(input);
      if (Number.isNaN(parsed)) return null;
      return Math.max(0, Math.min(200, parsed)) / 100;
    },
    onPreview: (value) =>
      editor.timeline.previewElements({
        updates: [
          { trackId, elementId: element.id, updates: { volume: value } },
        ],
      }),
    onCommit: () => editor.timeline.commitPreview(),
  });

  const fadeIn = usePropertyDraft({
    displayValue: Math.round(element.fadeInMs ?? 0).toString(),
    parse: (input) => {
      const parsed = Number.parseFloat(input);
      if (Number.isNaN(parsed)) return null;
      return Math.max(0, Math.min(5000, parsed));
    },
    onPreview: (value) =>
      editor.timeline.previewElements({
        updates: [
          { trackId, elementId: element.id, updates: { fadeInMs: value } },
        ],
      }),
    onCommit: () => editor.timeline.commitPreview(),
  });

  const fadeOut = usePropertyDraft({
    displayValue: Math.round(element.fadeOutMs ?? 0).toString(),
    parse: (input) => {
      const parsed = Number.parseFloat(input);
      if (Number.isNaN(parsed)) return null;
      return Math.max(0, Math.min(5000, parsed));
    },
    onPreview: (value) =>
      editor.timeline.previewElements({
        updates: [
          { trackId, elementId: element.id, updates: { fadeOutMs: value } },
        ],
      }),
    onCommit: () => editor.timeline.commitPreview(),
  });

  const toggleMute = () => {
    editor.timeline.updateElements({
      updates: [
        {
          trackId,
          elementId: element.id,
          updates: { muted: !element.muted },
        },
      ],
    });
  };

  const setVolumePreset = ({ value }: { value: number }) => {
    editor.timeline.updateElements({
      updates: [
        {
          trackId,
          elementId: element.id,
          updates: { volume: value },
        },
      ],
    });
  };

  const setFadePreset = ({
    key,
    value,
  }: {
    key: "fadeInMs" | "fadeOutMs";
    value: number;
  }) => {
    editor.timeline.updateElements({
      updates: [
        {
          trackId,
          elementId: element.id,
          updates: { [key]: value },
        },
      ],
    });
  };

  return (
    <div className="flex h-full flex-col">
      <Section
        collapsible
        defaultOpen
        sectionKey={`${element.type}:mix:${element.id}`}
        showTopBorder={false}
      >
        <SectionHeader>
          <SectionTitle>Mix</SectionTitle>
        </SectionHeader>
        <SectionContent>
          <SectionFields>
            <SectionField label="Volume">
              <NumberField
                value={volume.displayValue}
                min={0}
                max={200}
                onFocus={volume.onFocus}
                onChange={volume.onChange}
                onBlur={volume.onBlur}
                onScrub={(value) => volume.scrubTo(value)}
                onScrubEnd={volume.commitScrub}
                onReset={() =>
                  editor.timeline.updateElements({
                    updates: [
                      {
                        trackId,
                        elementId: element.id,
                        updates: { volume: 1 },
                      },
                    ],
                  })
                }
                isDefault={(element.volume ?? 1) === 1}
                icon="%"
              />
            </SectionField>
            <SectionField label="Fade In">
              <NumberField
                value={fadeIn.displayValue}
                min={0}
                max={5000}
                onFocus={fadeIn.onFocus}
                onChange={fadeIn.onChange}
                onBlur={fadeIn.onBlur}
                onScrub={(value) => fadeIn.scrubTo(value)}
                onScrubEnd={fadeIn.commitScrub}
                onReset={() =>
                  editor.timeline.updateElements({
                    updates: [
                      {
                        trackId,
                        elementId: element.id,
                        updates: { fadeInMs: 0 },
                      },
                    ],
                  })
                }
                isDefault={(element.fadeInMs ?? 0) === 0}
                icon="ms"
              />
            </SectionField>
            <SectionField label="Fade Out">
              <NumberField
                value={fadeOut.displayValue}
                min={0}
                max={5000}
                onFocus={fadeOut.onFocus}
                onChange={fadeOut.onChange}
                onBlur={fadeOut.onBlur}
                onScrub={(value) => fadeOut.scrubTo(value)}
                onScrubEnd={fadeOut.commitScrub}
                onReset={() =>
                  editor.timeline.updateElements({
                    updates: [
                      {
                        trackId,
                        elementId: element.id,
                        updates: { fadeOutMs: 0 },
                      },
                    ],
                  })
                }
                isDefault={(element.fadeOutMs ?? 0) === 0}
                icon="ms"
              />
            </SectionField>
          </SectionFields>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Use this after detaching audio from a video clip to balance voice,
              ambience, or music independently.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "50%", value: 0.5 },
                { label: "100%", value: 1 },
                { label: "150%", value: 1.5 },
              ].map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setVolumePreset({ value: preset.value })}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {[150, 300, 500, 1000].map((preset) => (
                <Button
                  key={`fade-${preset}`}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setFadePreset({ key: "fadeInMs", value: preset });
                    setFadePreset({ key: "fadeOutMs", value: preset });
                  }}
                >
                  Fade {preset}ms
                </Button>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={toggleMute}>
              {element.muted ? "Unmute Audio" : "Mute Audio"}
            </Button>
            {element.sourceType === "upload" ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => requestRevealMedia(element.mediaId)}
              >
                Reveal source media
              </Button>
            ) : null}
          </div>
        </SectionContent>
      </Section>
    </div>
  );
}
