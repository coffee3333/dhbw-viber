import { apiClient } from "./client";
import type { AppSettings } from "../types/settings";

export const settingsApi = {
  async getSettings(): Promise<AppSettings> {
    const res = await apiClient.get<AppSettings>("/settings/");
    return res.data;
  },

  async updateSettings(payload: Partial<AppSettings>): Promise<AppSettings> {
    const res = await apiClient.put<AppSettings>("/settings/", payload);
    return res.data;
  },
};
