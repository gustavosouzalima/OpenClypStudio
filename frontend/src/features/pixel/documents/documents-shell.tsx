"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/header";
import { pixelApi } from "@/integrations/pixel/api";
import type { PixelDocumentProject } from "@/integrations/pixel/types";

function formatDate(value?: string) {
	if (!value) return "No date";
	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));
}

export function PixelDocumentsShell() {
	const router = useRouter();
	const searchParams = useSearchParams();

	// history_ids passed from Transcriptions → Documents flow
	// history_id passed from Audio Recorder → Documents flow
	const historyIdsParam = searchParams.get("history_ids");
	const historyIdParam = searchParams.get("history_id");

	const sourceHistoryIds: string[] = [
		...(historyIdsParam ? historyIdsParam.split(",").filter(Boolean) : []),
		...(historyIdParam ? [historyIdParam] : []),
	];

	const fromTranscript = sourceHistoryIds.length > 0;

	const [projects, setProjects] = useState<PixelDocumentProject[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
	const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<string | null>(
		null,
	);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isDeletingSelected, setIsDeletingSelected] = useState(false);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(12);

	const loadProjects = async () => {
		setIsLoading(true);
		setError(null);
		try {
			setProjects(await pixelApi.listDocumentProjects());
		} catch (nextError) {
					setError(
						nextError instanceof Error
							? nextError.message
							: "Failed to load projects",
					);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		void loadProjects();
	}, []);

	const totalProjects = projects.length;
	const totalPages = Math.max(1, Math.ceil(totalProjects / pageSize));
	const currentPage = Math.min(page, totalPages);
	const paginatedProjects = useMemo(() => {
		const start = (currentPage - 1) * pageSize;
		return projects.slice(start, start + pageSize);
	}, [projects, currentPage, pageSize]);

	useEffect(() => {
		setPage((current) => Math.min(current, Math.max(1, Math.ceil(projects.length / pageSize))));
	}, [projects.length, pageSize]);

	const allSelected = projects.length > 0 && selectedProjectIds.length === projects.length;

	const toggleProjectSelection = (projectId: string) => {
		setSelectedProjectIds((current) =>
			current.includes(projectId)
				? current.filter((id) => id !== projectId)
				: [...current, projectId],
		);
	};

	const toggleSelectAll = () => {
		setSelectedProjectIds(allSelected ? [] : projects.map((project) => project.id));
	};

	const handleCreate = async () => {
		if (!name.trim()) return;
		setIsCreating(true);
		setError(null);
		try {
			const created = await pixelApi.createDocumentProject({
				name: name.trim(),
				description: description.trim(),
			});

			// When opened from Transcriptions or Audio Recorder, immediately create a linked document
			// so that transcript sources are attached to this project from start.
			if (fromTranscript) {
				await pixelApi.createDocument(created.id, {
					project_id: created.id,
					title: name.trim(),
					content: "",
					source_history_ids: sourceHistoryIds,
				});
				// Redirect directly into the new project so the user can generate content
				router.push(`/documents/${created.id}`);
				return;
			}

			setProjects((current) => [created, ...current]);
			setName("");
			setDescription("");
		} catch (nextError) {
			setError(
				nextError instanceof Error
					? nextError.message
					: "Failed to create project",
			);
		} finally {
			setIsCreating(false);
		}
	};

	const handleDeleteProject = async (projectId: string) => {
		setIsDeleting(true);
		setError(null);
		try {
			await pixelApi.deleteDocumentProject(projectId);
			setProjects((current) => current.filter((project) => project.id !== projectId));
			setSelectedProjectIds((current) => current.filter((id) => id !== projectId));
			setConfirmDeleteProjectId(null);
		} catch (nextError) {
			setError(
				nextError instanceof Error
					? nextError.message
					: "Failed to delete project",
			);
		} finally {
			setIsDeleting(false);
		}
	};

	const handleDeleteSelected = async () => {
		if (selectedProjectIds.length === 0) return;
		setIsDeletingSelected(true);
		setError(null);
		const idsToDelete = [...selectedProjectIds];
		let deletedCount = 0;

		for (const projectId of idsToDelete) {
			try {
				await pixelApi.deleteDocumentProject(projectId);
				deletedCount += 1;
			} catch {
				// Continue deleting others and report partial failure at the end.
			}
		}

		if (deletedCount > 0) {
			setProjects((current) =>
				current.filter((project) => !idsToDelete.includes(project.id)),
			);
			setSelectedProjectIds([]);
		}

		if (deletedCount !== idsToDelete.length) {
			setError(
				`${deletedCount} projects deleted. ${idsToDelete.length - deletedCount} failed.`,
			);
		}

		setIsDeletingSelected(false);
	};

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Header />
			<header className="border-b border-border/70 px-6 py-5">
				<div className="mx-auto flex max-w-7xl items-start justify-between gap-6">
					<div>
						<div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
							OpenClyp Studio
						</div>
						<h1 className="mt-2 text-3xl font-semibold tracking-tight">
							AI Documents
						</h1>
						<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
							Creative workspace for AI-powered document generation, revisions,
							and backlog management.
						</p>
					</div>
					<div className="flex gap-2">
						<Button asChild variant="outline">
							<Link href="/transcriptions">Transcriptions</Link>
						</Button>
						<Button asChild variant="outline">
							<Link href="/audio-recorder">Audio Recorder</Link>
						</Button>
						<Button asChild variant="outline">
							<Link href="/history">History</Link>
						</Button>
						<Button asChild variant="outline">
							<Link href="/projects">Projects</Link>
						</Button>
						<Button onClick={() => void loadProjects()} variant="outline">
							Refresh
						</Button>
					</div>
				</div>
			</header>

			<main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[0.8fr_1.2fr]">
				<div className="space-y-4">
					{fromTranscript && (
						<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
							<div className="flex items-start gap-3">
								<Badge className="mt-0.5 shrink-0 bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
									From Transcript
								</Badge>
								<div className="space-y-1">
									<p className="text-sm font-medium">
										{sourceHistoryIds.length} transcripts selected
									</p>
									<p className="text-xs text-muted-foreground">
										Give this project a name to continue. Your selected transcripts
										will be linked as primary sources for document generation.
									</p>
								</div>
							</div>
						</div>
					)}

					<Card>
						<CardHeader>
							<CardTitle>Create Project</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<input
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Project title"
								className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none"
							/>
							<textarea
								value={description}
								onChange={(event) => setDescription(event.target.value)}
								placeholder="Project description (optional)"
								className="min-h-28 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none"
							/>
							<Button
								className="w-full"
								onClick={handleCreate}
								disabled={isCreating || !name.trim()}
							>
								{isCreating ? "Creating..." : fromTranscript ? "Create and link transcripts" : "Create project"}
							</Button>
							{error ? <div className="text-sm text-destructive">{error}</div> : null}
						</CardContent>
					</Card>
				</div>

				<div className="space-y-4">
					{projects.length > 0 && !isLoading ? (
						<Card>
							<CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
								<div className="flex flex-wrap items-center gap-3">
									<label className="flex items-center gap-2 text-sm">
										<input
											type="checkbox"
											checked={allSelected}
											onChange={toggleSelectAll}
										/>
										<span>Select All</span>
									</label>
									<span className="text-sm text-muted-foreground">
										Showing{" "}
										{totalProjects === 0 ? 0 : (currentPage - 1) * pageSize + 1}
										-
										{Math.min(currentPage * pageSize, totalProjects)} of{" "}
										{totalProjects}
									</span>
								</div>
								<div className="flex items-center gap-2">
									<label className="text-sm text-muted-foreground" htmlFor="documents-page-size">
										Per Page
									</label>
									<select
										id="documents-page-size"
										className="rounded-md border border-border bg-background px-2 py-1 text-sm"
										value={pageSize}
										onChange={(event) => {
											setPageSize(Number(event.target.value));
											setPage(1);
										}}
									>
										<option value={12}>12</option>
										<option value={24}>24</option>
										<option value={48}>48</option>
									</select>
								</div>
							</CardContent>
						</Card>
					) : null}

					{selectedProjectIds.length > 0 ? (
						<Card className="border-amber-500/30 bg-amber-500/5">
							<CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
								<div className="text-sm font-medium">
									{selectedProjectIds.length} projects selected
								</div>
								<div className="flex gap-2">
									<Button
										variant="outline"
										onClick={() => setSelectedProjectIds([])}
									>
										Deselect all
									</Button>
									<Button
										variant="destructive"
										onClick={handleDeleteSelected}
										disabled={isDeletingSelected}
									>
										{isDeletingSelected ? "Deleting..." : "Delete selected"}
									</Button>
								</div>
							</CardContent>
						</Card>
					) : null}

					{isLoading ? (
						<div className="text-sm text-muted-foreground">
							Loading projects...
						</div>
					) : projects.length ? (
						paginatedProjects.map((project) => (
							<Card key={project.id}>
								<CardContent className="space-y-4 p-5">
									<div className="space-y-2">
										<div className="flex items-center justify-between gap-4">
											<div className="flex items-center gap-3">
												<input
													type="checkbox"
													checked={selectedProjectIds.includes(project.id)}
													onChange={() => toggleProjectSelection(project.id)}
													aria-label={`Select ${project.name}`}
												/>
												<h2 className="text-lg font-semibold">{project.name}</h2>
											</div>
											<div className="text-xs text-muted-foreground">
												{formatDate(project.updated_at || project.created_at)}
											</div>
										</div>
										<p className="text-sm text-muted-foreground">
											{project.description || "No description"}
										</p>
									</div>
									<div className="grid gap-3 sm:grid-cols-2">
										<div className="rounded-xl border border-border/70 bg-muted/20 p-4">
											<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
												Documents
											</div>
											<div className="mt-1 font-medium">
												{project.documents_count || project.documents?.length || 0}
											</div>
										</div>
										<div className="rounded-xl border border-border/70 bg-muted/20 p-4">
											<div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
												Backlog
											</div>
											<div className="mt-1 font-medium">
												{project.backlog_items?.length || 0}
											</div>
										</div>
									</div>
									<div className="flex gap-2">
										<Button asChild className="flex-1">
											<Link href={`/documents/${project.id}`}>Open</Link>
										</Button>
										<Button asChild variant="outline" className="flex-1">
											<a href={pixelApi.exportDocumentProjectUrl(project.id)}>
												Download (.zip)
											</a>
										</Button>
										{confirmDeleteProjectId === project.id ? (
											<>
												<Button
													variant="destructive"
													onClick={() => void handleDeleteProject(project.id)}
													disabled={isDeleting}
												>
													{isDeleting ? "Deleting..." : "Confirm"}
												</Button>
												<Button
													variant="outline"
													onClick={() => setConfirmDeleteProjectId(null)}
													disabled={isDeleting}
												>
													Cancel
												</Button>
											</>
										) : (
											<Button
												variant="outline"
												onClick={() => setConfirmDeleteProjectId(project.id)}
											>
												Delete
											</Button>
										)}
									</div>
								</CardContent>
							</Card>
						))
					) : (
						<Card>
							<CardContent className="flex flex-col items-center justify-center p-12">
								<div className="text-4xl mb-4">📄</div>
								<h3 className="text-lg font-semibold">No projects yet</h3>
								<p className="mt-2 text-center text-sm text-muted-foreground">
									Create your first document project to start generating AI content
									from your transcriptions.
								</p>
								<div className="mt-6 flex gap-3">
									<Button asChild>
										<Link href="/transcriptions">View Transcriptions</Link>
									</Button>
									<Button asChild variant="outline">
										<Link href="/audio-recorder">Record Audio</Link>
									</Button>
								</div>
							</CardContent>
						</Card>
					)}

					{projects.length > 0 && !isLoading ? (
						<div className="flex items-center justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setPage((current) => Math.max(1, current - 1))}
								disabled={currentPage <= 1}
							>
								Previous
							</Button>
							<div className="text-sm text-muted-foreground">
								Page {currentPage} of {totalPages}
							</div>
							<Button
								variant="outline"
								onClick={() =>
									setPage((current) => Math.min(totalPages, current + 1))
								}
								disabled={currentPage >= totalPages}
							>
								Next
							</Button>
						</div>
					) : null}
				</div>
			</main>
		</div>
	);
}
