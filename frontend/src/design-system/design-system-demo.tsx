"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/ui";

export function DesignSystemDemo() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f1115] p-8">
      <div className="w-full max-w-4xl space-y-12 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#171b22] p-8">
        <div>
          <h2 className="text-[20px] font-semibold text-[#f3f6fb]">
            Design System Tokens Demo
          </h2>
          <p className="mt-2 text-sm text-[#98a2b3]">
            Demonstrating Phase DS-0 foundational tokens and semantic states
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[#98a2b3]">
            Button States (Editor Variants)
          </h3>
          <div className="flex flex-wrap gap-3">
            <Button variant="editor-primary">
              Editor Primary
            </Button>
            <Button variant="editor-secondary">
              Editor Secondary
            </Button>
            <Button variant="editor-ghost">
              Editor Ghost
            </Button>
            <Button variant="editor-danger">
              Editor Danger
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[#98a2b3]">
            Input States (Editor Variants)
          </h3>
          <div className="space-y-3">
            <Input
              variant="editor-default"
              placeholder="Default input state"
            />
            <Input
              variant="editor-invalid"
              placeholder="Invalid input state"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[#98a2b3]">
            Color Tokens
          </h3>
          <div className="flex flex-wrap gap-3">
            <div className="flex h-12 w-24 items-center justify-center rounded-lg bg-[#0f1115] text-[#f3f6fb]">
              Background
            </div>
            <div className="flex h-12 w-24 items-center justify-center rounded-lg bg-[#171b22] text-[#f3f6fb]">
              Panel
            </div>
            <div className="flex h-12 w-24 items-center justify-center rounded-lg bg-[#00cfe8] text-[#0f1115]">
              Accent
            </div>
            <div className="flex h-12 w-24 items-center justify-center rounded-lg bg-[#ef4444] text-[#ffffff]">
              Error
            </div>
            <div className="flex h-12 w-24 items-center justify-center rounded-lg bg-[#22c55e] text-[#ffffff]">
              Success
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[#98a2b3]">
            Status Styles
          </h3>
          <div className="flex flex-wrap gap-3">
            <span className="rounded-lg border px-4 py-2 text-sm text-[#22c55e] [background-color:rgba(34,197,94,0.14)] [border-color:rgba(34,197,94,0.28)]">
              Success
            </span>
            <span className="rounded-lg border px-4 py-2 text-sm text-[#f59e0b] [background-color:rgba(245,158,11,0.14)] [border-color:rgba(245,158,11,0.28)]">
              Warning
            </span>
            <span className="rounded-lg border px-4 py-2 text-sm text-[#ef4444] [background-color:rgba(239,68,68,0.14)] [border-color:rgba(239,68,68,0.28)]">
              Error
            </span>
            <span className="rounded-lg border px-4 py-2 text-sm text-[#38bdf8] [background-color:rgba(56,189,248,0.14)] [border-color:rgba(56,189,248,0.28)]">
              Info
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[#98a2b3]">
            Typography Scale
          </h3>
          <div className="space-y-2">
            <p className="text-[12px] text-[#f3f6fb]">
              12px - helper labels, captions, metadata
            </p>
            <p className="text-[13px] text-[#f3f6fb]">
              13px - compact UI controls
            </p>
            <p className="text-[14px] text-[#f3f6fb]">
              14px - default UI text
            </p>
            <p className="text-[16px] text-[#f3f6fb]">
              16px - section titles, stronger labels
            </p>
            <p className="text-[18px] text-[#f3f6fb]">
              18px - feature headers, modal headers
            </p>
            <p className="text-[20px] text-[#f3f6fb]">
              20px - key entry points
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[#98a2b3]">
            Radius Tokens
          </h3>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[6px] bg-[#00cfe8] text-[#0f1115] text-[12px]">
              6px
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[#00cfe8] text-[#0f1115] text-[12px]">
              8px
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#00cfe8] text-[#0f1115] text-[12px]">
              10px
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[#00cfe8] text-[#0f1115] text-[12px]">
              12px
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#00cfe8] text-[#0f1115] text-[12px]">
              16px
            </div>
            <div className="flex h-12 w-24 items-center justify-center rounded-[999px] bg-[#00cfe8] text-[#0f1115] text-[12px]">
              Pill
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
