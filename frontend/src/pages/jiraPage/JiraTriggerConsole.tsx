import React, { useState } from "react";
import {
  Play,
  Terminal,
  FastForward,
  Flag,
} from "lucide-react";
import { jiraAutomationApi } from "../../api/jiraAutomationApi";
import { showToast } from "../../utils/toast";
import type { AutomationProject } from "../../types/jiraAutomation";

interface JiraTriggerConsoleProps {
  project: AutomationProject;
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: "info" | "success" | "error";
  message: string;
}

export const JiraTriggerConsole: React.FC<JiraTriggerConsoleProps> = ({ project }) => {
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "1",
      timestamp: new Date().toLocaleTimeString(),
      type: "info",
      message: `Console connected to project '${project.name}'. Background scheduler runs tick every 1 minute.`,
    },
  ]);
  const [isRunning, setIsRunning] = useState(false);

  const addLog = (type: "info" | "success" | "error", message: string) => {
    setLogs((prev) => [
      {
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
      },
      ...prev,
    ]);
  };

  const handleTriggerSprintStart = async () => {
    try {
      setIsRunning(true);
      addLog("info", "Triggering sprint start validation...");
      const res = await jiraAutomationApi.triggerSprintStart(project.id);
      addLog("success", `Sprint start check: ${res.message}`);
      showToast.success("Sprint Start Triggered", res.message);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message;
      addLog("error", `Sprint start failed: ${msg}`);
      showToast.error("Trigger Failed", msg);
    } finally {
      setIsRunning(false);
    }
  };

  const handleTriggerMoves = async () => {
    try {
      setIsRunning(true);
      addLog("info", "Processing pending task moves in Jira...");
      const res = await jiraAutomationApi.triggerMoves(project.id);
      addLog("success", `Task moves: ${res.message}`);
      showToast.success("Moves Processed", res.message);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message;
      addLog("error", `Moves execution failed: ${msg}`);
      showToast.error("Trigger Failed", msg);
    } finally {
      setIsRunning(false);
    }
  };

  const handleTriggerSprintClose = async () => {
    try {
      setIsRunning(true);
      addLog("info", "Triggering sprint close validation...");
      const res = await jiraAutomationApi.triggerSprintClose(project.id);
      addLog("success", `Sprint close check: ${res.message}`);
      showToast.success("Sprint Close Triggered", res.message);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message;
      addLog("error", `Sprint close failed: ${msg}`);
      showToast.error("Trigger Failed", msg);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-[#0b0f19]">
      {/* Action Buttons Toolbar */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-indigo-400" />
            <span>Manual Automation Controls & Diagnostics</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            While the background APScheduler runs automatically every 60 seconds, you can use these controls
            to instantly trigger actions for debugging and testing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={handleTriggerSprintStart}
            disabled={isRunning}
            className="p-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-indigo-500/50 text-left transition flex flex-col justify-between space-y-2 cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center space-x-2 text-indigo-400">
              <Play className="w-4 h-4" />
              <span className="text-xs font-bold text-white">Trigger Sprint Start</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Checks scheduled sprints whose start date has arrived, starts active sprint on Jira board, and creates initial tasks.
            </p>
          </button>

          <button
            onClick={handleTriggerMoves}
            disabled={isRunning}
            className="p-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-cyan-500/50 text-left transition flex flex-col justify-between space-y-2 cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center space-x-2 text-cyan-400">
              <FastForward className="w-4 h-4" />
              <span className="text-xs font-bold text-white">Process Task Moves</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Transitions tasks through their scheduled statuses (e.g. In Progress, Done) in Jira Cloud.
            </p>
          </button>

          <button
            onClick={handleTriggerSprintClose}
            disabled={isRunning}
            className="p-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-500/50 text-left transition flex flex-col justify-between space-y-2 cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center space-x-2 text-emerald-400">
              <Flag className="w-4 h-4" />
              <span className="text-xs font-bold text-white">Trigger Sprint Close</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Closes active sprints whose end date has passed, moves incomplete tasks back to board backlog, and alerts Telegram.
            </p>
          </button>
        </div>
      </div>

      {/* Execution Console Output */}
      <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            <span className="text-slate-400 font-sans font-bold text-xs pl-2">Automation Activity Log</span>
          </div>

          <button
            onClick={() => setLogs([])}
            className="text-[11px] text-slate-500 hover:text-slate-300 font-sans cursor-pointer"
          >
            Clear Console
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-1.5 pt-1">
          {logs.map((l) => (
            <div key={l.id} className="flex items-start space-x-2.5 leading-relaxed">
              <span className="text-slate-600 flex-shrink-0">[{l.timestamp}]</span>
              <span
                className={`font-semibold flex-shrink-0 ${
                  l.type === "success"
                    ? "text-emerald-400"
                    : l.type === "error"
                    ? "text-rose-400"
                    : "text-indigo-400"
                }`}
              >
                {l.type.toUpperCase()}:
              </span>
              <span className="text-slate-300 break-words">{l.message}</span>
            </div>
          ))}

          {logs.length === 0 && (
            <div className="text-slate-600 italic">No log entries yet. Run a manual trigger above.</div>
          )}
        </div>
      </div>
    </div>
  );
};
