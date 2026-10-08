import React, { useState } from "react";
import {
  X,
  Sparkles,
  HelpCircle,
  Send,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Award,
  BookOpen,
  ArrowRight
} from "lucide-react";
import { ragApi } from "../api/ragApi";
import type { GrillQuestion, GrillEvaluation } from "../types/calendar";
import { showToast } from "../utils/toast";

interface GrillMeModalProps {
  isOpen: boolean;
  onClose: () => void;
  target?: {
    subjectId?: string;
    subjectName?: string;
    lectureId?: string;
    lectureTitle?: string;
  } | null;
}

export const GrillMeModal: React.FC<GrillMeModalProps> = ({ isOpen, onClose, target }) => {
  const [topicFocus, setTopicFocus] = useState("");
  const [difficulty, setDifficulty] = useState<"exam" | "quiz" | "hard">("exam");
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showHints, setShowHints] = useState(false);
  
  const [currentQuestion, setCurrentQuestion] = useState<GrillQuestion | null>(null);
  const [studentAnswer, setStudentAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<GrillEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerateQuestion = async () => {
    setIsLoading(true);
    setError(null);
    setEvaluation(null);
    setStudentAnswer("");
    setShowHints(false);

    try {
      const q = await ragApi.grillMe({
        subject_id: target?.subjectId,
        lecture_id: target?.lectureId,
        topic_focus: topicFocus.trim() || undefined,
        difficulty,
      });
      setCurrentQuestion(q);
      showToast.info("Question Ready", "Review the question and type your answer below.");
    } catch (err: any) {
      setError(err.message || "Failed to generate exam question.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuestion || !studentAnswer.trim()) return;

    setIsEvaluating(true);
    setError(null);

    try {
      const result = await ragApi.evaluate({
        subject_id: target?.subjectId,
        lecture_id: target?.lectureId,
        question: currentQuestion.question,
        student_answer: studentAnswer.trim(),
      });
      setEvaluation(result);
      if (result.score >= 70) {
        showToast.success("Great Answer!", `Score: ${result.score}/100`);
      } else {
        showToast.warning("Review Needed", `Score: ${result.score}/100`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to grade student answer.");
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-white">AI Study Examiner</h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  /Grill Me Mode
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-md">
                Testing knowledge grounded in:{" "}
                <span className="text-indigo-400 font-medium">
                  {target?.lectureTitle || target?.subjectName || "All Modules"}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-300 flex items-center space-x-2 font-medium">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Question Generator Bar */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                <span>Configure Exam Challenge</span>
              </span>
              <div className="flex items-center space-x-1">
                {(["exam", "hard", "quiz"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setDifficulty(lvl)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize transition ${
                      difficulty === lvl
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200 bg-slate-900"
                    }`}
                  >
                    {lvl === "exam" ? "Exam Style" : lvl === "hard" ? "Hard" : "Quiz"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Optional topic focus (e.g. Normalization, Design Patterns, Deadlocks)..."
                value={topicFocus}
                onChange={(e) => setTopicFocus(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleGenerateQuestion}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold disabled:opacity-50 transition shadow-md shadow-indigo-600/20 whitespace-nowrap flex items-center space-x-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isLoading ? "Generating Question..." : currentQuestion ? "Next Question" : "Grill Me!"}</span>
              </button>
            </div>
          </div>

          {/* Active Question Display */}
          {currentQuestion && (
            <div className="p-5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-semibold text-[11px]">
                  Topic: {currentQuestion.topic || "Core Lecture Knowledge"}
                </span>
                <span className="text-slate-400 text-[11px] capitalize">
                  Difficulty: <strong className="text-amber-400">{currentQuestion.difficulty}</strong>
                </span>
              </div>

              <div className="text-sm font-semibold text-slate-100 leading-relaxed">
                {currentQuestion.question}
              </div>

              {/* Multiple choice options if applicable */}
              {currentQuestion.options && currentQuestion.options.length > 0 && (
                <div className="grid grid-cols-1 gap-2 pt-2">
                  {currentQuestion.options.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setStudentAnswer(opt)}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        studentAnswer === opt
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* Hints dropdown */}
              {currentQuestion.hints && currentQuestion.hints.length > 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowHints(!showHints)}
                    className="text-amber-400 hover:text-amber-300 flex items-center space-x-1 text-[11px] font-semibold"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>{showHints ? "Hide Hints" : "Need a Hint?"}</span>
                  </button>
                  {showHints && (
                    <div className="mt-2 p-3 rounded-xl bg-amber-950/30 border border-amber-500/20 space-y-1 text-slate-300">
                      {currentQuestion.hints.map((h, i) => (
                        <div key={i} className="flex items-start space-x-1.5">
                          <span className="text-amber-400 font-bold">•</span>
                          <span>{h}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Answer submission form */}
              <form onSubmit={handleEvaluate} className="space-y-3 pt-2">
                <label className="font-bold text-slate-300 block">Your Answer:</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Type your structured academic explanation or answer here..."
                  value={studentAnswer}
                  onChange={(e) => setStudentAnswer(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isEvaluating || !studentAnswer.trim()}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50 transition shadow-lg shadow-indigo-600/20 flex items-center space-x-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isEvaluating ? "Evaluating Answer..." : "Submit Answer"}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Evaluation & Grading Report */}
          {evaluation && (
            <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <span className="font-bold text-white text-sm">Professor's Evaluation</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-400 font-medium">Score:</span>
                  <span
                    className={`text-base font-extrabold px-3 py-0.5 rounded-full ${
                      evaluation.score >= 8
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                        : evaluation.score >= 5
                        ? "bg-amber-950 text-amber-400 border border-amber-500/30"
                        : "bg-rose-950 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {evaluation.score} / 10
                  </span>
                </div>
              </div>

              <p className="text-slate-300 leading-relaxed">{evaluation.feedback}</p>

              {/* Strengths */}
              {evaluation.strengths && evaluation.strengths.length > 0 && (
                <div className="space-y-1.5">
                  <span className="font-bold text-emerald-400 flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Key Strengths:</span>
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
                    {evaluation.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Missing or Incorrect */}
              {evaluation.missing_or_incorrect && evaluation.missing_or_incorrect.length > 0 && (
                <div className="space-y-1.5">
                  <span className="font-bold text-rose-400 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Areas to Improve / Missing Details:</span>
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
                    {evaluation.missing_or_incorrect.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Model Professor Answer */}
              {evaluation.model_answer && (
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <span className="font-bold text-indigo-400 block">Exemplary Full-Score Answer:</span>
                  <p className="text-slate-300 leading-relaxed">{evaluation.model_answer}</p>
                </div>
              )}

              {/* Follow-up question */}
              {evaluation.follow_up_question && (
                <div className="pt-2 flex items-center justify-between p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-bold text-indigo-400">Follow-Up Drill:</span>
                    <p className="text-slate-200 font-medium">{evaluation.follow_up_question}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentQuestion({
                        question: evaluation.follow_up_question,
                        difficulty: "exam_level",
                        topic: currentQuestion?.topic || "Follow-up",
                        hints: [],
                        model_answer_points: [],
                        question_type: "open",
                        options: []
                      });
                      setEvaluation(null);
                      setStudentAnswer("");
                    }}
                    className="ml-3 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1 transition flex-shrink-0"
                  >
                    <span>Attempt Drill</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {!currentQuestion && (
            <div className="text-center py-12 text-slate-500 space-y-2">
              <HelpCircle className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="font-semibold text-slate-400 text-sm">Ready to test your comprehension?</p>
              <p className="text-[11px] max-w-sm mx-auto">
                Click <strong className="text-slate-300">"Grill Me!"</strong> above to generate an exam-style question grounded strictly in this subject's lecture recordings and summaries.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
