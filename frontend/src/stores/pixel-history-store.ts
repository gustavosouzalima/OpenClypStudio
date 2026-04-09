"use client";

import { create } from "zustand";
import { pixelApi } from "@/integrations/pixel/api";
import type { PixelHistoryItem } from "@/integrations/pixel/types";

interface PixelHistoryState {
  history: PixelHistoryItem[];
  isLoading: boolean;
  error: string | null;
  loadHistory: () => Promise<void>;
  deleteItem: (recordId: string, deleteFile?: boolean) => Promise<void>;
  deleteItems: (
    recordIds: string[],
  ) => Promise<{
    requested: number;
    deleted: number;
    failed: Array<{ id: string; reason: string }>;
  }>;
}

export const usePixelHistoryStore = create<PixelHistoryState>((set, get) => ({
  history: [],
  isLoading: false,
  error: null,
  loadHistory: async () => {
    set({ isLoading: true, error: null });
    try {
      const history = await pixelApi.listHistory();
      set({ history, isLoading: false });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Failed to load history",
        isLoading: false,
      });
    }
  },
  deleteItem: async (recordId: string, deleteFile: boolean = false) => {
    set({ isLoading: true, error: null });
    try {
      await pixelApi.deleteHistoryItem(recordId, deleteFile);
      const { history } = get();
      set({
        history: history.filter((item) => item.id !== recordId),
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to delete item",
        isLoading: false,
      });
    }
  },
  deleteItems: async (recordIds: string[]) => {
    set({ isLoading: true, error: null });
    try {
      const result = await pixelApi.deleteHistoryItems(recordIds);
      const { history } = get();
      const deletedIds = new Set(result.deleted_ids);
      set({
        history: history.filter((item) => !deletedIds.has(item.id)),
        isLoading: false,
      });
      return {
        requested: result.requested,
        deleted: result.deleted,
        failed: result.failed,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete items";
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },
}));
