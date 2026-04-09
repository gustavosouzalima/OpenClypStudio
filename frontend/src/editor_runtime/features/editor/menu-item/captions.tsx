import { Button } from "@/editor_runtime/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/editor_runtime/components/ui/select";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { generateCaptions } from "../utils/captions";
import { loadFonts } from "../utils/fonts";
import { dispatch } from "@designcombo/events";
import { ADD_ITEMS, EDIT_OBJECT } from "@designcombo/state";
import { ITrackItem, ITrackItemsMap } from "@designcombo/types";
import { millisecondsToHHMMSS } from "../utils/format";
import useStore from "../store/use-store";
import { ScrollArea } from "@/editor_runtime/components/ui/scroll-area";
import { PLAYER_SEEK } from "../constants/events";
import { useCurrentPlayerFrame } from "../hooks/use-current-frame";
import { generateId } from "@designcombo/timeline";
import { Loader2 } from "lucide-react";
import { Input } from "@/editor_runtime/components/ui/input";
import { Label } from "@/editor_runtime/components/ui/label";

type CaptionStylePresetKey = "classic" | "bold" | "clean";

type CaptionStyleOptions = {
  preset: CaptionStylePresetKey;
  fontFamily: string;
  fontUrl: string;
  fontSize: number;
  textColor: string;
  shadowColor: string;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
  syncOffsetMs: number;
};

type MediaSelectItem = {
  label: string;
  value: string;
  mediaSrc: string;
};

