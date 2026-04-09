"use client";

import { useState } from "react";
import { TransitionTopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/ui";
import { getExportMimeType, getExportFileExtension, downloadBuffer } from "@/lib/export";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	type ExportFormat,
	type ExportQuality,
} from "@/types/export";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/editor/panels/properties/section";
import { useEditor } from "@/hooks/use-editor";
import { DEFAULT_EXPORT_OPTIONS } from "@/constants/export-constants";
import { pixelApi } from "@/integrations/pixel/api";
import { buildPixelEditorState } from "@/integrations/pixel/editor-state";
import { useToast } from "@/hooks/use-toast";
import { SuccessCelebration } from "@/components/ui/success-celebration";

function isExportFormat(value: string): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((formatValue) => formatValue === value);
}

function isExportQuality(value: string): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((qualityValue) => qualityValue === value);
}

export function ExportButton() {
	const [isExportPopoverOpen, setIsExportPopoverOpen] = useState(false);
	const editor = useEditor();

	const hasProject = !!editor.project.getActiveOrNull();

	const handlePopoverOpenChange = ({ open }: { open: boolean }) => {
		if (!open) {
			editor.project.cancelExport();
			editor.project.clearExportState();
		}
		setIsExportPopoverOpen(open);
	};

	return (
		<Popover open={isExportPopoverOpen} onOpenChange={(open) => handlePopoverOpenChange({ open })}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center gap-1.5 rounded-md bg-[#38BDF8] px-[0.12rem] py-[0.12rem] text-white",
						hasProject ? "cursor-pointer" : "cursor-not-allowed opacity-50",
					)}
					onClick={hasProject ? () => setIsExportPopoverOpen(true) : undefined}
					disabled={!hasProject}
					onKeyDown={(event) => {
						if (hasProject && (event.key === "Enter" || event.key === " ")) {
							event.preventDefault();
							setIsExportPopoverOpen(true);
						}
					}}
				>
					<div className="relative flex items-center gap-1.5 rounded-[0.6rem] bg-linear-270 from-[#2567EC] to-[#37B6F7] px-4 py-1 shadow-[0_1px_3px_0px_rgba(0,0,0,0.65)]">
						<HugeiconsIcon icon={TransitionTopIcon} className="z-50 size-4" />
						<span className="z-50 text-[0.875rem]">Export</span>
						<div className="absolute top-0 left-0 z-10 flex size-full items-center justify-center rounded-[0.6rem] bg-linear-to-t from-white/0 to-white/50">
							<div className="absolute top-[0.08rem] z-50 h-[calc(100%-2px)] w-[calc(100%-2px)] rounded-[0.6rem] bg-linear-270 from-[#2567EC] to-[#37B6F7]"></div>
						</div>
					</div>
				</button>
			</PopoverTrigger>
			{hasProject && <ExportPopover onOpenChange={setIsExportPopoverOpen} />}
		</Popover>
	);
}

