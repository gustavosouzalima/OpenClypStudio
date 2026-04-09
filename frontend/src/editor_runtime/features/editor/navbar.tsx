import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/editor_runtime/components/ui/button";
import { dispatch } from "@designcombo/events";
import { HISTORY_UNDO, HISTORY_REDO, DESIGN_RESIZE } from "@designcombo/state";
import { Icons } from "@/editor_runtime/components/shared/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/editor_runtime/components/ui/popover";
import {
  ChevronDown,
  Download,
  Keyboard,
  ProportionsIcon,
  Save,
  CheckCircle2,
  AlertCircle,
  ShareIcon,
  ArrowLeft
} from "lucide-react";
import { Label } from "@/editor_runtime/components/ui/label";

import type StateManager from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import type { IDesign } from "@designcombo/types";
import { useDownloadState } from "./store/use-download-state";
import DownloadProgressModal from "./download-progress-modal";
import AutosizeInput from "@/editor_runtime/components/ui/autosize-input";
import { debounce } from "lodash";
import {
  useIsLargeScreen,
  useIsMediumScreen,
  useIsSmallScreen
} from "@/editor_runtime/hooks/use-media-query";

import { LogoIcons } from "@/editor_runtime/components/shared/logos";
import Link from "next/link";
import { ShortcutsModal } from "./shortcuts-modal";
import { ModeToggle } from "@/editor_runtime/components/ui/mode-toggle";

const toolbarButtonClassName =
  "h-8 rounded-xl border border-[var(--editor-border)] bg-[var(--editor-bg-surface)] text-[var(--editor-text-secondary)] shadow-[var(--editor-shadow-sm)] transition-all duration-[var(--editor-duration-fast)] hover:border-[var(--editor-border-focus)] hover:bg-[var(--editor-bg-hover)] hover:text-[var(--editor-text-primary)]";

const iconToolbarButtonClassName = `${toolbarButtonClassName} w-8 px-0`;

const toolbarGroupClassName =
  "pointer-events-auto flex h-10 items-center gap-2 rounded-2xl border border-[var(--editor-border-subtle)] bg-[var(--editor-bg-base)]/72 px-2.5";

export default function Navbar({
  user,
  stateManager,
  setProjectName,
  projectName,
  onSave,
  saveStatus
}: {
  user: any | null;
  stateManager: StateManager;
  setProjectName: (name: string) => void;
  projectName: string;
  onSave: () => void;
  saveStatus: "saved" | "unsaved" | "saving" | "error";
}) {
  const [title, setTitle] = useState(projectName);
  const isLargeScreen = useIsLargeScreen();
  const isMediumScreen = useIsMediumScreen();
  const isSmallScreen = useIsSmallScreen();
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  const saveButtonMeta = {
    saved: {
      label: "Saved",
      icon: CheckCircle2,
      className:
        "border-[var(--editor-success)]/30 text-[var(--editor-success)]"
    },
    unsaved: {
      label: "Save",
      icon: Save,
      className: "border-[var(--editor-border)] text-[var(--editor-text-primary)]"
    },
    saving: {
      label: "Saving...",
      icon: Save,
      className: "border-[var(--editor-accent)]/30 text-[var(--editor-accent)] animate-pulse"
    },
    error: {
      label: "Retry Save",
      icon: AlertCircle,
      className: "border-[var(--editor-error)]/30 text-[var(--editor-error)]"
    }
  }[saveStatus];
  const SaveIcon = saveButtonMeta.icon;

  const handleUndo = () => {
    dispatch(HISTORY_UNDO);
  };

  const handleRedo = () => {
    dispatch(HISTORY_REDO);
  };

  const handleCreateProject = async () => {};

  // Create a debounced function for setting the project name
  const debouncedSetProjectName = useCallback(
    debounce((name: string) => {
      console.log("Debounced setProjectName:", name);
      setProjectName(name);
    }, 2000), // 2 seconds delay
    []
  );

  // Update the debounced function whenever the title changes
  useEffect(() => {
    debouncedSetProjectName(title);
  }, [title, debouncedSetProjectName]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isLargeScreen ? "320px 1fr 320px" : "1fr 1fr 1fr",
        backgroundColor: "var(--editor-bg-elevated)",
        borderBottom: "1px solid var(--editor-border)"
      }}
      className="pointer-events-none flex h-13 items-center px-2"
    >
      <DownloadProgressModal />

      <div className="flex items-center gap-2">
        <Link href="/projects" className="pointer-events-auto">
          <Button
            variant="outline"
            size="sm"
            className={`${toolbarButtonClassName} gap-1.5 px-3`}
          >
            <ArrowLeft className="size-4" />
            <span className="hidden md:block">Exit Editor</span>
          </Button>
        </Link>
        <div className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-bg-base)] shadow-[var(--editor-shadow-sm)] invert dark:invert-0">
          <LogoIcons.scenify />
        </div>

        <div className={toolbarGroupClassName}>
          <Button
            onClick={handleUndo}
            className={iconToolbarButtonClassName}
            variant="outline"
            size="icon"
          >
            <Icons.undo width={20} />
          </Button>
          <Button
            onClick={handleRedo}
            className={iconToolbarButtonClassName}
            variant="outline"
            size="icon"
          >
            <Icons.redo width={20} />
          </Button>
        </div>
      </div>

      <div className="flex h-13 items-center justify-center gap-2">
        {!isSmallScreen && (
          <div className={`${toolbarGroupClassName} min-w-[220px] justify-center`}>
            <AutosizeInput
              name="title"
              value={title}
              onChange={handleTitleChange}
              width={200}
              inputClassName="border-none bg-transparent px-1 text-sm font-medium text-[var(--editor-text-primary)] outline-none placeholder:text-[var(--editor-text-muted)]"
            />
          </div>
        )}
      </div>

      <div className="flex h-13 items-center justify-end gap-2">
        <div className={toolbarGroupClassName}>
          <Button
            variant="outline"
            size="icon"
            className={iconToolbarButtonClassName}
            onClick={() => setIsShortcutsModalOpen(true)}
          >
            <Keyboard className="size-5" />
          </Button>
          <ModeToggle />
          <ResizeVideo stateManager={stateManager} />
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={saveStatus === "saving"}
            className={`h-8 gap-2 rounded-xl bg-[var(--editor-bg-surface)] shadow-[var(--editor-shadow-sm)] hover:bg-[var(--editor-bg-hover)] ${saveButtonMeta.className}`}
          >
            <SaveIcon className="size-4" />
            <span>{saveButtonMeta.label}</span>
          </Button>

          {/* <Button
            className="flex h-8 gap-1 border border-border"
            variant="outline"
            size={isMediumScreen ? "sm" : "icon"}
          >
            <ShareIcon width={18} />{" "}
            <span className="hidden md:block">Share</span>
          </Button> */}

          <DownloadPopover stateManager={stateManager} />
        </div>
      </div>
      <ShortcutsModal
        open={isShortcutsModalOpen}
        onOpenChange={setIsShortcutsModalOpen}
      />
    </div>
  );
}

