export const buttonStates = {
  primary: {
    default: {
      backgroundColor: "#00cfe8",
      color: "#0f1115",
    },
    hover: {
      backgroundColor: "#00b8cf",
    },
    pressed: {
      backgroundColor: "#009fb5",
    },
    focus: {
      outline: "0 0 0 2px rgba(0,207,232,0.22)",
    },
    disabled: {
      opacity: 0.5,
      pointerEvents: "none" as const,
    },
  },
  secondary: {
    default: {
      backgroundColor: "transparent",
      color: "#f3f6fb",
    },
    hover: {
      backgroundColor: "rgba(255,255,255,0.05)",
    },
    pressed: {
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    focus: {
      outline: "0 0 0 2px rgba(0,207,232,0.22)",
    },
    disabled: {
      opacity: 0.5,
      pointerEvents: "none" as const,
    },
  },
  ghost: {
    default: {
      backgroundColor: "transparent",
      color: "#f3f6fb",
    },
    hover: {
      backgroundColor: "rgba(255,255,255,0.05)",
    },
    pressed: {
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    focus: {
      outline: "0 0 0 2px rgba(0,207,232,0.22)",
    },
    disabled: {
      opacity: 0.5,
      pointerEvents: "none" as const,
    },
  },
  danger: {
    default: {
      backgroundColor: "#ef4444",
      color: "#ffffff",
    },
    hover: {
      backgroundColor: "#dc2626",
    },
    pressed: {
      backgroundColor: "#b91c1c",
    },
    focus: {
      outline: "0 0 0 2px rgba(239,68,68,0.22)",
    },
    disabled: {
      opacity: 0.5,
      pointerEvents: "none" as const,
    },
  },
} as const;

export const inputStates = {
  default: {
    backgroundColor: "#202734",
    border: "rgba(255,255,255,0.06)",
    color: "#f3f6fb",
  },
  hover: {
    border: "rgba(255,255,255,0.12)",
  },
  focus: {
    backgroundColor: "#202734",
    border: "#00cfe8",
    outline: "0 0 0 2px rgba(0,207,232,0.22)",
  },
  disabled: {
    backgroundColor: "#171b22",
    color: "rgba(243,246,251,0.38)",
    pointerEvents: "none" as const,
  },
  invalid: {
    border: "#ef4444",
    outline: "0 0 0 2px rgba(239,68,68,0.22)",
  },
} as const;

export const focusRingStyles = {
  default: "0 0 0 2px rgba(0,207,232,0.22)",
  subtle: "0 0 0 1px rgba(0,207,232,0.20)",
  strong: "0 0 0 3px rgba(0,207,232,0.28)",
} as const;

export const statusStyles = {
  success: {
    color: "#22c55e",
    backgroundColor: "rgba(34,197,94,0.14)",
    border: "rgba(34,197,94,0.28)",
  },
  warning: {
    color: "#f59e0b",
    backgroundColor: "rgba(245,158,11,0.14)",
    border: "rgba(245,158,11,0.28)",
  },
  error: {
    color: "#ef4444",
    backgroundColor: "rgba(239,68,68,0.14)",
    border: "rgba(239,68,68,0.28)",
  },
  info: {
    color: "#38bdf8",
    backgroundColor: "rgba(56,189,248,0.14)",
    border: "rgba(56,189,248,0.28)",
  },
} as const;

export const transitionStyles = {
  fast: "100ms ease",
  normal: "180ms ease",
  slow: "240ms ease",
  emphasis: "180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

export type ButtonStates = typeof buttonStates;
export type InputStates = typeof inputStates;
export type FocusRingStyles = typeof focusRingStyles;
export type StatusStyles = typeof statusStyles;
export type TransitionStyles = typeof transitionStyles;
