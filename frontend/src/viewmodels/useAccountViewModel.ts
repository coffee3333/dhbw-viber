import { useCallback, useEffect } from "react";
import { useSettingsStore } from "../stores/useSettingsStore";
import { settingsApi } from "../api/settingsApi";
import { googleApi } from "../api/googleApi";
import { showToast } from "../utils/toast";
import type { AppSettings } from "../types/settings";

export function useAccountViewModel() {
  const { settings, googleStatus, isLoading, error, setSettings, setGoogleStatus, setLoading, setError } =
    useSettingsStore();

  const loadAccountData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [appSettings, gStatus] = await Promise.all([
        settingsApi.getSettings(),
        googleApi.getStatus(),
      ]);
      setSettings(appSettings);
      setGoogleStatus(gStatus);
    } catch (err: any) {
      setError(err.message || "Failed to load account data.");
    } finally {
      setLoading(false);
    }
  }, [setSettings, setGoogleStatus, setLoading, setError]);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  const saveSettings = async (updated: Partial<AppSettings>) => {
    try {
      setLoading(true);
      const res = await settingsApi.updateSettings(updated);
      setSettings(res);
      showToast.success("Settings saved successfully!");
    } catch (err: any) {
      // apiClient already displays toast on API errors; fallback just in case
      setError(err.message || "Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  const connectGoogle = async () => {
    try {
      const res = await googleApi.getLoginUrl();
      if (res.auth_url) {
        window.location.href = res.auth_url;
      }
    } catch (err: any) {
      setError(err.message || "Failed to start Google OAuth flow.");
    }
  };

  const disconnectGoogle = async () => {
    try {
      await googleApi.disconnect();
      await loadAccountData();
      showToast.success("Google Workspace disconnected.");
    } catch (err: any) {
      setError(err.message || "Failed to disconnect Google.");
    }
  };

  const syncGoogleCalendar = async () => {
    try {
      setLoading(true);
      const res = await googleApi.syncCalendar();
      showToast.success("Google Calendar Synced", res.message);
    } catch (err: any) {
      setError(err.message || "Failed to sync calendar.");
    } finally {
      setLoading(false);
    }
  };

  const syncGoogleTasks = async () => {
    try {
      setLoading(true);
      const res = await googleApi.syncAllTasks();
      showToast.success(
        "Google Tasks Synced",
        res.message || `Synced ${res.total_items ?? 0} tasks with due dates.`
      );
      return res;
    } catch (err: any) {
      setError(err.message || "Failed to sync tasks to Google Tasks.");
    } finally {
      setLoading(false);
    }
  };

  const pullGoogleTasks = async () => {
    try {
      setLoading(true);
      const res = await googleApi.pullTasks();
      showToast.success(
        "Tasks Status Updated",
        res.message || `Updated completion status from Google Tasks.`
      );
      return res;
    } catch (err: any) {
      setError(err.message || "Failed to pull task updates from Google.");
    } finally {
      setLoading(false);
    }
  };

  return {
    settings,
    googleStatus,
    isLoading,
    error,
    saveSettings,
    connectGoogle,
    disconnectGoogle,
    syncGoogleCalendar,
    syncGoogleTasks,
    pullGoogleTasks,
    refresh: loadAccountData,
  };
}
