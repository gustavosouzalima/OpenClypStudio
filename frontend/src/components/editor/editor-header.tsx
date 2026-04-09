"use client";

import { Button } from "../ui/button";
import { useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import Link from "next/link";
import { RenameProjectDialog } from "./dialogs/rename-project-dialog";
import { DeleteProjectDialog } from "./dialogs/delete-project-dialog";
import { useRouter } from "next/navigation";
import { FaDiscord } from "react-icons/fa6";
import { ExportButton } from "./export-button";
import { ThemeToggle } from "../theme-toggle";
import { DEFAULT_LOGO_URL, SOCIAL_LINKS } from "@/constants/site-constants";
import { toast } from "sonner";
import { useEditor } from "@/hooks/use-editor";
import { useSaveState } from "@/hooks/use-save-state";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import { pixelApi } from "@/integrations/pixel/api";
import { buildPixelEditorState } from "@/integrations/pixel/editor-state";
import { CommandIcon, Logout05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShortcutsDialog } from "./dialogs/shortcuts-dialog";
import { KeyboardShortcutBadge } from "@/components/ui/keyboard-shortcut-badge";
import Image from "next/image";
import { cn } from "@/utils/ui";

export function EditorHeader() {
	const editor = useEditor();
	const activeProject = editor.project.getActiveOrNull();
	const { isSaving, hasPendingSave } = useSaveState();

	return (
		<header className="flex h-[3.4rem] items-center justify-between px-3 pt-0.5 animate-in fade-in-0 slide-in-from-top-2 duration-200 ease-out">
			<div className="flex items-center gap-1">
				<ProjectDropdown />
				<div className="flex items-center gap-1.5">
					<EditableProjectName />
					{activeProject && (
						<SaveIndicator isSaving={isSaving} hasPendingSave={hasPendingSave} />
					)}
				</div>
			</div>
			<nav className="flex items-center gap-2">
				{activeProject ? (
					<Button asChild variant="outline" size="sm" className="h-8">
						<Link href={`/projects/${activeProject.metadata.id}`}>
							Studio Hub
						</Link>
					</Button>
				) : null}
				<ExportButton />
				<ThemeToggle />
			</nav>
		</header>
	);
}

function SaveIndicator({ isSaving, hasPendingSave }: { isSaving: boolean; hasPendingSave: boolean }) {
	if (isSaving) {
		return (
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Saving changes...">
				<div className="animate-spin size-3 rounded-full border-2 border-current border-t-transparent" />
				<span className="hidden sm:inline">Saving...</span>
			</div>
		);
	}

	if (hasPendingSave) {
		return (
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Unsaved changes">
				<div className="size-3 rounded-full border-2 border-current border-dashed" />
				<span className="hidden sm:inline">Unsaved</span>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-1.5 text-xs text-muted-foreground/50" title="All changes saved">
			<div className="size-3 rounded-full bg-current" />
			<span className="hidden sm:inline">Saved</span>
		</div>
	);
}

function ProjectDropdown() {
	const [openDialog, setOpenDialog] = useState<
		"delete" | "rename" | "shortcuts" | null
	>(null);
	const [isExiting, setIsExiting] = useState(false);
	const router = useRouter();
	const editor = useEditor();
	const activeProject = editor.project.getActiveOrNull();

	// Global shortcuts handler - DS-9: Press `?` to open shortcuts dialog
	useGlobalShortcuts({
		onOpenShortcuts: () => setOpenDialog("shortcuts"),
	});

	const handleExit = async () => {
		if (isExiting) return;
		setIsExiting(true);
		const fallbackRoute = activeProject
			? `/projects/${activeProject.metadata.id}`
			: "/projects";

		try {
			editor.save.pause();
			await editor.project.prepareExit();
			if (activeProject) {
				await pixelApi
					.syncEditorState(activeProject.metadata.id, {
						editor_state: {
							last_closed_at: new Date().toISOString(),
							...buildPixelEditorState(editor),
						},
					})
					.catch(() => undefined);
			}
		} catch (error) {
			console.error("Failed to prepare project exit:", error);
		} finally {
			editor.project.closeProject();
			router.push(fallbackRoute);
		}
	};

	const handleSaveProjectName = async (newName: string) => {
		if (
			activeProject &&
			newName.trim() &&
			newName !== activeProject.metadata.name
		) {
			try {
				await editor.project.renameProject({
					id: activeProject.metadata.id,
					name: newName.trim(),
				});
				await pixelApi
					.syncEditorState(activeProject.metadata.id, {
						name: newName.trim(),
					})
					.catch(() => undefined);
			} catch (error) {
				toast.error("Failed to rename project", {
					description:
						error instanceof Error ? error.message : "Please try again",
				});
			} finally {
				setOpenDialog(null);
			}
		}
	};

	const handleDeleteProject = async () => {
		if (activeProject) {
			try {
				await editor.project.deleteProjects({
					ids: [activeProject.metadata.id],
				});
				router.push("/projects");
			} catch (error) {
				toast.error("Failed to delete project", {
					description:
						error instanceof Error ? error.message : "Please try again",
				});
			} finally {
				setOpenDialog(null);
			}
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="p-1 rounded-sm size-8">
						<Image
							src={DEFAULT_LOGO_URL}
							alt="Project thumbnail"
							width={32}
							height={32}
							className="invert dark:invert-0 size-5"
						/>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="z-100 w-44">
					<DropdownMenuItem
						onClick={handleExit}
						disabled={isExiting}
						icon={<HugeiconsIcon icon={Logout05Icon} />}
					>
						Exit project
					</DropdownMenuItem>

					<DropdownMenuItem
						onClick={() => setOpenDialog("shortcuts")}
						icon={<HugeiconsIcon icon={CommandIcon} />}
					>
						<span className="flex-1">Shortcuts</span>
						{/* Keyboard hint - DS-9 */}
						<KeyboardShortcutBadge variant="compact">?</KeyboardShortcutBadge>
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					<DropdownMenuItem asChild icon={<FaDiscord className="!size-4" />}>
						<Link
							href={SOCIAL_LINKS.discord}
							target="_blank"
							rel="noopener noreferrer"
						>
							Discord
						</Link>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<RenameProjectDialog
				isOpen={openDialog === "rename"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "rename" : null)}
				onConfirm={(newName) => handleSaveProjectName(newName)}
				projectName={activeProject?.metadata.name || ""}
			/>
			<DeleteProjectDialog
				isOpen={openDialog === "delete"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "delete" : null)}
				onConfirm={handleDeleteProject}
				projectNames={[activeProject?.metadata.name || ""]}
			/>
			<ShortcutsDialog
				isOpen={openDialog === "shortcuts"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "shortcuts" : null)}
			/>
		</>
	);
}

