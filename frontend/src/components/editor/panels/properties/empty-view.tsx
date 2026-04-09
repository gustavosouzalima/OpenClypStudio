import { HugeiconsIcon } from "@hugeicons/react";
import { Cursor01Icon } from "@hugeicons/core-free-icons";

export function EmptyView() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
			<div className="flex size-16 items-center justify-center rounded-lg bg-muted/30">
				<HugeiconsIcon
					icon={Cursor01Icon}
					className="text-muted-foreground size-8"
					strokeWidth={1.25}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<p className="text-sm font-medium text-foreground">No element selected</p>
				<p className="text-muted-foreground text-xs text-balance leading-relaxed">
					Click a clip or element in the timeline to edit its properties here.
				</p>
			</div>
		</div>
	);
}
