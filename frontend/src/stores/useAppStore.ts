import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppMode = "study_hub" | "jira_automation";
export type JiraViewMode = "dashboard" | "sprints" | "calendar" | "team" | "triggers" | "settings";

interface AppState {
  activeApp: AppMode;
  jiraView: JiraViewMode;
  selectedProjectId: string | null;
  selectedSprintId: string | null;
  isUserCredentialsModalOpen: boolean;
  isTasksModalOpen: boolean;

  setActiveApp: (app: AppMode) => void;
  setJiraView: (view: JiraViewMode) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedSprintId: (id: string | null) => void;
  setUserCredentialsModalOpen: (open: boolean) => void;
  setTasksModalOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeApp: "study_hub",
      jiraView: "sprints",
      selectedProjectId: null,
      selectedSprintId: null,
      isUserCredentialsModalOpen: false,
      isTasksModalOpen: false,

      setActiveApp: (activeApp) => set({ activeApp }),
      setJiraView: (jiraView) => set({ jiraView }),
      setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
      setSelectedSprintId: (selectedSprintId) => set({ selectedSprintId }),
      setUserCredentialsModalOpen: (isUserCredentialsModalOpen) => set({ isUserCredentialsModalOpen }),
      setTasksModalOpen: (isTasksModalOpen) => set({ isTasksModalOpen }),
    }),
    {
      name: "meeting_agent_app_state",
      partialize: (state) => ({
        activeApp: state.activeApp,
        jiraView: state.jiraView,
        selectedProjectId: state.selectedProjectId,
      }),
    }
  )
);