function ExportPopover({
	onOpenChange,
}: {
	onOpenChange: (open: boolean) => void;
}) {
	const editor = useEditor();
	const { toast } = useToast();
	const activeProject = editor.project.getActive();
	const { isExporting, progress, result: exportResult } =
		editor.project.getExportState();
	const [format, setFormat] = useState<ExportFormat>(
		DEFAULT_EXPORT_OPTIONS.format,
	);
	const [quality, setQuality] = useState<ExportQuality>(
		DEFAULT_EXPORT_OPTIONS.quality,
	);
	const [shouldIncludeAudio, setShouldIncludeAudio] = useState<boolean>(
		DEFAULT_EXPORT_OPTIONS.includeAudio ?? true,
	);
	const [showCelebration, setShowCelebration] = useState(false);

	const handleExport = async () => {
		if (!activeProject) return;

		const result = await editor.project.export({
			options: {
			format,
			quality,
			fps: activeProject.settings.fps,
			includeAudio: shouldIncludeAudio,
			},
		});

		if (result.cancelled) {
			editor.project.clearExportState();
			return;
		}

		if (result.success && result.buffer) {
			await pixelApi
				.syncEditorState(activeProject.metadata.id, {
					editor_state: {
						...buildPixelEditorState(editor),
						last_editor_export: {
							format,
							quality,
							includeAudio: shouldIncludeAudio,
							exportedAt: new Date().toISOString(),
							filename: `${activeProject.metadata.name}${getExportFileExtension({ format })}`,
						},
					},
				})
				.catch(() => undefined);

			downloadBuffer({
				buffer: result.buffer,
				filename: `${activeProject.metadata.name}${getExportFileExtension({ format })}`,
				mimeType: getExportMimeType({ format }),
			});

			// Show success celebration - DS-11
			setShowCelebration(true);

			// Show success toast
			toast({
				variant: "success",
				title: "Export completed",
				description: `"${activeProject.metadata.name}" has been downloaded successfully.`,
			});

			editor.project.clearExportState();

			// Close popover after celebration animation (1.5s)
			setTimeout(() => {
				setShowCelebration(false);
				onOpenChange(false);
			}, 1500);
		} else if (!result.success && result.error) {
			// Show toast with actionable error message
			let errorHint = "Your project edits are safe. Try lowering the quality or resolution.";
			toast({
				variant: "destructive",
				title: "Export failed",
				description: `${result.error}. ${errorHint}`,
			});
		}
	};

	const handleCancel = () => {
		editor.project.cancelExport();
	};

	return (
		<PopoverContent className="bg-background mr-4 flex w-80 flex-col p-0">
			{/* Success celebration - DS-11 */}
			{showCelebration && (
				<div className="flex flex-col items-center justify-center p-8">
					<SuccessCelebration
						show={true}
						message="Export completed successfully!"
						size="lg"
					/>
				</div>
			)}

			{!showCelebration && (
				<>
					{exportResult && !exportResult.success ? (
						<ExportError
							error={exportResult.error || "Unknown error occurred"}
							onRetry={handleExport}
						/>
					) : (
						<>
					<div className="flex items-center justify-between p-4 border-b">
						<div>
							<h3 className="font-medium text-sm text-foreground">
								{isExporting ? "Exporting in progress" : "Export your video"}
							</h3>
							{!isExporting && (
								<p className="text-xs text-muted-foreground mt-0.5">
									Choose format and quality, then export
								</p>
							)}
						</div>
						{isExporting && (
							<div className="animate-spin size-4 rounded-full border-2 border-primary border-t-transparent" />
						)}
					</div>

					<div className="flex flex-col gap-3">
						{!isExporting && (
							<>
								<div className="flex flex-col gap-2 px-4 pt-2">
									<Section collapsible defaultOpen={false} showTopBorder={false}>
										<SectionHeader>
											<SectionTitle>Format</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={format}
												onValueChange={(value) => {
													if (isExportFormat(value)) {
														setFormat(value);
													}
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="mp4" id="mp4" />
													<Label htmlFor="mp4" className="cursor-pointer">
														<span className="font-medium">MP4</span>
														<span className="text-muted-foreground ml-1"> — Best compatibility</span>
													</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="webm" id="webm" />
													<Label htmlFor="webm" className="cursor-pointer">
														<span className="font-medium">WebM</span>
														<span className="text-muted-foreground ml-1"> — Smaller file size</span>
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>Quality</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={quality}
												onValueChange={(value) => {
													if (isExportQuality(value)) {
														setQuality(value);
													}
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="low" id="low" />
													<Label htmlFor="low" className="cursor-pointer">
														<span className="font-medium">Low</span>
														<span className="text-muted-foreground ml-1"> — Smallest file</span>
													</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="medium" id="medium" />
													<Label htmlFor="medium" className="cursor-pointer">
														<span className="font-medium">Medium</span>
														<span className="text-muted-foreground ml-1"> — Balanced size/quality</span>
													</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="high" id="high" />
													<Label htmlFor="high" className="cursor-pointer">
														<span className="font-medium">High</span>
														<span className="text-muted-foreground ml-1"> — Recommended</span>
													</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="very_high" id="very_high" />
													<Label htmlFor="very_high" className="cursor-pointer">
														<span className="font-medium">Very High</span>
														<span className="text-muted-foreground ml-1"> — Largest file</span>
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>Audio</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<div className="flex items-center space-x-2">
												<Checkbox
													id="include-audio"
								checked={shouldIncludeAudio}
												onCheckedChange={(checked) =>
													setShouldIncludeAudio(!!checked)
												}
												/>
												<Label htmlFor="include-audio" className="cursor-pointer">
													Include audio in exported video
												</Label>
											</div>
										</SectionContent>
									</Section>
								</div>

								<div className="p-4 pt-2 border-t">
									<Button onClick={handleExport} className="w-full gap-2" size="default">
										<Download className="size-4" />
										Export Video
									</Button>
									<p className="text-[11px] text-muted-foreground text-center mt-2">
										Your video will be downloaded when ready
									</p>
								</div>
							</>
						)}

						{isExporting && (
							<div className="space-y-4 p-4">
								<div className="flex flex-col gap-3">
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium text-foreground">
											Rendering your video...
										</span>
										<span className="text-sm font-medium text-primary">
											{Math.round(progress * 100)}%
										</span>
									</div>
									<Progress value={progress * 100} className="w-full h-2" />
									<p className="text-[11px] text-muted-foreground text-center">
										This may take a moment depending on video length
									</p>
								</div>

								<Button
									variant="outline"
									className="w-full"
									onClick={handleCancel}
								>
									Cancel Export
								</Button>
							</div>
						)}
					</div>
				</>
					)}
				</>
			)}
		</PopoverContent>
	);
}

function ExportError({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(error);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};

	// Provide actionable guidance based on common errors
	const getErrorGuidance = (errorMsg: string) => {
		if (errorMsg.includes("memory") || errorMsg.includes("Memory")) {
			return "Try closing other tabs or lowering the quality.";
		}
		if (errorMsg.includes("timeout") || errorMsg.includes("Timeout")) {
			return "Try a shorter video or lower quality.";
		}
		return "Your project is safe. Try lowering the quality or resolution.";
	};

	const guidance = getErrorGuidance(error);

	return (
		<div className="space-y-4 p-4">
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<div className="size-6 rounded-full bg-destructive/20 flex items-center justify-center">
						<span className="text-destructive text-xs">!</span>
					</div>
					<div>
						<p className="text-sm font-medium text-foreground">Export couldn't complete</p>
						<p className="text-xs text-muted-foreground">But don't worry — your project is safe</p>
					</div>
				</div>
				<p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
					{error}
				</p>
				<p className="text-[11px] text-muted-foreground">
					{guidance}
				</p>
			</div>

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={handleCopy}
				>
					{copied ? <Check className="text-constructive size-3.5" /> : <Copy className="size-3.5" />}
					<span>{copied ? "Copied" : "Copy"}</span>
				</Button>
				<Button
					variant="default"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={onRetry}
				>
					<RotateCcw className="size-3.5" />
					Try Again
				</Button>
			</div>
		</div>
	);
}
