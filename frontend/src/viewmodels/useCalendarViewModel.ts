import { useCallback } from "react";
import { useCalendarStore } from "../stores/useCalendarStore";
import { useMeetingStore } from "../stores/useMeetingStore";
import { calendarApi } from "../api/calendarApi";
import type { Lecture, SubjectDetail, CreateSubjectPayload, UpdateSubjectPayload } from "../types/calendar";


export function useCalendarViewModel() {
  const {
    lectures,
    subjects,
    sources,
    currentOrUpcomingLecture,
    selectedLecture,
    activeSubjectFilters,
    currentDate,
    viewMode,
    visibleDays,
    hideWeekends,
    isSidebarOpen,
    isLoading,
    error,
    selectedSubjectId,
    selectedSubjectDetail,
    activeLectureId,
    activeLectureDetail,
    lectureOrigin,
    isGrillMeOpen,
    grillTarget,
    setLectures,
    setSubjects,
    setSources,
    setCurrentOrUpcomingLecture,
    setSelectedLecture,
    setSelectedSubjectId,
    setSelectedSubjectDetail,
    setActiveLectureId,
    setActiveLectureDetail,
    setLectureOrigin,
    navigateToLecturePage,
    openGrillMe,
    closeGrillMe,
    toggleSubjectFilter,
    clearSubjectFilters,
    setCurrentDate,
    setViewMode,
    setVisibleDays,
    setHideWeekends,
    toggleHideWeekends,
    toggleSidebar,
    setSidebarOpen,
    setLoading,
    setError,
  } = useCalendarStore();

  const { setIsDrawerOpen } = useMeetingStore();

  const fetchCalendarData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [lects, subjs, srcs, upcoming] = await Promise.all([
        calendarApi.getLectures(),
        calendarApi.getSubjects(),
        calendarApi.getSources(),
        calendarApi.getCurrentOrUpcoming(),
      ]);
      setLectures(lects);
      setSubjects(subjs);
      setSources(srcs);
      setCurrentOrUpcomingLecture(upcoming);
    } catch (err: any) {
      setError(err.message || "Failed to load timetable.");
    } finally {
      setLoading(false);
    }
  }, [setLectures, setSubjects, setSources, setCurrentOrUpcomingLecture, setLoading, setError]);

  const selectSubject = async (subjectId: string | null) => {
    setSelectedSubjectId(subjectId);
    if (!subjectId) {
      setSelectedSubjectDetail(null);
      setActiveLectureId(null);
      setActiveLectureDetail(null);
      return;
    }
    try {
      setLoading(true);
      const detail = await calendarApi.getSubjectDetail(subjectId);
      setSelectedSubjectDetail(detail);
      setActiveLectureId(null);
      setActiveLectureDetail(null);
    } catch (err: any) {
      setError(err.message || "Failed to load subject details.");
    } finally {
      setLoading(false);
    }
  };

  const selectLectureChainItem = async (lectureId: string | null) => {
    setActiveLectureId(lectureId);
    setLectureOrigin("chain");
    if (!lectureId) {
      setActiveLectureDetail(null);
      return;
    }
    try {
      setLoading(true);
      const detail = await calendarApi.getLectureDetail(lectureId);
      setActiveLectureDetail(detail);
    } catch (err: any) {
      setError(err.message || "Failed to load lecture details.");
    } finally {
      setLoading(false);
    }
  };

  const updateLectureStatus = async (lectureId: string, status: string) => {
    try {
      await calendarApi.updateLectureStatus(lectureId, status);
      // Refresh current subject detail if open
      if (selectedSubjectId) {
        const detail = await calendarApi.getSubjectDetail(selectedSubjectId);
        setSelectedSubjectDetail(detail);
      }
      if (activeLectureId === lectureId) {
        const lecDetail = await calendarApi.getLectureDetail(lectureId);
        setActiveLectureDetail(lecDetail);
      }
      await fetchCalendarData();
    } catch (err: any) {
      throw new Error(err.message || "Failed to update lecture status.");
    }
  };

  const updateLectureNotes = async (lectureId: string, notes: string) => {
    try {
      await calendarApi.updateLectureNotes(lectureId, notes);
      if (activeLectureId === lectureId) {
        const lecDetail = await calendarApi.getLectureDetail(lectureId);
        setActiveLectureDetail(lecDetail);
      }
    } catch (err: any) {
      throw new Error(err.message || "Failed to save lecture notes.");
    }
  };

  const addLectureMaterial = async (lectureId: string, material: { title: string; type?: string; url: string }) => {
    try {
      await calendarApi.addLectureMaterial(lectureId, material);
      if (activeLectureId === lectureId) {
        const lecDetail = await calendarApi.getLectureDetail(lectureId);
        setActiveLectureDetail(lecDetail);
      }
      if (selectedSubjectId) {
        const detail = await calendarApi.getSubjectDetail(selectedSubjectId);
        setSelectedSubjectDetail(detail);
      }
    } catch (err: any) {
      throw new Error(err.message || "Failed to add material.");
    }
  };

  const uploadLectureMaterial = async (lectureId: string, file: File, materialType?: string) => {
    try {
      const res = await calendarApi.uploadLectureMaterial(lectureId, file, materialType);
      if (activeLectureId === lectureId) {
        const lecDetail = await calendarApi.getLectureDetail(lectureId);
        setActiveLectureDetail(lecDetail);
      }
      if (selectedSubjectId) {
        const detail = await calendarApi.getSubjectDetail(selectedSubjectId);
        setSelectedSubjectDetail(detail);
      }
      return res;
    } catch (err: any) {
      throw new Error(err.message || "Failed to upload material file.");
    }
  };

  const generateLectureSummary = async (lectureId: string, customInstructions?: string) => {
    try {
      setLoading(true);
      const res = await calendarApi.generateLectureSummary(lectureId, customInstructions);
      if (activeLectureId === lectureId) {
        const lecDetail = await calendarApi.getLectureDetail(lectureId);
        setActiveLectureDetail(lecDetail);
      }
      if (selectedSubjectId) {
        const detail = await calendarApi.getSubjectDetail(selectedSubjectId);
        setSelectedSubjectDetail(detail);
      }
      return res;
    } catch (err: any) {
      throw new Error(err.message || "Failed to generate master summary.");
    } finally {
      setLoading(false);
    }
  };

  const deleteLectureMaterial = async (lectureId: string, materialId: string) => {
    try {
      await calendarApi.deleteLectureMaterial(lectureId, materialId);
      if (activeLectureId === lectureId) {
        const lecDetail = await calendarApi.getLectureDetail(lectureId);
        setActiveLectureDetail(lecDetail);
      }
      if (selectedSubjectId) {
        const detail = await calendarApi.getSubjectDetail(selectedSubjectId);
        setSelectedSubjectDetail(detail);
      }
    } catch (err: any) {
      throw new Error(err.message || "Failed to delete material.");
    }
  };

  const syncUrl = async (url: string, name?: string) => {
    try {
      setLoading(true);
      const res = await calendarApi.syncUrl({ url, name });
      await fetchCalendarData();
      return res;
    } catch (err: any) {
      throw new Error(err.message || "Failed to sync calendar URL.");
    } finally {
      setLoading(false);
    }
  };

  const uploadIcs = async (file: File) => {
    try {
      setLoading(true);
      const res = await calendarApi.uploadIcs(file);
      await fetchCalendarData();
      return res;
    } catch (err: any) {
      throw new Error(err.message || "Failed to upload .ics calendar file.");
    } finally {
      setLoading(false);
    }
  };

  const deleteSource = async (sourceId: number) => {
    try {
      setLoading(true);
      await calendarApi.deleteSource(sourceId);
      await fetchCalendarData();
    } catch (err: any) {
      throw new Error(err.message || "Failed to remove calendar source.");
    } finally {
      setLoading(false);
    }
  };

  const refreshAllSources = async () => {
    try {
      setLoading(true);
      const res = await calendarApi.refreshAll();
      await fetchCalendarData();
      return res;
    } catch (err: any) {
      throw new Error(err.message || "Failed to refresh schedules.");
    } finally {
      setLoading(false);
    }
  };

  const clearAllTimetable = async () => {
    try {
      setLoading(true);
      await calendarApi.clearAll();
      await fetchCalendarData();
    } catch (err: any) {
      throw new Error(err.message || "Failed to clear timetable.");
    } finally {
      setLoading(false);
    }
  };

  const createSubject = async (payload: CreateSubjectPayload) => {
    try {
      setLoading(true);
      const res = await calendarApi.createSubject(payload);
      await fetchCalendarData();
      return res;
    } catch (err: any) {
      throw new Error(err.message || "Failed to create subject.");
    } finally {
      setLoading(false);
    }
  };

  const updateSubject = async (subjectId: string, payload: UpdateSubjectPayload) => {
    try {
      setLoading(true);
      const res = await calendarApi.updateSubject(subjectId, payload);
      if (selectedSubjectId === subjectId) {
        try {
          const detail = await calendarApi.getSubjectDetail(subjectId);
          setSelectedSubjectDetail(detail);
        } catch {
          // Ignore
        }
      }
      await fetchCalendarData();
      return res;
    } catch (err: any) {
      throw new Error(err.message || "Failed to update subject.");
    } finally {
      setLoading(false);
    }
  };

  const deleteSubject = async (subjectId: string) => {
    try {
      setLoading(true);
      await calendarApi.deleteSubject(subjectId);
      if (selectedSubjectId === subjectId) {
        setSelectedSubjectId(null);
        setSelectedSubjectDetail(null);
      }
      await fetchCalendarData();
    } catch (err: any) {
      throw new Error(err.message || "Failed to delete subject.");
    } finally {
      setLoading(false);
    }
  };

  const cleanupHolidays = async () => {
    try {
      setLoading(true);
      const res = await calendarApi.cleanupHolidays();
      await fetchCalendarData();
      return res;
    } catch (err: any) {
      throw new Error(err.message || "Failed to cleanup holidays.");
    } finally {
      setLoading(false);
    }
  };

  const selectLecture = async (lecture: Lecture | null) => {
    if (!lecture) {
      setSelectedLecture(null);
      setIsDrawerOpen(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setIsDrawerOpen(false);

      // 1. Fetch full lecture details
      const lectureDetail = await calendarApi.getLectureDetail(lecture.id);

      // 2. Fetch or build subject details
      const subjectId = lecture.extendedProps?.subject_id || lectureDetail.subject?.id;
      let subjectDetail: SubjectDetail | null = null;

      if (subjectId) {
        try {
          subjectDetail = await calendarApi.getSubjectDetail(subjectId);
        } catch (e) {
          console.warn("Failed to fetch subject detail, generating fallback:", e);
        }
      }

      if (!subjectDetail) {
        subjectDetail = {
          id: subjectId || "general",
          name: lectureDetail.subject?.name || lecture.extendedProps?.subject_name || "Course Subject",
          code: null,
          lecturer: lectureDetail.subject?.lecturer || lecture.extendedProps?.lecturer || null,
          color: lectureDetail.subject?.color || lecture.backgroundColor || "#4f46e5",
          semester: null,
          stats: { total: 1, completed: 0, upcoming: 1, postponed: 0, canceled: 0 },
          lectures: [],
        };
      }

      // 3. Atomically navigate to the lecture page with origin = 'schedule'
      navigateToLecturePage(
        subjectDetail.id,
        subjectDetail,
        lecture.id,
        lectureDetail,
        "schedule"
      );
    } catch (err: any) {
      setError(err.message || "Failed to load lecture page.");
    } finally {
      setLoading(false);
    }
  };

  // Filter lectures based on selected subjects
  const filteredLectures = lectures.filter((lec) => {
    if (activeSubjectFilters.length === 0) return true;
    const subjId = lec.extendedProps.subject_id;
    return subjId ? activeSubjectFilters.includes(subjId) : true;
  });

  return {
    lectures: filteredLectures,
    allLectures: lectures,
    subjects,
    sources,
    currentOrUpcomingLecture,
    selectedLecture,
    activeSubjectFilters,
    selectedSubjectId,
    selectedSubjectDetail,
    activeLectureId,
    activeLectureDetail,
    lectureOrigin,
    isGrillMeOpen,
    grillTarget,
    currentDate,
    viewMode,
    visibleDays,
    isSidebarOpen,
    isLoading,
    error,
    fetchCalendarData,
    selectSubject,
    selectLectureChainItem,
    updateLectureStatus,
    updateLectureNotes,
    addLectureMaterial,
    uploadLectureMaterial,
    generateLectureSummary,
    deleteLectureMaterial,
    openGrillMe,
    closeGrillMe,
    syncUrl,
    uploadIcs,
    deleteSource,
    refreshAllSources,
    clearAllTimetable,
    createSubject,
    updateSubject,
    deleteSubject,
    cleanupHolidays,
    toggleSubjectFilter,
    clearSubjectFilters,
    setCurrentDate,
    setViewMode,
    setVisibleDays,
    hideWeekends,
    setHideWeekends,
    toggleHideWeekends,
    toggleSidebar,
    setSidebarOpen,
    selectLecture,
  };
}

