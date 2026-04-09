"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/header";
import { pixelApi } from "@/integrations/pixel/api";
import type {
	PixelDocumentProject,
	PixelGeneratedDocument,
	PixelTemplate,
} from "@/integrations/pixel/types";

function formatDate(value?: string) {
	if (!value) return "No date";
	return new Intl.DateTimeFormat("en-US", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));
}

export function PixelDocumentProjectShell({
	projectId,
}: {
	projectId: string;
}) {
	const [project, setProject] = useState<PixelDocumentProject | null>(null);
	const [templates, setTemplates] = useState<PixelTemplate[]>([]);
	const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [templateKey, setTemplateKey] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const [isGeneratingBacklog, setIsGeneratingBacklog] = useState(false);

	const loadProject = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const [nextProject, nextTemplates] = await Promise.all([
				pixelApi.getDocumentProject(projectId),
				pixelApi.listTemplates().catch(() => []),
			]);
			setProject(nextProject);
			setTemplates(nextTemplates);
			const firstDocument = nextProject.documents?.[0] || null;
			if (firstDocument) {
				setSelectedDocumentId(firstDocument.id);
				setTitle(firstDocument.title || "");
				setContent(firstDocument.content || "");
				setTemplateKey(firstDocument.template_key || "");
			}
		} catch (nextError) {
			setError(
				nextError instanceof Error
					? nextError.message
					: "Failed to load project details",
			);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		void loadProject();
	}, [projectId]);

	const selectedDocument = useMemo(
		() =>
			project?.documents?.find((document) => document.id === selectedDocumentId) ||
			null,
		[project, selectedDocumentId],
	);

	const selectDocument = (document: PixelGeneratedDocument) => {
		setSelectedDocumentId(document.id);
		setTitle(document.title || "");
		setContent(document.content || "");
		setTemplateKey(document.template_key || "");
	};

	const handleCreateDocument = async () => {
		if (!project) return;
		setIsCreating(true);
		setError(null);
		try {
			const created = await pixelApi.createDocument(project.id, {
				project_id: project.id,
				title: `Document ${String((project.documents?.length || 0) + 1).padStart(2, "0")}`,
				content: "# Untitled document\n\nStart writing...",
				template_key: templateKey,
			});
			const nextProject = await pixelApi.getDocumentProject(project.id);
			setProject(nextProject);
			selectDocument(created);
		} catch (nextError) {
			setError(
				nextError instanceof Error
					? nextError.message
					: "Failed to create document",
			);
		} finally {
			setIsCreating(false);
		}
	};

	const handleSaveDocument = async () => {
		if (!selectedDocument || !project) return;
		setIsSaving(true);
		setError(null);
		try {
			const updated = await pixelApi.updateDocument(selectedDocument.id, {
				title,
				content,
				template_key: templateKey,
				provider: selectedDocument.provider || "",
				model: selectedDocument.model || "",
				prompt_observation: selectedDocument.prompt_observation || "",
				source_history_ids: selectedDocument.source_history_ids || [],
				source_files: selectedDocument.source_files || [],
			});
			const nextProject = await pixelApi.getDocumentProject(project.id);
			setProject(nextProject);
			selectDocument(updated);
		} catch (nextError) {
			setError(
				nextError instanceof Error
					? nextError.message
					: "Failed to save changes",
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handleGenerateBacklog = async () => {
		if (!selectedDocument) return;
		setIsGeneratingBacklog(true);
		setError(null);
		try {
			const defaults = await pixelApi.getAiDefaults();
			await pixelApi.generateBacklog(selectedDocument.id, {
				model: defaults.preferred_model,
				provider: defaults.preferred_provider,
			});
			await loadProject();
		} catch (nextError) {
			setError(
				nextError instanceof Error
					? nextError.message
					: "Failed to generate backlog",
			);
		} finally {
			setIsGeneratingBacklog(false);
		}
	};

	const handleDeleteDocument = async () => {
		if (!selectedDocument || !project) return;
		setError(null);
		try {
			await pixelApi.deleteDocument(selectedDocument.id);
			const nextProject = await pixelApi.getDocumentProject(project.id);
			setProject(nextProject);
			const nextSelected = nextProject.documents?.[0] || null;
			if (nextSelected) {
				selectDocument(nextSelected);
			} else {
				setSelectedDocumentId(null);
				setTitle("");
				setContent("");
				setTemplateKey("");
			}
		} catch (nextError) {
			setError(
				nextError instanceof Error
					? nextError.message
					: "Failed to remove document",
			);
		}
	};

	if (isLoading) {
		return (
			<div className="min-h-screen bg-background px-6 py-10 text-sm text-muted-foreground">
				Loading project details...
			</div>
		);
	}

	if (error && !project) {
		return (
			<div className="min-h-screen bg-background px-6 py-10">
				<Header />
				<div className="mx-auto max-w-5xl space-y-4">
					<div className="text-sm text-destructive">{error}</div>
					<Button asChild variant="outline">
						<Link href="/documents">Back to Documents</Link>
					</Button>
				</div>
			</div>
		);
	}

	if (!project) return null;

	return (
		<div className="min-h-screen bg-background text-foreground">
			<Header />
			<header className="border-b border-border/70 px-6 py-5">
				<div className="mx-auto flex max-w-7xl items-start justify-between gap-6">
					<div className="space-y-2">
						<Link
							href="/documents"
							className="text-xs uppercase tracking-[0.24em] text-muted-foreground"
						>
							Back to Documents
						</Link>
						<h1 className="text-3xl font-semibold tracking-tight">
							{project.name}
						</h1>
						<p className="max-w-3xl text-sm text-muted-foreground">
							{project.description || "This project has no description yet."}
						</p>
					</div>
					<div className="flex gap-2">
						<Button onClick={handleCreateDocument} disabled={isCreating}>
							{isCreating ? "Creating..." : "Add document"}
						</Button>
						<Button asChild variant="outline">
							<a href={pixelApi.exportDocumentProjectUrl(project.id)}>
								Download (.zip)
							</a>
						</Button>
					</div>
				</div>
			</header>

			<main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
				<Card className="h-fit">
					<CardHeader>
						<CardTitle>Documents</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						{project.documents?.length ? (
							project.documents.map((document) => (
								<button
									key={document.id}
									className={`w-full rounded-xl border p-3 text-left ${
										selectedDocumentId === document.id
											? "border-primary/40 bg-primary/10"
											: "border-border/70 hover:bg-accent"
									}`}
									onClick={() => selectDocument(document)}
								>
									<div className="font-medium">{document.title}</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{formatDate(document.updated_at || document.created_at)}
									</div>
								</button>
							))
						) : (
							<div className="text-sm text-muted-foreground">
								No documents found.
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Document Editor</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{error ? <div className="text-sm text-destructive">{error}</div> : null}
						{selectedDocument ? (
							<>
								<input
									value={title}
									onChange={(event) => setTitle(event.target.value)}
									className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none"
									placeholder="Untitled document"
								/>
								<select
									value={templateKey}
									onChange={(event) => setTemplateKey(event.target.value)}
									className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none"
								>
									<option value="">Blank document</option>
									{templates.map((template) => (
										<option key={template.key} value={template.key}>
											{template.label}
										</option>
									))}
								</select>
								<textarea
									value={content}
									onChange={(event) => setContent(event.target.value)}
									className="min-h-[560px] w-full rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm outline-none"
								/>
								<div className="flex flex-wrap gap-2">
									<Button onClick={handleSaveDocument} disabled={isSaving}>
										{isSaving ? "Saving..." : "Save changes"}
									</Button>
									<Button
										variant="outline"
										onClick={handleGenerateBacklog}
										disabled={isGeneratingBacklog}
									>
										{isGeneratingBacklog ? "Generating..." : "Build backlog"}
									</Button>
									<Button asChild variant="outline">
										<a href={pixelApi.exportDocumentUrl(selectedDocument.id)}>
											Download (.md)
										</a>
									</Button>
									<Button variant="destructive" onClick={handleDeleteDocument}>
										Delete
									</Button>
								</div>
							</>
						) : (
							<div className="text-sm text-muted-foreground">
								Select or create a document to start editing.
							</div>
						)}
					</CardContent>
				</Card>

				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>Backlog</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{project.backlog_items?.length ? (
								project.backlog_items.map((item) => (
									<div key={item.id} className="rounded-xl border border-border/70 p-4">
										<div className="font-medium">{item.title}</div>
										<div className="mt-2 text-xs text-muted-foreground">
											{item.priority || "medium"} · {item.status || "todo"}
										</div>
										{item.description ? (
											<div className="mt-3 text-sm text-muted-foreground">
												{item.description}
											</div>
										) : null}
									</div>
								))
							) : (
								<div className="text-sm text-muted-foreground">
									No backlog items found.
								</div>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Revisions</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							{selectedDocument?.revisions?.length ? (
								selectedDocument.revisions.map((revision) => (
									<div key={revision.id} className="rounded-xl border border-border/70 p-3">
										<div className="font-medium">
											Rev. {revision.revision_number}
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{formatDate(revision.created_at)}
										</div>
									</div>
								))
							) : (
								<div className="text-sm text-muted-foreground">
									No revisions recorded.
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}
