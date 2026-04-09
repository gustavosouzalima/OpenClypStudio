export const typography = {
  fontFamily: "Inter, SF Pro Text, SF Pro Display, system-ui, sans-serif",

  fontSize: {
    xs: "12px",
    sm: "13px",
    md: "14px",
    lg: "16px",
    xl: "18px",
    "2xl": "20px",
  } as const,

  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  } as const,

  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.55,
  } as const,

  letterSpacing: {
    normal: "0",
    subtle: "-0.01em",
    title: "-0.02em",
  } as const,
} as const;

export type Typography = typeof typography;
