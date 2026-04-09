import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-view";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { extractTimelineAudio } from "@/lib/media/mediabunny";
import { useEditorStatic } from "@/hooks/use-editor-static";
import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";
import { TRANSCRIPTION_LANGUAGES } from "@/constants/transcription-constants";
import type {
	TranscriptionLanguage,
} from "@/types/transcription";
import type { TextElement, TimelineTrack } from "@/types/timeline";
import { pixelApi } from "@/integrations/pixel/api";
import type { PixelEditorTranscriptionSegment } from "@/integrations/pixel/types";
import { buildCaptionChunks } from "@/lib/transcription/caption";
import {
	getGeneratedCaptionTracks,
	GENERATED_CAPTION_TRACK_NAME,
} from "@/lib/timeline/caption-tracks";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type CaptionPreset = {
	id: string;
	name: string;
	description: string;
	updates: Partial<typeof DEFAULT_TEXT_ELEMENT>;
};

const CAPTION_PRESETS: CaptionPreset[] = [
	{
		id: "bold-pop",
		name: "Bold Pop",
		description: "White bold captions with dark backing for short-form edits.",
		updates: {
			fontFamily: "Arial",
			fontSize: 65,
			fontWeight: "bold",
			color: "#ffffff",
			background: {
				...DEFAULT_TEXT_ELEMENT.background,
				enabled: false,
				color: "transparent",
				paddingX: 0,
				paddingY: 0,
				cornerRadius: 0,
				offsetY: 180,
			},
		},
	},
	{
		id: "yellow-punch",
		name: "Yellow Punch",
		description: "Bright yellow subtitles for punchlines, reels and viral edits.",
		updates: {
			fontFamily: "Arial",
			fontSize: 68,
			fontWeight: "bold",
			color: "#facc15",
			background: {
				...DEFAULT_TEXT_ELEMENT.background,
				enabled: false,
				color: "transparent",
				paddingX: 0,
				paddingY: 0,
				cornerRadius: 0,
				offsetY: 180,
			},
		},
	},
	{
		id: "cinema-lower",
		name: "Cinema Lower",
		description: "More restrained lower-third style with translucent dark backing.",
		updates: {
			fontFamily: "Georgia",
			fontSize: 56,
			fontWeight: "normal",
			color: "#f8fafc",
			background: {
				...DEFAULT_TEXT_ELEMENT.background,
				enabled: false,
				color: "transparent",
				paddingX: 0,
				paddingY: 0,
				cornerRadius: 0,
				offsetY: 190,
			},
		},
	},
	{
		id: "karaoke-blue",
		name: "Karaoke Blue",
		description: "Blue-backed tutorial style with stronger readability on busy footage.",
		updates: {
			fontFamily: "Arial",
			fontSize: 64,
			fontWeight: "bold",
			color: "#dbeafe",
			background: {
				...DEFAULT_TEXT_ELEMENT.background,
				enabled: false,
				color: "transparent",
				paddingX: 0,
				paddingY: 0,
				cornerRadius: 0,
				offsetY: 182,
			},
		},
	},
	{
		id: "tiktok-green",
		name: "TikTok Green",
		description: "Bright green text — high contrast for short-form clips and reactions.",
		updates: {
			fontFamily: "Arial",
			fontSize: 72,
			fontWeight: "bold",
			color: "#4ade80",
			background: {
				...DEFAULT_TEXT_ELEMENT.background,
				enabled: false,
				color: "transparent",
				paddingX: 0,
				paddingY: 0,
				cornerRadius: 0,
				offsetY: 175,
			},
		},
	},
	{
		id: "red-alert",
		name: "Red Alert",
		description: "White text on red pill — maximum urgency for hooks and highlights.",
		updates: {
			fontFamily: "Arial",
			fontSize: 66,
			fontWeight: "bold",
			color: "#ffffff",
			background: {
				...DEFAULT_TEXT_ELEMENT.background,
				enabled: false,
				color: "transparent",
				paddingX: 0,
				paddingY: 0,
				cornerRadius: 0,
				offsetY: 178,
			},
		},
	},
	{
		id: "ghost-white",
		name: "Ghost White",
		description: "Large white text with no background — minimal look for clean footage.",
		updates: {
			fontFamily: "Georgia",
			fontSize: 74,
			fontWeight: "bold",
			color: "#ffffff",
			background: {
				...DEFAULT_TEXT_ELEMENT.background,
				enabled: false,
				color: "transparent",
				paddingX: 0,
				paddingY: 0,
				cornerRadius: 0,
				offsetY: 170,
			},
		},
	},
	{
		id: "dark-pill",
		name: "Dark Pill",
		description: "Soft white on dark rounded pill — universal fit for any background.",
		updates: {
			fontFamily: "Arial",
			fontSize: 60,
			fontWeight: "bold",
			color: "#f1f5f9",
			background: {
				...DEFAULT_TEXT_ELEMENT.background,
				enabled: false,
				color: "transparent",
				paddingX: 0,
				paddingY: 0,
				cornerRadius: 0,
				offsetY: 182,
			},
		},
	},
];

