import { ScrollArea } from "@/editor_runtime/components/ui/scroll-area";
import { dispatch } from "@designcombo/events";
import { ADD_AUDIO } from "@designcombo/state";
import { IAudio } from "@designcombo/types";
import { Loader2, Music, Music2, Search } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { generateId } from "@designcombo/timeline";
import { Button } from "@/editor_runtime/components/ui/button";
import { Input } from "@/editor_runtime/components/ui/input";
import { debounce } from "lodash";
import { AudioItem } from "./audio-item";
import { useParams } from "next/navigation";

type PixelVideo = {
  id: string;
  title?: string;
  source_url?: string;
  local_path?: string;
  status?: string;
};

type PixelProject = {
  id: string;
  videos?: PixelVideo[];
};

type SoundSearchResult = {
  id: number;
  name: string;
  previewUrl?: string;
  downloadUrl?: string;
  duration?: number;
  username?: string;
};

const AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
  ".opus",
  ".wma"
];

function isAudioVideo(video: PixelVideo) {
  const source =
    `${video.title || ""} ${video.local_path || ""} ${video.source_url || ""}`.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => source.includes(ext));
}

export const Audios = () => {
  const params = useParams<{ id?: string | string[] }>();
  const projectId = useMemo(() => {
    const value = params?.id;
    if (!value) return "";
    return Array.isArray(value) ? value[0] : value;
  }, [params]);

  const [activeTab, setActiveTab] = useState<"uploads" | "stock">("uploads");
  const [stockType, setStockType] = useState<"songs" | "effects">("songs");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [searchResults, setSearchResults] = useState<Partial<IAudio>[]>([]);
  const [isMoreLoading, setIsMoreLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Partial<IAudio>[]>([]);
  const [isLoadingUploads, setIsLoadingUploads] = useState(false);
  const [uploadsError, setUploadsError] = useState<string | null>(null);

  const fetchStock = async (
    query: string,
    pageNumber: number = 1,
    type: "songs" | "effects" = stockType
  ) => {
    if (pageNumber === 1) {
      setIsLoadingStock(true);
    } else {
      setIsMoreLoading(true);
    }

    try {
      const params = new URLSearchParams({
        page: String(pageNumber),
        page_size: "30",
        type,
        sort: query ? "score" : "downloads"
      });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/sounds/search?${params.toString()}`);

      const data = await response.json();

      if (Array.isArray(data.results)) {
        const mappedMusics: Partial<IAudio>[] = (data.results as SoundSearchResult[])
          .filter((music) => !!(music.previewUrl || music.downloadUrl))
          .map((music) => ({
            id: `stock-${music.id}`,
          details: {
            src: music.previewUrl || music.downloadUrl || ""
          },
          name: music.name,
          type: "audio",
          metadata: {
            author: music.username || "Stock audio",
            duration: music.duration || 0
          }
        }));

        if (pageNumber === 1) {
          setSearchResults(mappedMusics);
        } else {
          setSearchResults((prev) => [...prev, ...mappedMusics]);
        }

        setHasMore(Boolean(data.next));
      } else {
        if (pageNumber === 1) {
          setSearchResults([]);
        }
        setHasMore(false);
      }
    } catch (error) {
      console.error("Failed to fetch stock audio:", error);
      if (pageNumber === 1) {
        setSearchResults([]);
      }
      setHasMore(false);
    } finally {
      setIsLoadingStock(false);
      setIsMoreLoading(false);
    }
  };

  const debouncedFetch = useCallback(
    debounce((query: string) => {
      setPage(1);
      fetchStock(query, 1, stockType);
    }, 500),
    [stockType]
  );

  useEffect(() => {
    fetchStock("", 1, stockType);
  }, [stockType]);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    const loadProjectUploads = async () => {
      setIsLoadingUploads(true);
      setUploadsError(null);
      try {
        const response = await fetch(`/api/pixel/projects/${projectId}`, {
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error(`Failed to load project uploads: ${response.status}`);
        }
        const project = (await response.json()) as PixelProject;
        if (cancelled) return;

        const audioVideos = (project.videos || []).filter(isAudioVideo);
        const mapped: Partial<IAudio>[] = audioVideos.map((video) => ({
          id: `project-${video.id}`,
          type: "audio",
          name: video.title || "Project audio",
          details: {
            src: `/api/pixel/projects/${projectId}/videos/${video.id}/media`
          },
          metadata: {
            pixelProjectId: projectId,
            pixelVideoId: video.id
          }
        }));

        setUploads(mapped);
      } catch (error) {
        console.error("Failed to load project audios:", error);
        if (!cancelled) {
          setUploads([]);
          setUploadsError("Could not load project audio uploads.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingUploads(false);
        }
      }
    };

    void loadProjectUploads();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleAddAudio = (payload: Partial<IAudio>) => {
    payload.id = generateId();
    dispatch(ADD_AUDIO, {
      payload,
      options: {}
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    debouncedFetch(query);
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchStock(searchQuery, nextPage, stockType);
  };

  const uniqueStockResults = Array.from(
    new Map(searchResults.map((item) => [item.id, item])).values()
  );
  const uniqueUploadResults = Array.from(
    new Map(uploads.map((item) => [item.id, item])).values()
  );

  return (
    <div className="flex flex-1 flex-col max-w-full h-full">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Button
          size="sm"
          variant={activeTab === "uploads" ? "secondary" : "outline"}
          onClick={() => setActiveTab("uploads")}
        >
          My uploads
        </Button>
        <Button
          size="sm"
          variant={activeTab === "stock" ? "secondary" : "outline"}
          onClick={() => setActiveTab("stock")}
        >
          Stock
        </Button>
      </div>

      {activeTab === "stock" && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <Button
            size="sm"
            variant={stockType === "songs" ? "secondary" : "outline"}
            onClick={() => {
              setStockType("songs");
              setPage(1);
            }}
          >
            Songs
          </Button>
          <Button
            size="sm"
            variant={stockType === "effects" ? "secondary" : "outline"}
            onClick={() => {
              setStockType("effects");
              setPage(1);
            }}
          >
            Audio/Effects
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 p-4">
        <div className="relative flex-1">
          <Button
            size="sm"
            variant="ghost"
            className="absolute left-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
            onClick={() => fetchStock(searchQuery)}
            disabled={isLoadingStock || activeTab !== "stock"}
          >
            {isLoadingStock ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
          </Button>
          <Input
            placeholder="Search stock audios..."
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                fetchStock(searchQuery);
              }
            }}
            className="pl-10"
            disabled={activeTab !== "stock"}
          />
        </div>
        {searchQuery && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSearchQuery("");
              setPage(1);
              fetchStock("", 1, stockType);
            }}
            disabled={isLoadingStock || activeTab !== "stock"}
          >
            Clear
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1  max-w-full px-4">
        {activeTab === "stock" && isLoadingStock && uniqueStockResults.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-muted-foreground" size={32} />
          </div>
        ) : activeTab === "uploads" && isLoadingUploads ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-muted-foreground" size={32} />
          </div>
        ) : activeTab === "uploads" && uploadsError ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <Music2 size={32} className="opacity-50" />
            <span className="text-sm">{uploadsError}</span>
          </div>
        ) : activeTab === "uploads" && uniqueUploadResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <Music2 size={32} className="opacity-50" />
            <span className="text-sm">No audio uploads in this project</span>
          </div>
        ) : activeTab === "stock" && uniqueStockResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <Music2 size={32} className="opacity-50" />
            <span className="text-sm">No music found</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {(activeTab === "uploads"
              ? uniqueUploadResults
              : uniqueStockResults
            ).map((audio, index) => (
              <AudioItem
                onAdd={handleAddAudio}
                item={audio}
                key={index}
                playingId={playingId}
                setPlayingId={setPlayingId}
              />
            ))}
          </div>
        )}

        {activeTab === "stock" && hasMore && uniqueStockResults.length > 0 && (
          <div className="py-4 flex justify-center">
            <Button
              onClick={loadMore}
              disabled={isMoreLoading}
              className="bg-primary/60 hover:bg-primary/80"
            >
              {isMoreLoading && <Loader2 className="animate-spin" size={12} />}
              Load More
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
