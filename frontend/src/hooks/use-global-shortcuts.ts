"use client";

import { useEffect } from "react";

interface UseGlobalShortcutsOptions {
	onOpenShortcuts?: () => void;
}

/**
 * Hook for global keyboard shortcuts that work anywhere in the editor.
 * Press `?` to open the shortcuts dialog.
 *
 * DS-9: Keyboard Shortcuts Discovery
 */
export function useGlobalShortcuts({
	onOpenShortcuts,
}: UseGlobalShortcutsOptions = {}) {
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only trigger when not typing in an input
			const target = e.target as HTMLElement;
			const isInputField =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;

			if (isInputField) return;

			// `?` key opens shortcuts dialog - DS-9
			if (e.key === "?" && onOpenShortcuts) {
				e.preventDefault();
				onOpenShortcuts();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onOpenShortcuts]);
}
