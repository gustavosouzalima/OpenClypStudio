import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/editor_runtime/components/ui/tabs";
import { dispatch } from "@designcombo/events";
import { ADD_ANIMATION } from "@designcombo/state";
import { presets } from "../player/animated";
import { PresetName } from "../player/animated/presets";
import useStore from "../store/use-store";
import { cn } from "@/editor_runtime/lib/utils";
import React from "react";

const panelClasses =
  "rounded-2xl border border-[var(--editor-border)] bg-[linear-gradient(180deg,var(--editor-bg-surface),rgba(10,14,22,0.94))] p-3 shadow-[var(--editor-shadow-md)] transition-all duration-[var(--editor-duration-fast)] hover:border-[var(--editor-border-focus)] hover:bg-[var(--editor-bg-hover)]";

const labelClasses =
  "text-xs font-medium text-[var(--editor-text-secondary)] transition-colors duration-[var(--editor-duration-fast)]";

const emptyStateClasses =
  "rounded-2xl border border-dashed border-[var(--editor-border)] bg-[var(--editor-bg-base)]/80 p-4 text-sm text-[var(--editor-text-secondary)]";

const PresetCard = ({
  presetKey,
  type,
  disabled
}: {
  presetKey: string;
  type: "in" | "out";
  disabled: boolean;
}) => {
  const preset = presets[presetKey as PresetName];

  const style = React.useMemo(
    () => ({
      backgroundImage: `url(${preset.previewUrl})`
    }),
    [preset.previewUrl]
  );

  const handleApply = () => {
    if (disabled) return;

    const presetAnimation = presets[presetKey as PresetName];
    const composition = presetKey.includes("rotate")
      ? [presetAnimation, presets.scaleIn]
      : [presetAnimation];

    dispatch(ADD_ANIMATION, {
      payload: {
        id: useStore.getState().activeIds[0],
        animations: {
          [type]: {
            name: presetKey,
            composition
          }
        }
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleApply}
      disabled={disabled}
      className={cn(
        "group text-left",
        disabled && "cursor-not-allowed opacity-55 saturate-0"
      )}
    >
      <div className={panelClasses}>
        <div
          style={style}
          className="mb-3 aspect-square w-full rounded-xl border border-white/8 bg-[var(--editor-bg-base)] bg-cover bg-center shadow-[var(--editor-shadow-sm)]"
        />
        <div className={cn(labelClasses, "text-[13px] text-[var(--editor-text-primary)] group-hover:text-white")}>
          {preset.name}
        </div>
        <div className={cn(labelClasses, "mt-1 uppercase tracking-[0.18em]")}>
          {type === "in" ? "Entrada" : "Saida"}
        </div>
      </div>
    </button>
  );
};

const PresetGrid = ({
  type,
  activeId
}: {
  type: "in" | "out";
  activeId?: string;
}) => {
  const filteredPresets = Object.keys(presets).filter((key) =>
    type === "in" ? key.includes("In") : key.includes("Out")
  );

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
      {filteredPresets.map((presetKey) => (
        <PresetCard
          key={presetKey}
          presetKey={presetKey}
          type={type}
          disabled={!activeId}
        />
      ))}
    </div>
  );
};

export const Animations = () => {
  const { activeIds, trackItemsMap } = useStore();
  const activeId = activeIds[0];
  const activeItem = activeId ? trackItemsMap[activeId] : null;

  return (
    <div className="flex flex-1 flex-col bg-[var(--editor-bg-base)]">
      <div className="border-b border-[var(--editor-border)] px-4 py-4">
        <div className="text-sm font-semibold text-[var(--editor-text-primary)]">
          Animations
        </div>
        <div className="mt-1 text-xs text-[var(--editor-text-secondary)]">
          {activeItem
            ? `Aplicando em ${activeItem.type}`
            : "Selecione um item na timeline para aplicar uma animacao."}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        <Tabs defaultValue="in" className="w-full gap-4">
          <TabsList className="grid w-full grid-cols-2 rounded-xl border border-[var(--editor-border)] bg-[var(--editor-bg-surface)] p-1">
            <TabsTrigger
              value="in"
              className="rounded-lg text-[var(--editor-text-secondary)] data-[state=active]:border-[var(--editor-border-accent)] data-[state=active]:bg-[var(--editor-accent-dim)] data-[state=active]:text-[var(--editor-text-primary)]"
            >
              In
            </TabsTrigger>
            <TabsTrigger
              value="out"
              className="rounded-lg text-[var(--editor-text-secondary)] data-[state=active]:border-[var(--editor-border-accent)] data-[state=active]:bg-[var(--editor-accent-dim)] data-[state=active]:text-[var(--editor-text-primary)]"
            >
              Out
            </TabsTrigger>
          </TabsList>

          {!activeItem && (
            <div className={emptyStateClasses}>
              O painel ja fica disponivel no menu esquerdo, mas a animacao so pode
              ser aplicada depois que um clip, texto, imagem ou caption estiver
              selecionado.
            </div>
          )}

          <TabsContent value="in">
            <PresetGrid type="in" activeId={activeId} />
          </TabsContent>
          <TabsContent value="out">
            <PresetGrid type="out" activeId={activeId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
