export const shadows = {
  subtle: "0 1px 2px rgba(0,0,0,0.18)",
  panel: "0 6px 18px rgba(0,0,0,0.18)",
  popover: "0 10px 30px rgba(0,0,0,0.28)",
  accentRing: "0 0 0 1px rgba(0,207,232,0.20)",
  focusRing: "0 0 0 2px rgba(0,207,232,0.22)",
} as const;

export type Shadows = typeof shadows;