function EditableProjectName() {
	const editor = useEditor();
	const activeProject = editor.project.getActiveOrNull();
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const originalNameRef = useRef("");

	const projectName = activeProject?.metadata.name || "";

	const startEditing = () => {
		if (isEditing) return;
		originalNameRef.current = projectName;
		setIsEditing(true);

		requestAnimationFrame(() => {
			inputRef.current?.select();
		});
	};

	const saveEdit = async () => {
		if (!inputRef.current || !activeProject) return;
		const newName = inputRef.current.value.trim();
		setIsEditing(false);

		if (!newName) {
			inputRef.current.value = originalNameRef.current;
			return;
		}

		if (newName !== originalNameRef.current) {
			try {
				await editor.project.renameProject({
					id: activeProject.metadata.id,
					name: newName,
				});
				await pixelApi
					.syncEditorState(activeProject.metadata.id, {
						name: newName,
					})
					.catch(() => undefined);
			} catch (error) {
				toast.error("Failed to rename project", {
					description:
						error instanceof Error ? error.message : "Please try again",
				});
			}
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			inputRef.current?.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			if (inputRef.current) {
				inputRef.current.value = originalNameRef.current;
			}
			setIsEditing(false);
			inputRef.current?.blur();
		}
	};

	return (
		<input
			ref={inputRef}
			type="text"
			defaultValue={projectName}
			readOnly={!isEditing}
			onClick={startEditing}
			onBlur={saveEdit}
			onKeyDown={handleKeyDown}
			style={{ fieldSizing: "content" }}
			className={cn(
				"text-sm h-8 px-2 py-1 rounded-lg bg-transparent outline-none cursor-pointer hover:bg-accent text-foreground transition-colors duration-180 ease",
				isEditing && "ring-2 ring-ring cursor-text hover:bg-transparent",
			)}
		/>
	);
}
