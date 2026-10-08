import { create } from "zustand";
import type { AppSettings, GoogleStatus } from "../types/settings";


interface SettingsState {
  settings: AppSettings | null;
  googleStatus: GoogleStatus | null;
  isLoading: boolean;
  error: string | null;

  setSettings: (settings: AppSettings) => void;
  setGoogleStatus: (status: GoogleStatus) => void;
  setLoading: (loading: boolean) => void;
  setError: (err: string | null) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  googleStatus: null,
  isLoading: false,
  error: null,

  setSettings: (settings) => set({ settings }),
  setGoogleStatus: (googleStatus) => set({ googleStatus }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
