import { useCallback, useEffect } from "react";
import { useCalendarStore } from "../stores/useCalendarStore";
import { useMeetingStore } from "../stores/useMeetingStore";
import { meetingsApi } from "../api/meetingsApi";
import { googleApi } from "../api/googleApi";
import { showToast } from "../utils/toast";

export function useLectureDrawerViewModel() {
  const { selectedLecture, setSelectedLecture } = useCalendarStore();
  const {
    activeMeeting,
    isDrawerOpen,
    activeDrawerTab,
    chatMessages,
    isChatLoading,
    setActiveMeeting,
    setIsDrawerOpen,
    setActiveDrawerTab,
    setChatMessages,
    addChatMessage,
    setIsChatLoading,
  } = useMeetingStore();

  // Load meeting data whenever selected lecture changes
  const loadLectureMeeting = useCallback(async (recordingId?: string | null) => {
    if (!recordingId) {
      setActiveMeeting(null);
      setChatMessages([]);
      return;
    }
    try {
      const meeting = await meetingsApi.getMeeting(recordingId);
      setActiveMeeting(meeting);
      setChatMessages([]);
    } catch (err: any) {
      console.error("Failed to load recording:", err);
      setActiveMeeting(null);
    }
  }, [setActiveMeeting, setChatMessages]);

  useEffect(() => {
    if (selectedLecture?.extendedProps?.recording_id) {
      loadLectureMeeting(selectedLecture.extendedProps.recording_id);
    } else {
      setActiveMeeting(null);
    }
  }, [selectedLecture, loadLectureMeeting, setActiveMeeting]);

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedLecture(null);
    setActiveMeeting(null);
  };

  const sendChatMessage = async (text: string) => {
    if (!text.trim() || !activeMeeting) return;
    const userMsg = {
      id: Math.random().toString(36).substring(7),
      sender: "user" as const,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    addChatMessage(userMsg);
    setIsChatLoading(true);

    try {
      const res = await meetingsApi.chat(activeMeeting.id, text);
      const aiMsg = {
        id: Math.random().toString(36).substring(7),
        sender: "ai" as const,
        text: res.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        sources: res.sources,
      };
      addChatMessage(aiMsg);
    } catch (err: any) {
      addChatMessage({
        id: Math.random().toString(36).substring(7),
        sender: "ai" as const,
        text: `Error: ${err.message || "Failed to query tutor."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  const pushTasksToGoogle = async () => {
    if (!activeMeeting) return;
    try {
      const res = await googleApi.syncTasks(activeMeeting.id);
      showToast.success("Tasks Synced", res.message);
    } catch {
      // Handled by global API interceptor
    }
  };

  const backupToGoogleDrive = async () => {
    if (!activeMeeting) return;
    try {
      const res = await googleApi.backupDrive(activeMeeting.id);
      showToast.success("Backup Completed", res.message);
    } catch {
      // Handled by global API interceptor
    }
  };

  const syncThisLectureToCalendar = async () => {
    if (!selectedLecture) return;
    try {
      const res = await googleApi.syncLecture(selectedLecture.id);
      showToast.success("Calendar Synced", res.message);
    } catch {
      // Handled by global API interceptor
    }
  };

  const exportMarkdown = async () => {
    if (!activeMeeting) return;
    try {
      const blob = await meetingsApi.exportNotes(activeMeeting.id, "markdown");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeMeeting.title.replace(/[^a-zA-Z0-9_\-]+/g, "_")}_notes.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast.success("Export Downloaded", "Markdown lecture notes downloaded!");
    } catch {
      // Handled by global API interceptor
    }
  };

  return {
    lecture: selectedLecture,
    meeting: activeMeeting,
    isOpen: isDrawerOpen,
    activeTab: activeDrawerTab,
    chatMessages,
    isChatLoading,
    setActiveTab: setActiveDrawerTab,
    closeDrawer,
    sendChatMessage,
    pushTasksToGoogle,
    backupToGoogleDrive,
    syncThisLectureToCalendar,
    exportMarkdown,
  };
}
