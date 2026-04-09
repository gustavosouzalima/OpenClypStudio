import { ICompactFont, IFont } from "../interfaces/editor";
import useDataState from "../store/use-data-state";
import { getCompactFontData } from "./fonts";

type FontCatalog = {
  fonts: IFont[];
  compactFonts: ICompactFont[];
};

let fontCatalogPromise: Promise<FontCatalog> | null = null;

const loadFontCatalog = async (): Promise<FontCatalog> => {
  const { FONTS } = await import("../data/fonts");

  return {
    fonts: FONTS,
    compactFonts: getCompactFontData(FONTS)
  };
};

export const ensureEditorFontCatalog = async (): Promise<FontCatalog> => {
  const state = useDataState.getState();
  if (state.fonts.length > 0 && state.compactFonts.length > 0) {
    return {
      fonts: state.fonts,
      compactFonts: state.compactFonts
    };
  }

  if (!fontCatalogPromise) {
    fontCatalogPromise = loadFontCatalog().finally(() => {
      fontCatalogPromise = null;
    });
  }

  const catalog = await fontCatalogPromise;
  const nextState = useDataState.getState();

  if (nextState.fonts.length === 0) {
    nextState.setFonts(catalog.fonts);
  }
  if (nextState.compactFonts.length === 0) {
    nextState.setCompactFonts(catalog.compactFonts);
  }

  return catalog;
};
