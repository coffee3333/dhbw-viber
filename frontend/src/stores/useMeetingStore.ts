import { create } from "zustand";
import type { Meeting, ChatMessage } from "../types/meeting";


interface MeetingState {
  meetings: Meeting[];
  activeMeeting: Meeting | null;
  isDrawerOpen: boolean;
  activeDrawerTab: "summary" | "transcript" | "chat";
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  isRecording: boolean;
  recordingSeconds: number;
  isLoading: boolean;
  error: string | null;

  setMeetings: (meetings: Meeting[]) => void;
  setActiveMeeting: (meeting: Meeting | null) => void;
  setIsDrawerOpen: (open: boolean) => void;
  setActiveDrawerTab: (tab: "summary" | "transcript" | "chat") => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  addChatMessage: (message: ChatMessage) => void;
  setIsChatLoading: (loading: boolean) => void;
  setIsRecording: (recording: boolean) => void;
  setRecordingSeconds: (seconds: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (err: string | null) => void;
}

export const useMeetingStore = create<MeetingState>((set) => ({
  meetings: [],
  activeMeeting: null,
  isDrawerOpen: false,
  activeDrawerTab: "summary",
  chatMessages: [],
  isChatLoading: false,
  isRecording: false,
  recordingSeconds: 0,
  isLoading: false,
  error: null,

  setMeetings: (meetings) => set({ meetings }),
  setActiveMeeting: (activeMeeting) => set({ activeMeeting }),
  setIsDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
  setActiveDrawerTab: (activeDrawerTab) => set({ activeDrawerTab }),
  setChatMessages: (chatMessages) => set({ chatMessages }),
  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  setIsChatLoading: (isChatLoading) => set({ isChatLoading }),
  setIsRecording: (isRecording) => set({ isRecording }),
  setRecordingSeconds: (recordingSeconds) => set({ recordingSeconds }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
