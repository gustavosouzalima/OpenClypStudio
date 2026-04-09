import type { EditorCore } from "@/core";

function countTimelineTracks(editor: EditorCore) {
	const tracks = editor.timeline.getTracks();
	return Array.isArray(tracks) ? tracks.length : 0;
}

function countTimelineElements(editor: EditorCore) {
	const tracks = editor.timeline.getTracks();
	if (!Array.isArray(tracks)) return 0;
	return tracks.reduce((total, track) => {
		const elements = "elements" in track ? track.elements : [];
		return total + (Array.isArray(elements) ? elements.length : 0);
	}, 0);
}

function countSceneTracks(editor: EditorCore) {
	const scenes = editor.scenes.getScenes();
	if (!Array.isArray(scenes)) return 0;
	return scenes.reduce((total, scene) => {
		const tracks = "tracks" in scene ? scene.tracks : [];
		return total + (Array.isArray(tracks) ? tracks.length : 0);
	}, 0);
}

function countSceneElements(editor: EditorCore) {
	const scenes = editor.scenes.getScenes();
	if (!Array.isArray(scenes)) return 0;
	return scenes.reduce((total, scene) => {
		const tracks = "tracks" in scene ? scene.tracks : [];
		if (!Array.isArray(tracks)) return total;
		return (
			total +
			tracks.reduce((sceneTotal, track) => {
				const elements = "elements" in track ? track.elements : [];
				return sceneTotal + (Array.isArray(elements) ? elements.length : 0);
			}, 0)
		);
	}, 0);
}

export function buildPixelEditorState(editor: EditorCore) {
	const activeProject = editor.project.getActiveOrNull();
	const assets = editor.media.getAssets();

	return {
		last_synced_at: new Date().toISOString(),
		session_summary: {
			project_name: activeProject?.metadata.name || "",
			duration_seconds: Number(activeProject?.metadata.duration || 0),
			fps: Number(activeProject?.settings.fps || 0),
			canvas: activeProject?.settings.canvasSize
				? {
						width: activeProject.settings.canvasSize.width,
						height: activeProject.settings.canvasSize.height,
					}
				: null,
			scenes_count: editor.scenes.getScenes().length,
			scene_tracks_count: countSceneTracks(editor),
			scene_elements_count: countSceneElements(editor),
			timeline_tracks_count: countTimelineTracks(editor),
			timeline_elements_count: countTimelineElements(editor),
			assets_count: Array.isArray(assets) ? assets.length : 0,
		},
	};
}
