import React, { useState, useRef, useEffect } from "react";
import {
  GraduationCap,
  Calendar,
  User,
  PanelLeftClose,
  PanelLeft,
  Disc,
  LogOut,
  ChevronDown,
  Check,
  ListTodo,
  CalendarDays,
} from "lucide-react";
import { useAppStore } from "../stores/useAppStore";
import { useAuthViewModel } from "../viewmodels/useAuthViewModel";
import type { Subject, Lecture } from "../types/calendar";

interface AppSidebarProps {
  activePage: "home" | "account";
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onNavigateHome: () => void;
  onNavigateAccount: () => void;
  onOpenRecorder: () => void;
  subjects: Subject[];
  selectedSubjectId: string | null;
  onSelectSubject: (subjectId: string | null) => void;
  currentOrUpcomingLecture: Lecture | null;
  googleConnected?: boolean;
  authRequired?: boolean;
  onLogout?: () => void;
  onOpenCredentialsModal: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activePage,
  isCollapsed,
  onToggleCollapse,
  onNavigateHome,
  onNavigateAccount: _onNavigateAccount,
  onOpenRecorder,
  subjects,
  selectedSubjectId,
  onSelectSubject,
  currentOrUpcomingLecture: _currentLecture,
  googleConnected,
  authRequired: _authReq,
  onLogout,
  onOpenCredentialsModal,
}) => {
  const {
    activeApp,
    setActiveApp,
    setJiraView,
    isTasksModalOpen,
    setTasksModalOpen,
  } = useAppStore();
  const { currentUser } = useAuthViewModel();
  const isAdmin = currentUser?.role === "admin";
  const [isAppSwitcherOpen, setIsAppSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Close app switcher dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setIsAppSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setIsAppSwitcherOpen(false);
  }, [isCollapsed]);

  const handleSelectApp = (app: "study_hub" | "jira_automation") => {
    setActiveApp(app);
    setIsAppSwitcherOpen(false);
    if (app === "study_hub") {
      onNavigateHome();
    } else {
      setJiraView("calendar");
    }
  };

  return (
    <aside
      className={`relative z-30 flex flex-col bg-[#0d1322] border-r border-slate-800/80 transition-all duration-300 ease-in-out select-none flex-shrink-0 ${
        isCollapsed ? "w-[72px]" : "w-72"
      }`}
    >
      {/* 1. TOP HEADER: App Switcher Dropdown */}
      <div className="h-16 px-3.5 border-b border-slate-800/80 bg-[#0f172a]/80 flex items-center justify-between relative" ref={switcherRef}>
        <button
          onClick={isAdmin ? () => setIsAppSwitcherOpen(!isAppSwitcherOpen) : undefined}
          className={`flex items-center space-x-3 text-left group overflow-hidden w-full py-1.5 px-1 rounded-xl transition ${
            isAdmin ? "cursor-pointer hover:bg-slate-800/50" : "cursor-default"
          }`}
          title={isAdmin ? "Click to Switch Application" : "DHBW StudyHub"}
        >
          {/* Dynamic App Logo */}
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 ${isAdmin ? "group-hover:scale-105" : ""} transition-transform duration-200 ${
              activeApp === "study_hub"
                ? "bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 shadow-indigo-500/25"
                : "bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 shadow-indigo-600/30"
            }`}
          >
            {activeApp === "study_hub" ? (
              <GraduationCap className="w-5 h-5 text-white" />
            ) : (
              <ListTodo className="w-5 h-5 text-white" />
            )}
          </div>

          {!isCollapsed && (
            <div className="flex items-center justify-between min-w-0 flex-1">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-sm tracking-tight text-white group-hover:text-indigo-300 transition truncate">
                    {activeApp === "study_hub" ? "StudyHub" : "Jira Tasks"}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider border ${
                      activeApp === "study_hub"
                        ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                        : "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                    }`}
                  >
                    {activeApp === "study_hub" ? "Academic" : "Automation"}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 truncate">
                  {activeApp === "study_hub" ? "DHBW Student Manager" : "Task Scheduler & Sync"}
                </span>
              </div>
              {isAdmin && (
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 group-hover:text-white transition-transform ${
                    isAppSwitcherOpen ? "rotate-180" : ""
                  }`}
                />
              )}
            </div>
          )}
        </button>

        {/* Dropdown Menu Modal */}
        {isAppSwitcherOpen && (
          <div
            className={`absolute z-50 bg-[#0f172a] border border-slate-700/90 rounded-2xl shadow-2xl p-2.5 space-y-1.5 backdrop-blur-xl ${
              isCollapsed
                ? "top-2 left-[76px] w-72 shadow-cyan-950/40"
                : "top-[68px] left-2 right-2"
            }`}
          >
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Switch Application
            </div>

            {/* Option 1: Study Hub */}
            <button
              onClick={() => handleSelectApp("study_hub")}
              className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left transition cursor-pointer ${
                activeApp === "study_hub"
                  ? "bg-indigo-600/20 border border-indigo-500/30 text-white"
                  : "hover:bg-slate-800/80 text-slate-300 border border-transparent"
              }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-100 truncate">Academic Study Hub</div>
                  <div className="text-[10px] text-slate-400 truncate">Lectures, calendar, AI summaries</div>
                </div>
              </div>
              {activeApp === "study_hub" && <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
            </button>

            {/* Option 2: Jira Automation */}
            <button
              onClick={() => handleSelectApp("jira_automation")}
              className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left transition cursor-pointer ${
                activeApp === "jira_automation"
                  ? "bg-cyan-600/20 border border-cyan-500/30 text-white"
                  : "hover:bg-slate-800/80 text-slate-300 border border-transparent"
              }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-cyan-600/30 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
                  <ListTodo className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-100 truncate">Jira Automation</div>
                  <div className="text-[10px] text-slate-400 truncate">Schedule tasks, sprints & status sync</div>
                </div>
              </div>
              {activeApp === "jira_automation" && <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
            </button>
          </div>
        )}
      </div>

      {/* 2. DYNAMIC NAVIGATION BASED ON ACTIVE APP */}
      {activeApp === "study_hub" ? (
        /* Academic Study Hub Navigation */
        <>
          <div className="p-3 space-y-1.5 border-b border-slate-800/60">
            <button
              onClick={onNavigateHome}
              className={`w-full flex items-center rounded-xl transition text-xs font-semibold cursor-pointer ${
                isCollapsed ? "justify-center p-2.5" : "px-3 py-2 space-x-2.5"
              } ${
                activePage === "home" && selectedSubjectId === null && !isTasksModalOpen
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
              }`}
              title="Schedule & Lectures"
            >
              <Calendar className="w-4 h-4 flex-shrink-0 text-indigo-400" />
              {!isCollapsed && <span className="truncate">Schedule & Lectures</span>}
            </button>

            <button
              onClick={() => setTasksModalOpen(true)}
              className={`w-full flex items-center rounded-xl transition text-xs font-semibold cursor-pointer ${
                isCollapsed ? "justify-center p-2.5" : "px-3 py-2 space-x-2.5"
              } ${
                isTasksModalOpen
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
              }`}
              title="Homework & Google Tasks"
            >
              <ListTodo className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              {!isCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate">Homework & Tasks</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    Sync
                  </span>
                </div>
              )}
            </button>


          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            {!isCollapsed ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <span>Subjects & Modules</span>
                  <span className="bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded-full font-mono">
                    {subjects.length}
                  </span>
                </div>

                <div className="space-y-1 pt-1">
                  {subjects.map((sub) => {
                    const isSelected = selectedSubjectId === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => onSelectSubject(isSelected ? null : sub.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer text-left ${
                          isSelected
                            ? "bg-slate-800/90 text-white font-semibold border border-indigo-500/40 shadow-sm"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: sub.color || "#6366f1" }}
                          />
                          <span className="truncate">{sub.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                          {sub.lectures_count ?? 0}
                        </span>
                      </button>
                    );
                  })}
                  {subjects.length === 0 && (
                    <div className="p-3 text-center text-xs text-slate-500">No subjects loaded.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2 flex flex-col items-center">
                {subjects.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => onSelectSubject(selectedSubjectId === sub.id ? null : sub.id)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer ${
                      selectedSubjectId === sub.id
                        ? "bg-indigo-600/30 border border-indigo-500"
                        : "hover:bg-slate-800/60 border border-transparent"
                    }`}
                    title={sub.name}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: sub.color || "#6366f1" }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Jira Automation Navigation */
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {!isCollapsed && <span>Task Automation</span>}
          </div>

          <button
            onClick={() => setJiraView("calendar")}
            className={`w-full flex items-center rounded-xl transition text-xs font-semibold cursor-pointer ${
              isCollapsed ? "justify-center p-2.5" : "px-3 py-2 space-x-2.5"
            } bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-bold shadow-sm`}
            title="Schedule & Timeline"
          >
            <CalendarDays className="w-4 h-4 flex-shrink-0 text-cyan-400" />
            {!isCollapsed && <span className="truncate">Schedule & Timeline</span>}
          </button>
        </div>
      )}

      {/* 3. BOTTOM SECTION: User Profile, Recorder/Action, and Collapse Toggle */}
      <div className="p-3 border-t border-slate-800/80 space-y-2 bg-[#0a0e1a]/80">
        {/* Quick Action Button (Admin Only, Study Hub only) */}
        {isAdmin && activeApp === "study_hub" && (
          <button
            onClick={onOpenRecorder}
            className={`w-full flex items-center justify-center rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition cursor-pointer shadow-md shadow-red-600/20 ${
              isCollapsed ? "p-2.5" : "py-2 px-3 space-x-2"
            }`}
            title="Record Lecture"
          >
            <Disc className="w-4 h-4" />
            {!isCollapsed && <span>Record Lecture</span>}
          </button>
        )}

        {/* User Profile Bar */}
        <div className="flex items-center space-x-1">
          <button
            onClick={onOpenCredentialsModal}
            className={`flex-1 flex items-center rounded-xl transition text-xs font-semibold cursor-pointer ${
              isCollapsed ? "justify-center p-2.5" : "px-3 py-2 space-x-2.5"
            } text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent`}
            title={currentUser ? `${currentUser.display_name} (${currentUser.role})` : "Account & Settings"}
          >
            <div className="w-5 h-5 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0">
              <User className="w-3.5 h-3.5" />
            </div>

            {!isCollapsed && (
              <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center space-x-1.5 truncate">
                  <span className="truncate font-medium text-slate-300">
                    {currentUser?.display_name || "Account"}
                  </span>
                  {googleConnected && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse"
                      title="Google Workspace Connected"
                    />
                  )}
                </div>
                {currentUser?.role === "admin" ? (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-950 text-purple-300 border border-purple-500/30 uppercase font-bold">
                    Admin
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 border border-slate-700 uppercase font-medium">
                    Member
                  </span>
                )}
              </div>
            )}
          </button>

          {!isCollapsed && onLogout && (
            <button
              onClick={onLogout}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Collapse / Expand Toggle Button */}
        <button
          onClick={onToggleCollapse}
          className={`w-full flex items-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition text-xs font-medium cursor-pointer ${
            isCollapsed ? "justify-center p-2" : "px-3 py-1.5 space-x-2"
          }`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? (
            <PanelLeft className="w-4 h-4 text-indigo-400 hover:scale-110 transition-transform" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4 text-slate-400" />
              <span>Collapse Panel</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
