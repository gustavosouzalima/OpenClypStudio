import { useEffect, useState } from "react";
import { useEditor } from "./use-editor";

export function useSaveState() {
	const editor = useEditor();
	const [saveState, setSaveState] = useState(() => editor.save.getSaveState());

	useEffect(() => {
		// Poll save state every 100ms to show saving indicator
		const interval = setInterval(() => {
			const newState = editor.save.getSaveState();
			setSaveState(newState);
		}, 100);

		return () => clearInterval(interval);
	}, [editor]);

	return saveState;
}
