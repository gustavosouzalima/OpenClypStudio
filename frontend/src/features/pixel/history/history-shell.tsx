"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { pixelApi } from "@/integrations/pixel/api";
import { usePixelHistoryStore } from "@/stores/pixel-history-store";
import {
  AlertCircle,
  Download,
  Mic,
  Trash2,
  FileText,
  RefreshCw,
  FileArchive,
  Upload,
  X,
} from "lucide-react";
import { Header } from "@/components/header";

function formatDate(value?: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

export function PixelHistoryShell() {
  const {
    history,
    isLoading,
    error: storeError,
    loadHistory,
    deleteItem,
    deleteItems,
  } = usePixelHistoryStore();
  const [selectedItem, setSelectedItem] = useState<
    ReturnType<typeof usePixelHistoryStore.getState>["history"][number] | null
  >(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [deleteFile, setDeleteFile] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [error, setError] = useState<string | null>(storeError || null);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (storeError) {
      setError(storeError);
    }
  }, [storeError]);

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => history.some((item) => item.id === id)),
    );
  }, [history]);

  const selectedCount = selectedIds.length;
  const allSelected = useMemo(
    () => history.length > 0 && selectedCount === history.length,
    [history.length, selectedCount],
  );
  const totalPages = Math.max(1, Math.ceil(history.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const paginatedHistory = history.slice(pageStart, pageStart + pageSize);
  const pageRangeStart = history.length === 0 ? 0 : pageStart + 1;
  const pageRangeEnd = Math.min(pageStart + pageSize, history.length);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleViewItem = async (item: typeof selectedItem) => {
    if (!item) return;
    try {
      const fullItem = await pixelApi.getHistoryItem(item.id);
      setSelectedItem(fullItem);
    } catch (error) {
      console.error("Failed to load item details:", error);
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Failed to load transcript details. Please try again.";
      setError(errorMsg);
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await deleteItem(itemToDelete, deleteFile);
      if (selectedItem?.id === itemToDelete) {
        setSelectedItem(null);
      }
      setSelectedIds((current) => current.filter((id) => id !== itemToDelete));
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      setDeleteFile(false);
    } catch (error) {
      console.error("Failed to delete item:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to delete transcript. Please try again.",
      );
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      const result = await deleteItems(selectedIds);
      if (
        selectedItem &&
        result.deleted > 0 &&
        selectedIds.includes(selectedItem.id)
      ) {
        setSelectedItem(null);
      }
      setSelectedIds([]);
      setBulkDeleteDialogOpen(false);
      if (result.failed.length > 0) {
        setError(
          `${result.deleted} transcriptions deleted. ${result.failed.length} failed.`,
        );
      }
    } catch (error) {
      console.error("Failed to delete selected items:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to delete selected transcriptions. Please try again.",
      );
    }
  };

  const handleExportAll = () => {
    const url = pixelApi.exportHistoryUrl();
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcriptions-history.zip";
    a.click();
  };

  const handleExportItem = async (item: typeof selectedItem) => {
    if (!item || !item.id) return;
    try {
      const fullItem = await pixelApi.getHistoryItem(item.id);
      if (fullItem.content) {
        const blob = new Blob([fullItem.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fullItem.filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        console.error("Content not available for download");
      }
    } catch (error) {
      console.error("Failed to export item:", error);
    }
  };

  const openDeleteDialog = (itemId: string) => {
    setItemToDelete(itemId);
    setDeleteDialogOpen(true);
  };

  const toggleSelection = (recordId: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(recordId) ? current : [...current, recordId];
      }
      return current.filter((id) => id !== recordId);
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? history.map((item) => item.id) : []);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <header className="border-b border-border/70 px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <Link
              href="/projects"
              className="text-xs uppercase tracking-[0.24em] text-muted-foreground"
            >
              OpenClyp Studio
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Transcription History
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              View and manage transcriptions automatically saved during video
              processing.
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
              <Link href="/projects">Projects</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/documents">AI Documents</Link>
            </Button>
            <Button variant="outline" onClick={() => loadHistory()}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setError(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-64 animate-pulse rounded-2xl border border-border bg-card/50"
              />
            ))}
          </div>
        ) : error ? (
          <Card className="border-destructive/50">
            <CardContent className="relative flex flex-col items-center justify-center p-12">
              <AlertCircle className="size-16 text-destructive" />
              <h3 className="mt-4 text-lg font-semibold">
                Failed to Load History
              </h3>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {error}
              </p>
              <div className="mt-6 flex gap-3">
                <Button onClick={() => loadHistory()}>
                  <RefreshCw className="size-4 mr-2" />
                  Try again
                </Button>
                <Link href="/audio-recorder">
                  <Button variant="outline">
                    <Mic className="size-4 mr-2" />
                    Record Audio
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : history.length === 0 ? (
          <Card className="border-border/70">
            <CardContent className="flex flex-col items-center justify-center p-12">
              <FileText className="size-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No Transcriptions Found</h3>
              <p className="mt-2 text-center text-sm text-muted-foreground max-w-md">
                Transcriptions from video processing and audio recordings will
                appear here.
              </p>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <Link href="/transcriptions">
                  <Button variant="outline" className="w-full">
                    <Upload className="size-4 mr-2" />
                    Transcribe Media
                  </Button>
                </Link>
                <Link href="/audio-recorder">
                  <Button variant="outline" className="w-full">
                    <Mic className="size-4 mr-2" />
                    Record Audio
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) =>
                    toggleSelectAll(checked === true)
                  }
                  aria-label="Select all history items"
                />
                <div>
                  <div className="text-sm font-medium">Bulk Selection</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedCount > 0
                      ? `${selectedCount} transcriptions selected`
                      : "Select transcriptions to delete in bulk"}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => toggleSelectAll(!allSelected)}
                  disabled={history.length === 0}
                >
                  {allSelected ? "Clear All" : "Select All"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setBulkDeleteDialogOpen(true)}
                  disabled={selectedCount === 0}
                >
                  <Trash2 className="size-4" />
                  Delete Selected
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {paginatedHistory.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <Card
                    key={item.id}
                    className="overflow-hidden border-border/70"
                  >
                    <CardContent className="space-y-4 p-5">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) =>
                                toggleSelection(item.id, checked === true)
                              }
                              aria-label={`Select ${item.filename}`}
                              className="mt-1"
                            />
                            <h2 className="text-lg font-semibold leading-tight">
                              {item.filename}
                            </h2>
                          </div>
                          <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            {item.filename.endsWith(".srt") ? "SRT" : "TXT"}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {item.filepath}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            Size
                          </div>
                          <div className="mt-1 font-medium">
                            {formatFileSize(item.size_bytes)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            Created At
                          </div>
                          <div className="mt-1 font-medium">
                            {formatDate(item.created_at)}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleViewItem(item)}
                        >
                          <FileText className="size-4" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleExportItem(item)}
                        >
                          <Download className="size-4" />
                          Export
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => openDeleteDialog(item.id)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/40 p-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {pageRangeStart}-{pageRangeEnd} of {history.length}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  onClick={handleExportAll}
                  disabled={history.length === 0}
                >
                  <FileArchive className="size-4" />
                  Export All
                </Button>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  Per Page
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
                  >
                    {[12, 24, 48].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="min-w-24 text-center text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCurrentPage((page) => Math.min(totalPages, page + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Dialog to view item details */}
      <Dialog
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedItem?.filename}</DialogTitle>
            <DialogDescription>
              Created At {selectedItem && formatDate(selectedItem.created_at)}
            </DialogDescription>
          </DialogHeader>
          {selectedItem?.content && (
            <div className="mt-4 rounded-lg border border-border/70 bg-muted/20 p-4">
              <pre className="whitespace-pre-wrap text-sm">
                {selectedItem.content}
              </pre>
            </div>
          )}
          {selectedItem && !selectedItem.content && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Content not available
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AlertDialog for delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to delete this transcription from history?
              <div className="mt-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={deleteFile}
                    onChange={(e) => setDeleteFile(e.target.checked)}
                    className="size-4"
                  />
                  Also Delete File From Disk
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Transcriptions</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {selectedCount} transcription
              {selectedCount === 1 ? "" : "s"} from history and permanently
              delete the associated file{selectedCount === 1 ? "" : "s"} from
              disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
