import React, { useState, useEffect } from "react";
import {
  X,
  Download,
  Copy,
  Check,
  Bot,
  Terminal,
  Globe,
  RefreshCw,
  FileCode,
} from "lucide-react";
import { jiraAutomationApi } from "../../api/jiraAutomationApi";
import { showToast } from "../../utils/toast";
import type { AgentGuideResponse } from "../../types/jiraAutomation";

export interface JiraAgentGuideViewProps {
  projectId?: string;
  projectName?: string;
}

export const JiraAgentGuideView: React.FC<JiraAgentGuideViewProps> = ({
  projectId,
  projectName,
}) => {
  const [activeTab, setActiveTab] = useState<"AGENTS.md" | "CLAUDE.md">("AGENTS.md");
  const [guideData, setGuideData] = useState<AgentGuideResponse | null>(null);
  const [customOrigin, setCustomOrigin] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  // Initialize customOrigin to window.location.origin on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setCustomOrigin(window.location.origin);
    }
  }, []);

  const loadGuide = async (originOverride?: string) => {
    try {
      setIsLoading(true);
      const originToUse =
        originOverride !== undefined
          ? originOverride
          : (customOrigin || (typeof window !== "undefined" ? window.location.origin : undefined));
      const res = await jiraAutomationApi.getAgentGuide(projectId, originToUse);
      setGuideData(res);
    } catch (err: any) {
      showToast.error("Failed to load guide", err.response?.data?.detail || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGuide();
  }, [projectId]);

  const currentContent = activeTab === "AGENTS.md" ? (guideData?.agents_md || "") : (guideData?.claude_md || "");

  const handleCopy = async () => {
    if (!currentContent) return;
    try {
      await navigator.clipboard.writeText(currentContent);
      setHasCopied(true);
      showToast.success("Copied to Clipboard", `${activeTab} content copied.`);
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      showToast.error("Copy failed", "Could not write to clipboard.");
    }
  };

  const handleDownload = (filename: "AGENTS.md" | "CLAUDE.md") => {
    const text = filename === "AGENTS.md" ? guideData?.agents_md : guideData?.claude_md;
    if (!text) return;
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast.success("Downloaded", `${filename} downloaded successfully.`);
  };

  return (
    <div className="flex flex-col flex-1 min-h-[450px]">
      {/* Configuration Bar */}
      <div className="px-5 py-3 border-b border-slate-800/60 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs flex-shrink-0">
        <div className="flex items-center space-x-2 flex-1 min-w-[260px]">
          <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-slate-400 flex-shrink-0">Deployment Origin:</span>
          <input
            type="text"
            value={customOrigin}
            onChange={(e) => setCustomOrigin(e.target.value)}
            placeholder="e.g. https://dhbw-viber.atai.site or http://localhost:8000"
            className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-slate-200 text-xs flex-1 focus:outline-none focus:border-indigo-500 font-mono"
          />
          <button
            type="button"
            onClick={() => loadGuide(customOrigin)}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center space-x-1 cursor-pointer flex-shrink-0"
            title="Refresh endpoints with custom origin"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
            <span>Apply</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {projectName && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-500/30 text-indigo-300 font-medium">
              {projectName}
            </span>
          )}
          <span className="text-slate-400">Detected API:</span>
          <code className="text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded font-mono">
            {guideData?.base_url || "Resolving..."}
          </code>
        </div>
      </div>

      {/* Action Controls & Tab Switcher */}
      <div className="px-5 py-3 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
        <div className="flex items-center space-x-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("AGENTS.md")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
              activeTab === "AGENTS.md"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>AGENTS.md (Comprehensive)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("CLAUDE.md")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
              activeTab === "CLAUDE.md"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>CLAUDE.md (Claude Code)</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer"
          >
            {hasCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy {activeTab}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleDownload("AGENTS.md")}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-indigo-600/20 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download AGENTS.md</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownload("CLAUDE.md")}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-indigo-600/20 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CLAUDE.md</span>
          </button>
        </div>
      </div>

      {/* Code Content Area */}
      <div className="p-5 overflow-y-auto flex-1 bg-[#070a12] max-h-[50vh]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            <span className="text-xs">Generating custom guide for this deployment...</span>
          </div>
        ) : (
          <div className="relative">
            <pre className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 text-slate-200 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text selection:bg-indigo-500/30">
              {currentContent || "No guide content available."}
            </pre>
          </div>
        )}
      </div>

      {/* Quick Instructions Footer */}
      <div className="px-5 py-3 border-t border-slate-800/80 bg-slate-900/40 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Save this file to your repository root. External agents will automatically detect and follow it.</span>
      </div>
    </div>
  );
};

export interface JiraAgentGuideModalProps {
  projectId?: string;
  projectName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const JiraAgentGuideModal: React.FC<JiraAgentGuideModalProps> = ({
  projectId,
  projectName,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#0b0f19] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Agent Integration Guide</span>
                {projectName && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-500/40 text-indigo-300 font-normal">
                    {projectName}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Instructions for Claude Code, Antigravity CLI, and AI agents to schedule meetings & agile tasks.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reusable View */}
        <JiraAgentGuideView projectId={projectId} projectName={projectName} />

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
