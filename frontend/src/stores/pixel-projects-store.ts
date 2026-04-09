"use client";

import { create } from "zustand";
import { pixelApi } from "@/integrations/pixel/api";
import type { PixelProject } from "@/integrations/pixel/types";

interface PixelProjectsState {
	projects: PixelProject[];
	isLoading: boolean;
	error: string | null;
	loadProjects: () => Promise<void>;
}

export const usePixelProjectsStore = create<PixelProjectsState>((set) => ({
	projects: [],
	isLoading: false,
	error: null,
	loadProjects: async () => {
		set({ isLoading: true, error: null });
		try {
			const projects = await pixelApi.listProjects();
			set({ projects, isLoading: false });
		} catch (error) {
			set({
				error: error instanceof Error ? error.message : "Failed to load projects",
				isLoading: false,
			});
		}
	},
}));
