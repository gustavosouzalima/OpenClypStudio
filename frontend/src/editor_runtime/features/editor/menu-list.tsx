import { memo, useCallback } from "react";
import useLayoutStore from "./store/use-layout-store";
import { Icons } from "@/editor_runtime/components/shared/icons";
import { cn } from "@/editor_runtime/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/editor_runtime/components/ui/tooltip";

// Define menu items configuration for better maintainability
const MENU_ITEMS = [
  {
    id: "uploads",
    icon: Icons.upload,
    label: "Uploads",
    ariaLabel: "Add and manage uploads"
  },
  {
    id: "texts",
    icon: Icons.type,
    label: "Texts",
    ariaLabel: "Add and edit text elements"
  },
  {
    id: "videos",
    icon: Icons.video,
    label: "Videos",
    ariaLabel: "Add and manage video content"
  },
  {
    id: "captions",
    icon: Icons.captions,
    label: "Captions",
    ariaLabel: "Add and edit captions"
  },
  {
    id: "images",
    icon: Icons.image,
    label: "Images",
    ariaLabel: "Add and manage images"
  },
  {
    id: "animations",
    icon: Icons.animation,
    label: "Animations",
    ariaLabel: "Browse and apply animations"
  },
  {
    id: "audios",
    icon: Icons.audio,
    label: "Audio",
    ariaLabel: "Add and manage audio content"
  },
  {
    id: "transitions",
    icon: Icons.transition, // Custom SVG for transitions
    label: "Transitions",
    ariaLabel: "Add transition effects"
  },
  {
    id: "ai-voice",
    icon: Icons.volume,
    label: "AI Voice",
    ariaLabel: "Generate AI voice from text"
  },
  {
    id: "sfx",
    icon: Icons.sfx,
    label: "SFX",
    ariaLabel: "Generate SFX from text"
  }
] as const;

// Memoized menu button component for better performance
const MenuButton = memo<{
  item: (typeof MENU_ITEMS)[number];
  isActive: boolean;
  onClick: (menuItem: string) => void;
}>(({ item, isActive, onClick }) => {
  const handleClick = useCallback(() => {
    onClick(item.id);
  }, [item.id, onClick]);

  const IconComponent = item.icon;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group relative flex w-full min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2.5 text-center transition-all duration-[var(--editor-duration-fast)] active:scale-[0.96]",
        isActive
          ? "border-[var(--editor-accent)]/30 bg-[linear-gradient(180deg,rgba(56,189,248,0.18),rgba(56,189,248,0.04))] text-white shadow-[var(--editor-shadow-glow)]"
          : "border-transparent text-[var(--editor-text-secondary)] hover:border-[var(--editor-border)] hover:bg-[var(--editor-bg-hover)] hover:text-white"
      )}
      aria-label={item.ariaLabel}
    >
      {isActive && (
        <span className="absolute inset-x-3 top-0 h-px bg-[var(--editor-accent)]" />
      )}
      <Tooltip delayDuration={10}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-200",
              isActive
                ? "border-[var(--editor-accent)]/35 bg-[var(--editor-accent-dim)] text-[var(--editor-accent)]"
                : "border-[var(--editor-border)] bg-black/20 text-[var(--editor-text-secondary)] group-hover:border-[var(--editor-accent)]/20 group-hover:bg-[var(--editor-bg-hover)]"
            )}
          >
            <IconComponent width={20} height={20} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" align="center" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
      <span
        className={cn(
          "max-w-full break-words text-[10px] font-medium leading-tight tracking-[0.01em]",
          isActive ? "text-[var(--editor-text-primary)]" : "text-[var(--editor-text-secondary)] group-hover:text-[var(--editor-text-primary)]"
        )}
      >
        {item.label}
      </span>
    </button>
  );
});

MenuButton.displayName = "MenuButton";

// Main MenuList component
function MenuList() {
  const {
    setActiveMenuItem,
    setShowMenuItem,
    activeMenuItem,
    showMenuItem
  } = useLayoutStore();

  const handleMenuItemClick = useCallback(
    (menuItem: string) => {
      const isSameItem = activeMenuItem === menuItem;
      if (isSameItem && showMenuItem) {
        setShowMenuItem(false);
        return;
      }
      setActiveMenuItem(menuItem as any);
      setShowMenuItem(true);
    },
    [activeMenuItem, showMenuItem, setActiveMenuItem, setShowMenuItem]
  );

  return (
    <div className="flex h-full w-full min-w-0 flex-col items-center overflow-x-hidden px-1.5 py-3" style={{ background: 'radial-gradient(circle at top, var(--editor-bg-elevated) 42%, var(--editor-bg-deep) 100%)' }}>
      <div className="mb-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--editor-accent)]/20 bg-[var(--editor-accent-dim)] text-[var(--editor-accent)] shadow-[var(--editor-shadow-glow)]">
        <Icons.logo width={26} height={20} />
      </div>
      <div className="flex-1 w-full min-w-0 space-y-1.5 overflow-x-hidden overflow-y-auto">
        {MENU_ITEMS.map((item) => {
          const isActive = showMenuItem && activeMenuItem === item.id;
          return (
            <MenuButton
              key={item.id}
              item={item}
              isActive={isActive}
              onClick={handleMenuItemClick}
            />
          );
        })}
      </div>
    </div>
  );
}

export default memo(MenuList);
