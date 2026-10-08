import { create } from "zustand";
import type { Lecture, Subject, CalendarSource, SubjectDetail, LectureDetail } from "../types/calendar";

interface CalendarState {
  lectures: Lecture[];
  subjects: Subject[];
  sources: CalendarSource[];
  currentOrUpcomingLecture: Lecture | null;
  selectedLecture: Lecture | null;
  activeSubjectFilters: string[]; // empty means all shown
  selectedSubjectId: string | null;
  selectedSubjectDetail: SubjectDetail | null;
  activeLectureId: string | null;
  activeLectureDetail: LectureDetail | null;
  isGrillMeOpen: boolean;
  grillTarget: { subjectId?: string; subjectName?: string; lectureId?: string; lectureTitle?: string } | null;
  currentDate: Date;
  viewMode: "timeGridWeek" | "timeGridDay" | "dayGridMonth";
  visibleDays: number; // 3, 5, or 7 days
  isSidebarOpen: boolean;
  isLoading: boolean;
  error: string | null;

  setLectures: (lectures: Lecture[]) => void;
  setSubjects: (subjects: Subject[]) => void;
  setSources: (sources: CalendarSource[]) => void;
  setCurrentOrUpcomingLecture: (lecture: Lecture | null) => void;
  setSelectedLecture: (lecture: Lecture | null) => void;
  setSelectedSubjectId: (id: string | null) => void;
  setSelectedSubjectDetail: (detail: SubjectDetail | null) => void;
  setActiveLectureId: (id: string | null) => void;
  setActiveLectureDetail: (detail: LectureDetail | null) => void;
  openGrillMe: (target?: { subjectId?: string; subjectName?: string; lectureId?: string; lectureTitle?: string }) => void;
  closeGrillMe: () => void;
  toggleSubjectFilter: (subjectId: string) => void;
  clearSubjectFilters: () => void;
  setCurrentDate: (date: Date) => void;
  setViewMode: (mode: "timeGridWeek" | "timeGridDay" | "dayGridMonth") => void;
  setVisibleDays: (days: number) => void;
  hideWeekends: boolean;
  setHideWeekends: (hide: boolean) => void;
  toggleHideWeekends: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  toggleSidebar: () => void;
  lectureOrigin: "schedule" | "chain";
  setLectureOrigin: (origin: "schedule" | "chain") => void;
  navigateToLecturePage: (
    subjectId: string,
    subjectDetail: SubjectDetail,
    lectureId: string,
    lectureDetail: LectureDetail,
    origin?: "schedule" | "chain"
  ) => void;
  setLoading: (loading: boolean) => void;
  setError: (err: string | null) => void;
}

function getInitialHideWeekends(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const saved = localStorage.getItem("meeting_agent_hide_weekends");
    if (saved !== null) {
      return saved === "true";
    }
  } catch {}
  return false;
}

function getInitialSidebarOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const saved = localStorage.getItem("meeting_agent_sidebar_open");
    if (saved !== null) {
      return saved === "true";
    }
  } catch {}
  return true;
}

export const useCalendarStore = create<CalendarState>((set) => ({
  lectures: [],
  subjects: [],
  sources: [],
  currentOrUpcomingLecture: null,
  selectedLecture: null,
  activeSubjectFilters: [],
  selectedSubjectId: null,
  selectedSubjectDetail: null,
  activeLectureId: null,
  activeLectureDetail: null,
  isGrillMeOpen: false,
  grillTarget: null,
  currentDate: new Date(),
  viewMode: (typeof window !== "undefined" && (localStorage.getItem("meeting_agent_view_mode") as any)) || "timeGridWeek",
  visibleDays: (typeof window !== "undefined" && parseInt(localStorage.getItem("meeting_agent_visible_days") || "5", 10)) || 5,
  hideWeekends: getInitialHideWeekends(),
  isSidebarOpen: getInitialSidebarOpen(),
  lectureOrigin: "chain",
  isLoading: false,
  error: null,

  setLectures: (lectures) => set({ lectures }),
  setSubjects: (subjects) => set({ subjects }),
  setSources: (sources) => set({ sources }),
  setCurrentOrUpcomingLecture: (currentOrUpcomingLecture) => set({ currentOrUpcomingLecture }),
  setSelectedLecture: (selectedLecture) => set({ selectedLecture }),
  setSelectedSubjectId: (selectedSubjectId) => set({ selectedSubjectId, activeLectureId: null, activeLectureDetail: null }),
  setSelectedSubjectDetail: (selectedSubjectDetail) => set({ selectedSubjectDetail }),
  setActiveLectureId: (activeLectureId) => set({ activeLectureId }),
  setActiveLectureDetail: (activeLectureDetail) => set({ activeLectureDetail }),
  setLectureOrigin: (lectureOrigin) => set({ lectureOrigin }),
  navigateToLecturePage: (subjectId, subjectDetail, lectureId, lectureDetail, origin = "schedule") =>
    set({
      selectedSubjectId: subjectId,
      selectedSubjectDetail: subjectDetail,
      activeLectureId: lectureId,
      activeLectureDetail: lectureDetail,
      lectureOrigin: origin,
      selectedLecture: null,
    }),
  openGrillMe: (grillTarget) => set({ isGrillMeOpen: true, grillTarget: grillTarget || null }),
  closeGrillMe: () => set({ isGrillMeOpen: false, grillTarget: null }),
  toggleSubjectFilter: (subjectId) =>
    set((state) => {
      const exists = state.activeSubjectFilters.includes(subjectId);
      const activeSubjectFilters = exists
        ? state.activeSubjectFilters.filter((id) => id !== subjectId)
        : [...state.activeSubjectFilters, subjectId];
      return { activeSubjectFilters };
    }),
  clearSubjectFilters: () => set({ activeSubjectFilters: [] }),
  setCurrentDate: (currentDate) => set({ currentDate }),
  setViewMode: (viewMode) => {
    try {
      localStorage.setItem("meeting_agent_view_mode", viewMode);
    } catch {}
    set({ viewMode });
  },
  setVisibleDays: (visibleDays) => {
    try {
      localStorage.setItem("meeting_agent_visible_days", String(visibleDays));
    } catch {}
    set({ visibleDays });
  },
  setHideWeekends: (hideWeekends) => {
    try {
      localStorage.setItem("meeting_agent_hide_weekends", String(hideWeekends));
    } catch {}
    set({ hideWeekends });
  },
  toggleHideWeekends: () =>
    set((state) => {
      const next = !state.hideWeekends;
      try {
        localStorage.setItem("meeting_agent_hide_weekends", String(next));
      } catch {}
      return { hideWeekends: next };
    }),
  setSidebarOpen: (isSidebarOpen) => {
    try {
      localStorage.setItem("meeting_agent_sidebar_open", String(isSidebarOpen));
    } catch {}
    set({ isSidebarOpen });
  },
  toggleSidebar: () =>
    set((state) => {
      const next = !state.isSidebarOpen;
      try {
        localStorage.setItem("meeting_agent_sidebar_open", String(next));
      } catch {}
      return { isSidebarOpen: next };
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
