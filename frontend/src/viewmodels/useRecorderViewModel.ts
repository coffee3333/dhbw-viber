import { useState, useRef, useEffect } from "react";

import { useMeetingStore } from "../stores/useMeetingStore";
import { useCalendarStore } from "../stores/useCalendarStore";
import { meetingsApi } from "../api/meetingsApi";
import { showToast } from "../utils/toast";

export function useRecorderViewModel() {
  const { isRecording, recordingSeconds, setIsRecording, setRecordingSeconds } = useMeetingStore();
  const { lectures, currentOrUpcomingLecture } = useCalendarStore();

  const [audioSource, setAudioSource] = useState<"both" | "system" | "mic">("both");
  const [selectedLectureId, setSelectedLectureId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [template, setTemplate] = useState<string>("moodle_lecture");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeStreamsRef = useRef<MediaStream[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Auto-fill upcoming lecture if available
  useEffect(() => {
    if (currentOrUpcomingLecture && !selectedLectureId) {
      setSelectedLectureId(currentOrUpcomingLecture.id);
      setTitle(currentOrUpcomingLecture.title);
    }
  }, [currentOrUpcomingLecture, selectedLectureId]);

  const startWaveformVisualizer = (stream: MediaStream) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = "rgb(15, 23, 42)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          ctx.fillStyle = `rgb(99, 102, 241)`;
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }
      };

      draw();
    } catch (e) {
      console.error("Waveform error:", e);
    }
  };

  const startRecording = async () => {
    try {
      recordedChunksRef.current = [];
      activeStreamsRef.current = [];
      const streamsToMix: MediaStream[] = [];

      // 1. Capture system audio if selected
      if (audioSource === "system" || audioSource === "both") {
        try {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true, // DisplayMedia requires video
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
          const audioTracks = displayStream.getAudioTracks();
          if (audioTracks.length > 0) {
            const systemAudioStream = new MediaStream(audioTracks);
            streamsToMix.push(systemAudioStream);
            activeStreamsRef.current.push(displayStream);
          } else {
            alert("No system audio track detected. Please make sure to check 'Share system audio'.");
          }
        } catch (e) {
          console.warn("Display media error or canceled:", e);
          if (audioSource === "system") throw e;
        }
      }

      // 2. Capture microphone if selected
      if (audioSource === "mic" || audioSource === "both") {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          streamsToMix.push(micStream);
          activeStreamsRef.current.push(micStream);
        } catch (e) {
          console.warn("Microphone access failed:", e);
          if (audioSource === "mic") throw e;
        }
      }

      if (streamsToMix.length === 0) {
        alert("No audio stream could be captured.");
        return;
      }

      // 3. Mix streams with AudioContext
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const destination = audioCtx.createMediaStreamDestination();

      streamsToMix.forEach((stream) => {
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(destination);
      });

      startWaveformVisualizer(destination.stream);

      // 4. Start MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(destination.stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.start(1000); // 1-second chunks
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(useMeetingStore.getState().recordingSeconds + 1);
      }, 1000);
      showToast.info("Recording Started", "Capturing audio session...");
    } catch (err: any) {
      showToast.error("Recording Error", `Could not start recording: ${err.message}`);
    }
  };

  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return;

    clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    return new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current!;
      recorder.onstop = async () => {
        setIsRecording(false);
        setIsProcessing(true);
        setStatusMessage("Uploading and generating AI notes...");

        // Stop all media tracks
        activeStreamsRef.current.forEach((stream) => {
          stream.getTracks().forEach((track) => track.stop());
        });
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }

        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", blob, `live_lecture_${Date.now()}.webm`);
        if (title.trim()) formData.append("title", title);
        if (selectedLectureId) formData.append("lecture_id", selectedLectureId);
        formData.append("template", template);

        try {
          await meetingsApi.recordBlob(formData);
          setStatusMessage("AI lecture notes created successfully!");
          showToast.success("Recording Processed", "AI lecture summary and notes generated!");
          resolve();
        } catch {
          // Handled by global API interceptor
          resolve();
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.stop();
    });
  };

  const uploadFile = async (file: File) => {
    setIsProcessing(true);
    setStatusMessage("Uploading media file...");
    const formData = new FormData();
    formData.append("file", file);
    if (title.trim()) formData.append("title", title);
    if (selectedLectureId) formData.append("lecture_id", selectedLectureId);
    formData.append("template", template);

    try {
      await meetingsApi.uploadRecording(formData);
      setStatusMessage("Lecture file processed successfully!");
      showToast.success("Upload Complete", "File processed and notes are ready.");
    } catch (err: any) {
      throw new Error(err.message || "Failed to upload file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return {
    isRecording,
    recordingSeconds,
    formattedTime: formatTimer(recordingSeconds),
    audioSource,
    selectedLectureId,
    title,
    template,
    isProcessing,
    statusMessage,
    canvasRef,
    lectures,
    setAudioSource,
    setSelectedLectureId,
    setTitle,
    setTemplate,
    startRecording,
    stopRecording,
    uploadFile,
  };
}