function useTimelineTick(subscribeStore: (listener: () => void) => () => void): number {
	const versionRef = useRef(0);
	return useSyncExternalStore(
		(onStoreChange) =>
			subscribeStore(() => {
				versionRef.current += 1;
				onStoreChange();
			}),
		() => versionRef.current,
		() => versionRef.current,
	);
}

const CaptionPresetList = memo(function CaptionPresetList({
	onApply,
	disabled,
}: {
	onApply: (preset: CaptionPreset) => void;
	disabled: boolean;
}) {
	return (
		<div className="grid grid-cols-2 gap-2">
			{CAPTION_PRESETS.map((preset) => (
				<Button
					key={preset.id}
					variant="outline"
					size="sm"
					onClick={() => onApply(preset)}
					disabled={disabled}
					className="h-auto min-h-16 justify-start p-3 text-left"
				>
					<div className="space-y-1">
						<div className="text-xs font-medium">{preset.name}</div>
						<div className="text-muted-foreground line-clamp-2 text-[10px] leading-tight">
							{preset.description}
						</div>
					</div>
				</Button>
			))}
		</div>
	);
});

export function Captions() {
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [isProcessing, setIsProcessing] = useState(false);
	const [processingStep, setProcessingStep] = useState("");
	const [processingProgress, setProcessingProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [showClearConfirm, setShowClearConfirm] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const editor = useEditorStatic();
	const { toast } = useToast();
	const timelineTick = useTimelineTick((listener) => editor.timeline.subscribe(listener));

	// Derived: whether generated captions already exist (used for button label).
	const captionTracks = useMemo(
		() =>
			getGeneratedCaptionTracks({
				tracks: editor.timeline.getTracks(),
			}),
		[editor, timelineTick],
	);
	const hasCaptions = captionTracks.length > 0;

	const handleGenerateTranscript = async () => {
		const wasPlaying = editor.playback.getIsPlaying();
		const resumeTime = editor.playback.getCurrentTime();
		try {
			if (wasPlaying) {
				editor.playback.pause();
			}

			setIsProcessing(true);
			setError(null);
			setProcessingStep("Extracting audio from timeline...");
			setProcessingProgress(10);

			// Clear existing caption tracks first
			for (const track of getGeneratedCaptionTracks({
				tracks: editor.timeline.getTracks(),
			})) {
				editor.timeline.removeTrack({ trackId: track.id });
			}

			// Extract audio from timeline (read-only, doesn't affect audio tracks)
			const audioBlob = await extractTimelineAudio({
				tracks: editor.timeline.getTracks(),
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
			});

			if (!audioBlob || audioBlob.size === 0) {
				throw new Error("Failed to extract audio from timeline - no audio found or empty audio buffer");
			}

			setProcessingStep("Transcribing with Python backend...");
			setProcessingProgress(30);
			console.log("[Captions] Sending audio to Python backend for transcription");

			// Call Python backend for transcription
			const result = await pixelApi.transcribeEditorAudio(audioBlob, {
				model: "large-v3-turbo",
				language: selectedLanguage === "auto" ? "auto" : selectedLanguage,
				beam_size: 5,
				batch_size: 32,
			});

			if (!result || !result.segments || result.segments.length === 0) {
				throw new Error("Transcription completed but returned no segments - audio may be too short or silent");
			}

			console.log("[Captions] Backend transcription result:", {
				segmentCount: result.segments.length,
				detectedLanguage: result.detected_language,
				textLength: result.text?.length,
			});

			setProcessingStep("Generating captions...");
			setProcessingProgress(80);

			// Convert backend segments to caption chunks format
			const captionChunks = buildCaptionChunks({
				segments: result.segments.map((s: PixelEditorTranscriptionSegment) => ({
					text: s.text,
					start: s.start,
					end: s.end,
				})),
				wordsPerChunk: 8,
				minDuration: 0.9,
			});

			if (!captionChunks || captionChunks.length === 0) {
				throw new Error("Failed to build captions from transcription segments");
			}

			console.log("[Captions] Generated caption chunks:", captionChunks.length);

			// Create new caption track at the end (don't specify index to avoid interfering with audio tracks)
			const captionTrackId = editor.timeline.addTrack({
				type: "text",
			});

			// Stamp the track with the sentinel so it is recognised as
			// auto-generated regardless of element names.
			const tracks = editor.timeline.getTracks();
			const newTrack = tracks.find((t) => t.id === captionTrackId);
			if (newTrack) {
				editor.timeline.updateTracks(
					tracks.map((t) =>
						t.id === captionTrackId
							? { ...t, name: GENERATED_CAPTION_TRACK_NAME }
							: t,
					),
				);
			}

			setProcessingStep("Adding captions to timeline...");
			setProcessingProgress(90);

			// Build all caption elements in memory — no timeline writes during construction.
			// A single updateTracks() call replaces N insertElement() calls, reducing
			// notify() → buildScene() cycles from N to 1. This prevents the N×RAF-starvation
			// that caused FPS to drop and made the audio scheduler miss its setInterval ticks.
			const captionElements: TextElement[] = captionChunks.map((caption, idx) => ({
				...DEFAULT_TEXT_ELEMENT,
				id: crypto.randomUUID(),
				name: `Caption ${idx + 1}`,
				content: caption.text,
				duration: caption.duration,
				startTime: caption.startTime,
				trimStart: 0,
				trimEnd: 0,
				fontSize: 6,
				fontWeight: "bold",
				fontFamily: "Arial",
				color: "#ffffff",
				textAlign: "center",
				background: {
					enabled: false,
					color: "transparent",
					paddingX: 0,
					paddingY: 0,
					cornerRadius: 0,
					offsetY: 70,
				},
			}));

			editor.timeline.updateTracks(
				(editor.timeline.getTracks().map((t) =>
					t.id === captionTrackId
						? { ...t, elements: captionElements }
						: t,
				) as TimelineTrack[]),
			);

			setProcessingProgress(100);
			console.log("[Captions] Caption generation complete:", {
				trackId: captionTrackId,
				captionCount: captionChunks.length,
			});
		} catch (error) {
			console.error("[Captions] Generate Captions failed:", error);

			// Improve error messages based on common issues with actionable next steps
			let errorMessage = error instanceof Error ? error.message : "An unexpected error occurred during caption generation";
			let errorTitle = "Caption generation failed";
			let errorHint: string | undefined;

			if (errorMessage.includes("Failed to fetch") || errorMessage.includes("ECONNREFUSED")) {
				errorTitle = "Backend not reachable";
				errorMessage = "Could not connect to the transcription service at http://127.0.0.1:8000";
				errorHint = "Start the Python backend with 'python main.py' and try again. Your project edits are safe.";
			} else if (errorMessage.includes("503")) {
				errorTitle = "Transcription service unavailable";
				errorMessage = "The transcription service is busy or not configured";
				errorHint = "Ensure faster-whisper is installed in the Python backend. Your project is safe.";
			} else if (errorMessage.includes("422")) {
				errorTitle = "Audio format error";
				errorMessage = "The extracted audio could not be processed";
				errorHint = "Try removing silent sections or check your audio sources. Your project is safe.";
			} else if (errorMessage.includes("no audio found") || errorMessage.includes("empty audio")) {
				errorTitle = "No audio detected";
				errorMessage = "Could not extract audio from the timeline";
				errorHint = "Add audio or video with sound to your timeline first. Your project is safe.";
			}

			// Show toast with actionable error message
			toast({
				variant: "destructive",
				title: errorTitle,
				description: errorHint ? `${errorMessage}. ${errorHint}` : errorMessage,
			});

			setError(errorMessage);
			setProcessingProgress(0);
		} finally {
			setIsProcessing(false);
			setProcessingStep("");
			if (wasPlaying) {
				editor.playback.seek({ time: resumeTime });
				editor.playback.play();
			}
		}
	};

	const applyCaptionPreset = useCallback(({ preset }: { preset: CaptionPreset }) => {
		const captionTracks = getGeneratedCaptionTracks({
			tracks: editor.timeline.getTracks(),
		});

		const updates = captionTracks.flatMap((track) =>
			track.elements.map((element) => {
				const textElement = element as (typeof track.elements)[number] & {
					background: typeof DEFAULT_TEXT_ELEMENT.background;
				};
				return {
					trackId: track.id,
					elementId: element.id,
					updates: {
						...preset.updates,
						background: {
							...(preset.updates.background ?? textElement.background),
							enabled: false,
							color: "transparent",
							paddingX: 0,
							paddingY: 0,
							cornerRadius: 0,
						},
					},
				};
			}),
		);

		if (updates.length === 0) {
			setError("Generate captions first to apply a style preset.");
			return;
		}

		setError(null);
		editor.timeline.updateElements({ updates });
	}, [editor]);

	const handleApplyPreset = useCallback(
		(preset: CaptionPreset) => applyCaptionPreset({ preset }),
		[applyCaptionPreset],
	);

	const clearGeneratedCaptions = () => {
		const captionTracks = getGeneratedCaptionTracks({
			tracks: editor.timeline.getTracks(),
		});

		if (captionTracks.length === 0) {
			setError("No generated captions to clear.");
			return;
		}

		// Show confirmation first
		setShowClearConfirm(true);
	};

	const confirmClearCaptions = () => {
		const captionTracks = getGeneratedCaptionTracks({
			tracks: editor.timeline.getTracks(),
		});

		for (const track of captionTracks) {
			editor.timeline.removeTrack({ trackId: track.id });
		}
		setError(null);
		setShowClearConfirm(false);

		// Show feedback
		toast({
			title: "Captions cleared",
			description: "All generated captions have been removed from the timeline.",
		});
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	return (
		<PanelView title="Captions" ref={containerRef}>
			<div className="flex flex-col gap-3">
				<Label>Language</Label>
				<Select
					value={selectedLanguage}
					onValueChange={(value) => handleLanguageChange({ value })}
				>
					<SelectTrigger>
						<SelectValue placeholder="Select a language" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="auto">Auto detect</SelectItem>
						{TRANSCRIPTION_LANGUAGES.map((language) => (
							<SelectItem key={language.code} value={language.code}>
								{language.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-4">
				<div className="space-y-3">
					<div className="flex items-center justify-between gap-2">
						<Label>Styles</Label>
						<Badge variant="outline" className="text-[10px] uppercase">
							Templates
						</Badge>
					</div>
					<CaptionPresetList
						onApply={handleApplyPreset}
						disabled={isProcessing}
					/>
				</div>

				{error && (
					<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
						<p className="text-destructive text-sm">{error}</p>
					</div>
				)}

				<Button
					className="w-full relative overflow-hidden"
					onClick={handleGenerateTranscript}
					disabled={isProcessing}
				>
					{isProcessing && processingProgress > 0 && (
						<div
							className="absolute left-0 top-0 h-full bg-primary/20 transition-all duration-300"
							style={{ width: `${processingProgress}%` }}
						/>
					)}
					<span className="relative flex items-center justify-center gap-2">
						{isProcessing && <Spinner className="h-4 w-4" />}
						{isProcessing ? (
							<span>
								{processingStep}
								{processingProgress > 0 && (
									<span className="ml-1 text-muted-foreground">
										({processingProgress}%)
									</span>
								)}
							</span>
						) : hasCaptions ? (
							"Regenerate Captions"
						) : (
							"Generate Captions"
						)}
					</span>
				</Button>
				{showClearConfirm ? (
					<div className="flex gap-2">
						<Button
							variant="outline"
							className="flex-1"
							onClick={() => setShowClearConfirm(false)}
							disabled={isProcessing}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							className="flex-1"
							onClick={confirmClearCaptions}
							disabled={isProcessing}
						>
							Confirm Clear
						</Button>
					</div>
				) : (
					<Button
						variant="outline"
						className="w-full"
						onClick={clearGeneratedCaptions}
						disabled={isProcessing || !hasCaptions}
					>
						Clear Captions
					</Button>
				)}
			</div>
		</PanelView>
	);
}