export const Captions = () => {
  const trackItemsMap = useStore((state) => state.trackItemsMap);
  const [selectMediaItems, setSelectMediaItems] = useState<MediaSelectItem[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<string | undefined>();
  const [captionTrackItemsMap, setCaptionTrackItemsMap] = useState<
    Record<string, ITrackItem[]>
  >({});
  const [mediaTrackItems, setMediaTrackItems] = useState<ITrackItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [styleOptions, setStyleOptions] = useState<CaptionStyleOptions>({
    preset: "classic",
    fontFamily: "theboldfont",
    fontUrl: "https://cdn.designcombo.dev/fonts/the-bold-font.ttf",
    fontSize: 64,
    textColor: "#DADADA",
    shadowColor: "#000000",
    shadowBlur: 4,
    shadowX: 0,
    shadowY: 2,
    syncOffsetMs: 0
  });

  useEffect(() => {
    const mediaTrackItems = fetchMediaTrackItems(trackItemsMap);
    setMediaTrackItems(mediaTrackItems);

    const selectMediaOptions = createSelectMediaOptions(mediaTrackItems);
    setSelectMediaItems(selectMediaOptions);

    const groupedCaptions = groupCaptionItems(trackItemsMap);
    setCaptionTrackItemsMap(groupedCaptions);
  }, [trackItemsMap]);

  const handleSelectChange = (value: string) => {
    setSelectedMedia(value);
  };

  const createCaptions = async (selectedMedia: string) => {
    setIsGenerating(true);
    try {
      const trackItem = mediaTrackItems.find((mediaItem) => mediaItem.id === selectedMedia);

      if (!trackItem) {
        throw new Error("Track item not found");
      }

      const mediaSrc = String(trackItem.details.src || "");
      const jsonData = await transcribeMedia(mediaSrc, "auto");
      const fontInfo = {
        fontFamily: styleOptions.fontFamily,
        fontUrl: styleOptions.fontUrl,
        fontSize: styleOptions.fontSize
      };
      const sourceOffsetMs = Number((trackItem as any)?.details?.trim?.from || 0);
      const options = {
        containerWidth: 800,
        linesPerCaption: 1,
        parentId: trackItem.id,
        displayFrom: trackItem.display.from,
        sourceOffsetMs,
        syncOffsetMs: styleOptions.syncOffsetMs,
        textColor: styleOptions.textColor,
        shadowColor: styleOptions.shadowColor,
        shadowBlur: styleOptions.shadowBlur,
        shadowX: styleOptions.shadowX,
        shadowY: styleOptions.shadowY
      };

      await loadFonts([{ name: fontInfo.fontFamily, url: fontInfo.fontUrl }]);
      const captions = generateCaptions(
        { ...jsonData, sourceUrl: mediaSrc },
        fontInfo,
        options
      );

      console.log({ captions });

      dispatch(ADD_ITEMS, {
        payload: {
          trackItems: captions,
          tracks: [
            {
              id: generateId(),
              items: captions.map((item) => item.id),
              type: "caption",
              name: "Captions"
            }
          ]
        }
      });
    } catch (error) {
      console.error("Error generating captions:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const applyStyleToSelectedMediaCaptions = () => {
    if (!selectedMedia) return;
    const captions = getCaptionItemsForMediaSelection(
      selectedMedia,
      selectMediaItems,
      captionTrackItemsMap
    );
    if (!captions.length) return;

    const payload = captions.reduce<Record<string, any>>((acc, item) => {
      acc[item.id] = {
        details: {
          color: styleOptions.textColor,
          fontSize: styleOptions.fontSize,
          fontFamily: styleOptions.fontFamily,
          fontUrl: styleOptions.fontUrl,
          boxShadow: {
            x: styleOptions.shadowX,
            y: styleOptions.shadowY,
            blur: styleOptions.shadowBlur,
            color: styleOptions.shadowColor
          }
        }
      };
      return acc;
    }, {});

    dispatch(EDIT_OBJECT, { payload });
  };

  const handlePresetChange = (presetKey: CaptionStylePresetKey) => {
    setStyleOptions((prev) => ({
      ...prev,
      ...getCaptionStylePreset(presetKey),
      preset: presetKey
    }));
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {mediaTrackItems.length === 0 ? (
        <EmptyMediaTrackItems />
      ) : (
        <MediaSection
          selectMediaItems={selectMediaItems}
          selectedMedia={selectedMedia}
          onSelectChange={handleSelectChange}
          captionTrackItemsMap={captionTrackItemsMap}
          createCaptions={createCaptions}
          isGenerating={isGenerating}
          styleOptions={styleOptions}
          onStyleOptionsChange={setStyleOptions}
          onPresetChange={handlePresetChange}
          applyStyleToSelectedMediaCaptions={applyStyleToSelectedMediaCaptions}
        />
      )}
    </div>
  );
};

const MediaSection = ({
  selectMediaItems,
  selectedMedia,
  onSelectChange,
  captionTrackItemsMap,
  createCaptions,
  isGenerating,
  styleOptions,
  onStyleOptionsChange,
  onPresetChange,
  applyStyleToSelectedMediaCaptions
}: {
  selectMediaItems: MediaSelectItem[];
  selectedMedia: string | undefined;
  onSelectChange: (value: string) => void;
  captionTrackItemsMap: Record<string, ITrackItem[]>;
  createCaptions: (selectedMedia: string) => void;
  isGenerating: boolean;
  styleOptions: CaptionStyleOptions;
  onStyleOptionsChange: React.Dispatch<React.SetStateAction<CaptionStyleOptions>>;
  onPresetChange: (preset: CaptionStylePresetKey) => void;
  applyStyleToSelectedMediaCaptions: () => void;
}) => {
  const selectedCaptionItems = useMemo(
    () =>
      selectedMedia
        ? getCaptionItemsForMediaSelection(
            selectedMedia,
            selectMediaItems,
            captionTrackItemsMap
          )
        : [],
    [captionTrackItemsMap, selectMediaItems, selectedMedia]
  );

  return (
    <div className="flex h-[calc(100%-4.5rem)] flex-col gap-4 px-4">
      <Select value={selectedMedia} onValueChange={onSelectChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select media" />
        </SelectTrigger>
        <SelectContent className="z-[200]">
          {selectMediaItems.map((item) => (
            <SelectItem value={item.value} key={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CaptionStylePanel
        styleOptions={styleOptions}
        onStyleOptionsChange={onStyleOptionsChange}
        onPresetChange={onPresetChange}
        onApplyStyle={applyStyleToSelectedMediaCaptions}
        hasExistingCaptions={selectedCaptionItems.length > 0}
      />

      {selectedMedia ? (
        selectedCaptionItems.length > 0 ? (
          <div className="h-[calc(100vh-29rem)]">
            <ScrollArea className="h-full">
              <MediaWithCaptions captionTrackItems={selectedCaptionItems} />
            </ScrollArea>
          </div>
        ) : (
          <MediaWithNoCaptions
            createCaptions={() => createCaptions(selectedMedia)}
            isGenerating={isGenerating}
          />
        )
      ) : (
        <MediaNoSelected />
      )}
    </div>
  );
};

const MediaNoSelected = () => (
  <div className="text-center text-sm text-muted-foreground">
    Select video or audio and generate captions automatically.
  </div>
);

const EmptyMediaTrackItems = () => (
  <div className="text-center text-sm text-muted-foreground">
    Add video or audio and generate captions automatically.
  </div>
);

const MediaWithNoCaptions = ({
  createCaptions,
  isGenerating
}: {
  createCaptions: () => void;
  isGenerating: boolean;
}) => (
  <div className="flex flex-col gap-2 px-4">
    <div className="text-center text-sm text-muted-foreground">
      Recognize speech in the selected video/audio and generate captions
      automatically.
    </div>
    <Button
      onClick={createCaptions}
      variant="default"
      className="w-full"
      disabled={isGenerating}
    >
      {isGenerating ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        "Generate"
      )}
    </Button>
  </div>
);

const MediaWithCaptions = ({
  captionTrackItems
}: {
  captionTrackItems: ITrackItem[];
}) => {
  const playerRef = useStore((state) => state.playerRef);
  const fps = useStore((state) => state.fps);
  const currentFrame = useCurrentPlayerFrame(playerRef || null);
  const currentTimeMs = (currentFrame / fps) * 1000;

  return (
    <div className="flex flex-col gap-2">
      {captionTrackItems.map((item) => (
        <MemoizedCaptionItem
          isActive={
            currentTimeMs >= item.display.from && currentTimeMs <= item.display.to
          }
          key={item.id}
          item={item}
        />
      ))}
    </div>
  );
};
const CaptionItem = ({
  item,
  isActive
}: {
  item: ITrackItem;
  isActive?: boolean;
}) => {
  const { display, details } = item;
  const handleSeek = useCallback((time: number) => {
    dispatch(PLAYER_SEEK, { payload: { time: time } });
  }, []);

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg p-2 hover:cursor-pointer hover:bg-slate-900 ${
        isActive
          ? "bg-captions-background text-captions-text"
          : "text-muted-foreground"
      }`}
      onClick={() => handleSeek(display.from)}
    >
      <div className="flex flex-col gap-1">
        <div className="text-xs">
          {millisecondsToHHMMSS(display.from)} -{" "}
          {millisecondsToHHMMSS(display.to)}
        </div>
        <div className="text-sm">{details.text}</div>
      </div>
    </div>
  );
};

const MemoizedCaptionItem = memo(
  CaptionItem,
  (prev, next) => prev.item === next.item && prev.isActive === next.isActive
);
// Helper functions
const fetchMediaTrackItems = (trackItemsMap: ITrackItemsMap) => {
  return Object.values(trackItemsMap).filter(
    ({ type }: ITrackItem) => type === "audio" || type === "video"
  );
};

const createSelectMediaOptions = (mediaTrackItems: ITrackItem[]) => {
  const duplicateCounts = mediaTrackItems.reduce<Record<string, number>>((acc, item) => {
    const mediaSrc = String(item.details?.src || "");
    acc[mediaSrc] = (acc[mediaSrc] || 0) + 1;
    return acc;
  }, {});

  return mediaTrackItems.map((item) => {
    const mediaSrc = String(item.details?.src || "");
    const isDuplicateSource = duplicateCounts[mediaSrc] > 1;

    return {
      label: isDuplicateSource
        ? `${item.name} (${millisecondsToHHMMSS(item.display.from)})`
        : item.name,
      value: item.id,
      mediaSrc
    };
  });
};

const getCaptionItemsForMediaSelection = (
  selectedMediaId: string,
  selectMediaItems: MediaSelectItem[],
  captionTrackItemsMap: Record<string, ITrackItem[]>
) => {
  const selectedMediaItem = selectMediaItems.find((item) => item.value === selectedMediaId);

  return (
    captionTrackItemsMap[selectedMediaId] ||
    (selectedMediaItem?.mediaSrc
      ? captionTrackItemsMap[selectedMediaItem.mediaSrc]
      : undefined) ||
    []
  );
};

const groupCaptionItems = (trackItemsMap: ITrackItemsMap) => {
  const captionTrackItems = Object.values(trackItemsMap).filter(
    ({ type }: ITrackItem) => type === "caption"
  );
  const groupedCaptions = captionTrackItems.reduce<Record<string, ITrackItem[]>>(
    (acc, item) => {
      const parentId = String((item as any)?.metadata?.parentId || "");
      const sourceUrl = String((item as any)?.metadata?.sourceUrl || "");
      const groupKey = parentId || sourceUrl;

      if (!groupKey) return acc;

      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }

      acc[groupKey].push(item);
      return acc;
    },
    {}
  );

  for (const key of Object.keys(groupedCaptions)) {
    groupedCaptions[key] = [...groupedCaptions[key]].sort(
      (a, b) => a.display.from - b.display.from
    );
  }

  return groupedCaptions;
};

async function transcribeMedia(
  mediaUrl: string,
  targetLanguage: string
): Promise<{
  sourceUrl: string;
  results: { main: { words: Array<{ word: string; start: number; end: number; confidence: number }> } };
}> {
  try {
    const transcribeResponse = await fetch("/api/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: mediaUrl,
        targetLanguage
      })
    });

    if (!transcribeResponse.ok) {
      const errorPayload = await transcribeResponse
        .json()
        .catch(() => null as { message?: string } | null);
      throw new Error(
        errorPayload?.message ||
          `Failed to initiate transcription (${transcribeResponse.status}).`
      );
    }

    return await transcribeResponse.json();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Failed to reach /api/transcribe. Check if the Next dev server and the backend at http://127.0.0.1:8000 are running."
      );
    }

    throw error;
  }
}

const CaptionStylePanel = ({
  styleOptions,
  onStyleOptionsChange,
  onPresetChange,
  onApplyStyle,
  hasExistingCaptions
}: {
  styleOptions: CaptionStyleOptions;
  onStyleOptionsChange: React.Dispatch<React.SetStateAction<CaptionStyleOptions>>;
  onPresetChange: (preset: CaptionStylePresetKey) => void;
  onApplyStyle: () => void;
  hasExistingCaptions: boolean;
}) => {
  return (
    <div className="rounded-lg border border-white/10 bg-background/60 p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Caption style</div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={styleOptions.preset} onValueChange={(value) => onPresetChange(value as CaptionStylePresetKey)}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Preset" />
          </SelectTrigger>
          <SelectContent className="z-[220]">
            <SelectItem value="classic">Classic</SelectItem>
            <SelectItem value="bold">Bold</SelectItem>
            <SelectItem value="clean">Clean</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          value={styleOptions.fontSize}
          min={24}
          max={140}
          onChange={(event) =>
            onStyleOptionsChange((prev) => ({
              ...prev,
              fontSize: Number(event.target.value || prev.fontSize)
            }))
          }
          className="h-9"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Text</Label>
          <Input
            type="color"
            value={styleOptions.textColor}
            onChange={(event) =>
              onStyleOptionsChange((prev) => ({ ...prev, textColor: event.target.value }))
            }
            className="h-8 w-full p-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Shadow</Label>
          <Input
            type="color"
            value={styleOptions.shadowColor}
            onChange={(event) =>
              onStyleOptionsChange((prev) => ({ ...prev, shadowColor: event.target.value }))
            }
            className="h-8 w-full p-1"
          />
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-xs">Sync offset (ms)</Label>
        <Input
          type="number"
          value={styleOptions.syncOffsetMs}
          min={-800}
          max={800}
          onChange={(event) =>
            onStyleOptionsChange((prev) => ({
              ...prev,
              syncOffsetMs: Number(event.target.value || 0)
            }))
          }
          className="mt-1 h-8"
        />
      </div>

      {hasExistingCaptions && (
        <Button variant="outline" className="mt-3 w-full" onClick={onApplyStyle}>
          Apply style to existing captions
        </Button>
      )}
    </div>
  );
};

const CAPTION_STYLE_PRESETS: Record<CaptionStylePresetKey, Omit<CaptionStyleOptions, "syncOffsetMs" | "preset">> = {
  classic: {
    fontFamily: "theboldfont",
    fontUrl: "https://cdn.designcombo.dev/fonts/the-bold-font.ttf",
    fontSize: 64,
    textColor: "#DADADA",
    shadowColor: "#000000",
    shadowBlur: 4,
    shadowX: 0,
    shadowY: 2
  },
  bold: {
    fontFamily: "Bebas Neue",
    fontUrl: "https://cdn.designcombo.dev/fonts/bebas-neue-regular.ttf",
    fontSize: 72,
    textColor: "#FFFFFF",
    shadowColor: "#0EA5E9",
    shadowBlur: 8,
    shadowX: 0,
    shadowY: 3
  },
  clean: {
    fontFamily: "Inter",
    fontUrl: "https://cdn.designcombo.dev/fonts/inter.ttf",
    fontSize: 58,
    textColor: "#F8FAFC",
    shadowColor: "#020617",
    shadowBlur: 3,
    shadowX: 0,
    shadowY: 1
  }
};

function getCaptionStylePreset(preset: CaptionStylePresetKey) {
  return CAPTION_STYLE_PRESETS[preset] || CAPTION_STYLE_PRESETS.classic;
}
