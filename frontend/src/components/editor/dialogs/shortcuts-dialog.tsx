"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
	type KeyboardShortcut,
	useKeyboardShortcutsHelp,
} from "@/hooks/use-keyboard-shortcuts-help";
import { useKeybindingsStore } from "@/stores/keybindings-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KeyboardShortcutCombo } from "@/components/ui/keyboard-shortcut-badge";

export function ShortcutsDialog({
	isOpen,
	onOpenChange,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [recordingShortcut, setRecordingShortcut] =
		useState<KeyboardShortcut | null>(null);
	const [searchQuery, setSearchQuery] = useState("");

	const {
		updateKeybinding,
		removeKeybinding,
		getKeybindingString,
		validateKeybinding,
		getKeybindingsForAction,
		setIsRecording,
		resetToDefaults,
		isRecording,
	} = useKeybindingsStore();

	const { shortcuts } = useKeyboardShortcutsHelp();

	const categories = Array.from(new Set(shortcuts.map((s) => s.category)));

	// Filter shortcuts based on search query - DS-9
	const filteredShortcuts = useMemo(() => {
		if (!searchQuery.trim()) return shortcuts;

		const query = searchQuery.toLowerCase();
		return shortcuts.filter(
			(shortcut) =>
				shortcut.description.toLowerCase().includes(query) ||
				shortcut.category.toLowerCase().includes(query) ||
				shortcut.keys.some((key) => key.toLowerCase().includes(query)),
		);
	}, [shortcuts, searchQuery]);

	const filteredCategories = useMemo(() => {
		if (!searchQuery.trim()) return categories;
		return Array.from(new Set(filteredShortcuts.map((s) => s.category)));
	}, [categories, filteredShortcuts, searchQuery]);

	useEffect(() => {
		if (!isRecording || !recordingShortcut) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const keyString = getKeybindingString(e);
			if (keyString) {
				const conflict = validateKeybinding(
					keyString,
					recordingShortcut.action,
				);
				if (conflict) {
					toast.error(
						`Key "${keyString}" is already bound to "${conflict.existingAction}"`,
					);
					setRecordingShortcut(null);
					return;
				}

				const oldKeys = getKeybindingsForAction(recordingShortcut.action);
				for (const key of oldKeys) {
					removeKeybinding(key);
				}

				updateKeybinding(keyString, recordingShortcut.action);

				setIsRecording(false);
				setRecordingShortcut(null);
			}
		};

		const handleClickOutside = () => {
			setRecordingShortcut(null);
			setIsRecording(false);
		};

		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("click", handleClickOutside);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("click", handleClickOutside);
		};
	}, [
		recordingShortcut,
		getKeybindingString,
		updateKeybinding,
		removeKeybinding,
		validateKeybinding,
		getKeybindingsForAction,
		setIsRecording,
		isRecording,
	]);

	const handleStartRecording = (shortcut: KeyboardShortcut) => {
		setRecordingShortcut(shortcut);
		setIsRecording(true);
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[80vh] max-w-2xl flex-col p-0">
				<DialogHeader className="border-b px-6 pb-4">
					<div className="flex flex-col gap-4">
						<DialogTitle>Keyboard shortcuts</DialogTitle>
						{/* Search input - DS-9 */}
						<div className="relative">
							<HugeiconsIcon
								icon={Search01Icon}
								className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
							/>
							<Input
								type="text"
								placeholder="Search shortcuts..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-9"
							/>
						</div>
					</div>
				</DialogHeader>

				<DialogBody className="scrollbar-thin flex-grow overflow-y-auto px-6">
					{filteredShortcuts.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<p className="text-muted-foreground">No shortcuts found</p>
							<p className="text-muted-foreground text-sm mt-1">
								Try a different search term
							</p>
						</div>
					) : (
						<div className="flex flex-col gap-6 py-4">
							{filteredCategories.map((category) => (
								<div key={category} className="flex flex-col gap-2">
									<h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
										{category}
									</h3>
									<div className="flex flex-col gap-1">
										{filteredShortcuts
											.filter((shortcut) => shortcut.category === category)
											.map((shortcut) => (
												<ShortcutItem
													key={shortcut.action}
													shortcut={shortcut}
													isRecording={
														shortcut.action === recordingShortcut?.action
													}
													onStartRecording={() => handleStartRecording(shortcut)}
												/>
											))}
									</div>
								</div>
							))}
						</div>
					)}
				</DialogBody>
				<DialogFooter className="border-t px-6 py-4">
					<Button variant="ghost" onClick={() => setSearchQuery("")}>
						Clear search
					</Button>
					<Button variant="destructive" onClick={resetToDefaults}>
						Reset to default
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ShortcutItem({
	shortcut,
	isRecording,
	onStartRecording,
}: {
	shortcut: KeyboardShortcut;
	isRecording: boolean;
	onStartRecording: (params: { shortcut: KeyboardShortcut }) => void;
}) {
	const displayKeys = shortcut.keys.filter((key: string) => {
		if (
			key.includes("Cmd") &&
			shortcut.keys.includes(key.replace("Cmd", "Ctrl"))
		)
			return false;

		return true;
	});

	// Parse key combo for KeyboardShortcutCombo
	const parseKeyCombo = (keyString: string): string[] => {
		return keyString.split("+").map((key) =>
			key
				.replace("Ctrl", "Ctrl")
				.replace("Cmd", "Cmd")
				.replace("Shift", "Shift")
				.replace("Alt", "Option")
				.replace("Space", "Space")
				.replace("Left", "←")
				.replace("Right", "→")
				.replace("Up", "↑")
				.replace("Down", "↓")
				.replace("Enter", "Enter")
				.replace("Escape", "Esc")
				.replace("Backspace", "Backspace")
				.replace("Delete", "Del")
				.replace("Home", "Home")
				.replace("End", "End"),
		);
	};

	return (
		<div className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
			<div className="flex items-center gap-3">
				{shortcut.icon && (
					<div className="text-muted-foreground">{shortcut.icon}</div>
				)}
				<span className="text-sm">{shortcut.description}</span>
			</div>
			<div className="flex items-center gap-2">
				{displayKeys.map((key: string, index: number) => (
					<div key={key} className="flex items-center gap-2">
						{/* Use KeyboardShortcutCombo for premium look - DS-9 */}
						<KeyboardShortcutCombo
							variant="default"
							keys={parseKeyCombo(key)}
						/>
						{index < displayKeys.length - 1 && (
							<span className="text-muted-foreground text-xs">or</span>
						)}
					</div>
				))}
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
					onClick={() => onStartRecording({ shortcut })}
				>
					{isRecording ? "Press keys..." : "Edit"}
				</Button>
			</div>
		</div>
	);
}

function EditableShortcutKey({
	children,
	isRecording,
	onStartRecording,
}: {
	children: React.ReactNode;
	isRecording: boolean;
	onStartRecording: () => void;
}) {
	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onStartRecording();
	};

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={handleClick}
			title={
				isRecording ? "Press any key combination..." : "Click to edit shortcut"
			}
		>
			{children}
		</Button>
	);
}
