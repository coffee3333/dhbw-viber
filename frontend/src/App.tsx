import React, { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { AppSidebar } from "./components/AppSidebar";
import { HomePage } from "./pages/homePage/HomePage";
import { AccountPage } from "./pages/accountPage/AccountPage";
import { JiraAutomationPage } from "./pages/jiraPage/JiraAutomationPage";
import { AuthLockscreen } from "./components/AuthLockscreen";
import { RecorderModal } from "./components/RecorderModal";
import { UserCredentialsModal } from "./components/UserCredentialsModal";
import { TasksManagerModal } from "./components/TasksManagerModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useCalendarViewModel } from "./viewmodels/useCalendarViewModel";
import { useAuthViewModel } from "./viewmodels/useAuthViewModel";
import { useSettingsStore } from "./stores/useSettingsStore";
import { useAppStore } from "./stores/useAppStore";

export const App: React.FC = () => {
  const [activePage, setActivePage] = useState<"home" | "account">("home");
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);

  const {
    activeApp,
    setActiveApp,
    isUserCredentialsModalOpen,
    setUserCredentialsModalOpen,
    isTasksModalOpen,
    setTasksModalOpen,
  } = useAppStore();

  const {
    subjects,
    selectedSubjectId,
    currentOrUpcomingLecture,
    isSidebarOpen,
    toggleSidebar,
    selectSubject,
    fetchCalendarData,
  } = useCalendarViewModel();

  const { authRequired, isAuthenticated, currentUser, logout } = useAuthViewModel();
  const googleStatus = useSettingsStore((s) => s.googleStatus);

  useEffect(() => {
    if (currentUser && currentUser.role !== "admin" && activeApp !== "study_hub") {
      setActiveApp("study_hub");
    }
  }, [currentUser, activeApp, setActiveApp]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCalendarData();
    }
  }, [isAuthenticated, fetchCalendarData]);

  const handleNavigateHome = () => {
    setActivePage("home");
    selectSubject(null);
  };

  const handleNavigateAccount = () => {
    setActivePage("account");
  };

  const handleSelectSubjectFromSidebar = (subjectId: string | null) => {
    setActivePage("home");
    selectSubject(subjectId);
  };

  return (
    <ErrorBoundary>
      <div className="bg-[#0b0f19] text-slate-100 min-h-screen flex antialiased selection:bg-indigo-500 selection:text-white overflow-hidden">
        {/* Global Toast Notifications (Sonner) */}
        <Toaster
          position="top-right"
          theme="dark"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: "#0f172a",
              borderColor: "rgba(51, 65, 85, 0.8)",
              color: "#f8fafc",
            },
          }}
        />

        {/* SAP Joule-Style Collapsible Sidebar with App Switcher */}
        <AppSidebar
          activePage={activePage}
          isCollapsed={!isSidebarOpen}
          onToggleCollapse={toggleSidebar}
          onNavigateHome={handleNavigateHome}
          onNavigateAccount={handleNavigateAccount}
          onOpenRecorder={() => setIsRecorderOpen(true)}
          subjects={subjects}
          selectedSubjectId={selectedSubjectId}
          onSelectSubject={handleSelectSubjectFromSidebar}
          currentOrUpcomingLecture={currentOrUpcomingLecture}
          googleConnected={googleStatus?.connected}
          authRequired={authRequired}
          onLogout={logout}
          onOpenCredentialsModal={() => setUserCredentialsModalOpen(true)}
        />

        {/* Main Application Workspace Area */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
          <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
            {activeApp === "jira_automation" && currentUser?.role === "admin" ? (
              <JiraAutomationPage />
            ) : (
              <>
                {activePage === "home" && (
                  <HomePage
                    onOpenRecorder={currentUser?.role === "admin" ? () => setIsRecorderOpen(true) : undefined}
                  />
                )}
                {activePage === "account" && <AccountPage />}
              </>
            )}
          </main>
        </div>

        {/* Global Recorder Modal (Accessible from Sidebar anytime) */}
        <RecorderModal isOpen={isRecorderOpen} onClose={() => setIsRecorderOpen(false)} />

        {/* User Identity & Credentials Modal */}
        <UserCredentialsModal
          isOpen={isUserCredentialsModalOpen}
          onClose={() => setUserCredentialsModalOpen(false)}
        />

        {/* Academic Homework & Tasks Modal (Synced to Google Tasks / Calendar) */}
        <TasksManagerModal
          isOpen={isTasksModalOpen}
          onClose={() => setTasksModalOpen(false)}
        />

        {/* Multi-User & Master Passphrase Lockscreen (Auth Guard) */}
        <AuthLockscreen />
      </div>
    </ErrorBoundary>
  );
};

export default App;
