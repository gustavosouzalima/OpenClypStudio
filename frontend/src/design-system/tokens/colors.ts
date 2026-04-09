export const colors = {
  bg: "#0f1115",
  bgElevated: "#12161c",
  panel: "#171b22",
  panelSecondary: "#1d222b",
  panelTertiary: "#232a35",
  surfaceInteractive: "#202734",
  surfaceHover: "rgba(255,255,255,0.05)",
  surfaceActive: "rgba(255,255,255,0.08)",
  borderSubtle: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.12)",
} as const;

export const textColors = {
  primary: "#f3f6fb",
  secondary: "#98a2b3",
  muted: "#7d8794",
  disabled: "rgba(243,246,251,0.38)",
  inverse: "#0f1115",
} as const;

export const accentColors = {
  accent: "#00cfe8",
  accentHover: "#00b8cf",
  accentPressed: "#009fb5",
  accentSoft: "rgba(0,207,232,0.14)",
  accentBorder: "rgba(0,207,232,0.28)",
  accentGlow: "rgba(0,207,232,0.20)",
} as const;

export const statusColors = {
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#38bdf8",
} as const;

export const overlayColors = {
  selection: "rgba(0,207,232,0.16)",
  selectionStrong: "rgba(0,207,232,0.28)",
  overlay: "rgba(8,10,14,0.72)",
  tooltip: "#1c2330",
} as const;

export type Colors = typeof colors;
export type TextColors = typeof textColors;
export type AccentColors = typeof accentColors;
export type StatusColors = typeof statusColors;
export type OverlayColors = typeof overlayColors;
