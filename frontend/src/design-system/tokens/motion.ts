export const motion = {
  fast: "100ms",
  normal: "180ms",
  slow: "240ms",

  easeStandard: "ease",
  easeEmphasis: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

export type Motion = typeof motion;