const DownloadPopover = ({ stateManager }: { stateManager: StateManager }) => {
  const isMediumScreen = useIsMediumScreen();
  const { actions, exportType } = useDownloadState();
  const [isExportTypeOpen, setIsExportTypeOpen] = useState(false);
  const [open, setOpen] = useState(false);

  const handleExport = () => {
    const data: IDesign = {
      id: generateId(),
      ...stateManager.toJSON()
    };

    console.log({ data });

    actions.setState({ payload: data });
    actions.startExport();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className={`${toolbarButtonClassName} flex gap-1 px-3`}
          size={isMediumScreen ? "sm" : "icon"}
        >
          {/* <Download width={18} />{" "} */}
          <span className="hidden md:block">Download</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="z-[250] flex w-60 flex-col gap-4 border-[var(--editor-border)] bg-[var(--editor-bg-elevated)] text-[var(--editor-text-primary)] shadow-[var(--editor-shadow-lg)]"
      >
        <Label className="text-[var(--editor-text-primary)]">Export settings</Label>

        <Popover open={isExportTypeOpen} onOpenChange={setIsExportTypeOpen}>
          <PopoverTrigger asChild>
            <Button className={`${toolbarButtonClassName} w-full justify-between`} variant="outline">
              <div>{exportType.toUpperCase()}</div>
              <ChevronDown width={16} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="z-[251] w-[--radix-popover-trigger-width] border-[var(--editor-border)] bg-[var(--editor-bg-surface)] px-2 py-2 text-[var(--editor-text-primary)]">
            <div
              className="flex h-8 items-center rounded-lg px-3 text-sm text-[var(--editor-text-secondary)] transition-colors hover:cursor-pointer hover:bg-[var(--editor-bg-hover)] hover:text-[var(--editor-text-primary)]"
              onClick={() => {
                actions.setExportType("mp4");
                setIsExportTypeOpen(false);
              }}
            >
              MP4
            </div>
            <div
              className="flex h-8 items-center rounded-lg px-3 text-sm text-[var(--editor-text-secondary)] transition-colors hover:cursor-pointer hover:bg-[var(--editor-bg-hover)] hover:text-[var(--editor-text-primary)]"
              onClick={() => {
                actions.setExportType("json");
                setIsExportTypeOpen(false);
              }}
            >
              JSON
            </div>
          </PopoverContent>
        </Popover>

        <div>
          <Button
            onClick={handleExport}
            className="w-full rounded-xl bg-[var(--editor-accent)] text-slate-950 shadow-[var(--editor-shadow-glow)] hover:bg-[var(--editor-accent-hover)]"
          >
            Export
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface ResizeOptionProps {
  label: string;
  icon: string;
  value: ResizeValue;
  description: string;
}

interface ResizeValue {
  width: number;
  height: number;
  name: string;
}

const RESIZE_OPTIONS: ResizeOptionProps[] = [
  {
    label: "16:9",
    icon: "landscape",
    description: "YouTube ads",
    value: {
      width: 1920,
      height: 1080,
      name: "16:9"
    }
  },
  {
    label: "9:16",
    icon: "portrait",
    description: "TikTok, YouTube Shorts",
    value: {
      width: 1080,
      height: 1920,
      name: "9:16"
    }
  },
  {
    label: "1:1",
    icon: "square",
    description: "Instagram, Facebook posts",
    value: {
      width: 1080,
      height: 1080,
      name: "1:1"
    }
  }
];

const ResizeVideo = ({ stateManager }: { stateManager: StateManager }) => {
  const initialSize = stateManager.toJSON().size;
  const originalSizeRef = useRef<ResizeValue>({
    width: initialSize.width,
    height: initialSize.height,
    name: "Original"
  });
  const [activePreset, setActivePreset] = useState<string>("Original");

  const resizeOptions: ResizeOptionProps[] = [
    {
      label: "Original",
      icon: "square",
      description: "Proporção de tela original",
      value: originalSizeRef.current
    },
    {
      label: "16:9",
      icon: "landscape",
      description: "Anúncios do YouTube",
      value: {
        width: 1920,
        height: 1080,
        name: "16:9"
      }
    },
    {
      label: "4:3",
      icon: "landscape",
      description: "LinkedIn e Facebook",
      value: {
        width: 1440,
        height: 1080,
        name: "4:3"
      }
    },
    {
      label: "2:1",
      icon: "landscape",
      description: "Panorâmico",
      value: {
        width: 2000,
        height: 1000,
        name: "2:1"
      }
    },
    {
      label: "9:16",
      icon: "portrait",
      description: "TikTok e Stories",
      value: {
        width: 1080,
        height: 1920,
        name: "9:16"
      }
    },
    {
      label: "1:1",
      icon: "square",
      description: "Publicações do Instagram",
      value: {
        width: 1080,
        height: 1080,
        name: "1:1"
      }
    },
    {
      label: "3:4",
      icon: "portrait",
      description: "Retrato clássico",
      value: {
        width: 1080,
        height: 1440,
        name: "3:4"
      }
    }
  ];

  const handleResize = (options: ResizeValue) => {
    dispatch(DESIGN_RESIZE, {
      payload: {
        ...options
      }
    });
      setActivePreset(options.name);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={`${toolbarButtonClassName} z-10 h-8 gap-2 px-3`}
          variant="outline"
          size={"sm"}
        >
          <ProportionsIcon className="h-4 w-4" />
          <div>{activePreset}</div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[250] w-60 border-[var(--editor-border)] bg-[var(--editor-bg-elevated)] px-2.5 py-3 text-[var(--editor-text-primary)] shadow-[var(--editor-shadow-lg)]">
        <div className="text-sm">
          {resizeOptions.map((option, index) => (
            <ResizeOption
              key={index}
              label={option.label}
              icon={option.icon}
              value={option.value}
              handleResize={handleResize}
              description={option.description}
              isActive={activePreset === option.label}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ResizeOption = ({
  label,
  icon,
  value,
  description,
  handleResize,
  isActive
}: ResizeOptionProps & {
  handleResize: (payload: ResizeValue) => void;
  isActive?: boolean;
}) => {
  const Icon = Icons[icon as "text"];
  return (
    <div
      onClick={() => handleResize(value)}
      className={`flex cursor-pointer items-center rounded-xl border p-2.5 transition-all duration-[var(--editor-duration-fast)] ${
        isActive
          ? "border-[var(--editor-border-accent)] bg-[var(--editor-accent-dim)]"
          : "border-transparent hover:border-[var(--editor-border)] hover:bg-[var(--editor-bg-hover)]"
      }`}
    >
      <div className="w-8 text-[var(--editor-text-secondary)]">
        <Icon size={20} />
      </div>
      <div>
        <div className="text-[var(--editor-text-primary)]">{label}</div>
        <div className="text-xs text-[var(--editor-text-secondary)]">{description}</div>
      </div>
    </div>
  );
};
