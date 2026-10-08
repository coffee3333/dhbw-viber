import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Video,
  MapPin,
  Disc,
  Clock,
  CheckSquare,
  ListTodo,
} from "lucide-react";
import type { Lecture } from "../types/calendar";

interface CalendarGridProps {
  lectures: Lecture[];
  currentDate: Date;
  viewMode: "timeGridWeek" | "timeGridDay" | "dayGridMonth";
  visibleDays?: number; // 3, 5, or 7
  hideWeekends?: boolean;
  onSelectLecture: (lecture: Lecture) => void;
  onNavigateDate: (newDate: Date) => void;
  onChangeViewMode: (mode: "timeGridWeek" | "timeGridDay" | "dayGridMonth") => void;
  onChangeVisibleDays?: (days: number) => void;
}

// 07:30 to 21:00 schedule configuration (07:30 boundary hidden)
const START_MINUTES = 7 * 60 + 30; // 07:30 (450 minutes from midnight)
const END_MINUTES = 21 * 60; // 21:00 (1260 minutes from midnight)
const TOTAL_MINUTES = END_MINUTES - START_MINUTES; // 810 minutes (13.5 hours)
const HOUR_HEIGHT = 52; // px per 60 minutes (compact scale)
const TOTAL_GRID_HEIGHT = Math.round((TOTAL_MINUTES / 60) * HOUR_HEIGHT); // ~702px

interface TimeMarker {
  label: string;
  minutes: number;
  hideLabel?: boolean;
}

const TIME_MARKERS: TimeMarker[] = [
  { label: "07:30", minutes: 0, hideLabel: true },
  { label: "08:00", minutes: 30 },
  { label: "09:00", minutes: 90 },
  { label: "10:00", minutes: 150 },
  { label: "11:00", minutes: 210 },
  { label: "12:00", minutes: 270 },
  { label: "13:00", minutes: 330 },
  { label: "14:00", minutes: 390 },
  { label: "15:00", minutes: 450 },
  { label: "16:00", minutes: 510 },
  { label: "17:00", minutes: 570 },
  { label: "18:00", minutes: 630 },
  { label: "19:00", minutes: 690 },
  { label: "20:00", minutes: 750 },
  { label: "21:00", minutes: 810 },
];

/**
 * Format a Date to local YYYY-MM-DD string without UTC timezone shift.
 */
function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface LayoutLectureItem {
  lecture: Lecture;
  startMins: number;
  endMins: number;
  top: number;
  height: number;
  column: number;
  totalColumns: number;
}

function layoutDayLectures(dayLectures: Lecture[]): LayoutLectureItem[] {
  if (dayLectures.length === 0) return [];

  const items: LayoutLectureItem[] = dayLectures.map((lec) => {
    const s = new Date(lec.start);
    const e = new Date(lec.end);
    const lectureStartMins = s.getHours() * 60 + s.getMinutes();
    const lectureEndMins = e.getHours() * 60 + e.getMinutes();

    const relativeStartMins = lectureStartMins - START_MINUTES;
    const relativeEndMins = lectureEndMins - START_MINUTES;

    const clampedStart = Math.max(0, Math.min(TOTAL_MINUTES, relativeStartMins));
    const clampedEnd = Math.max(clampedStart + 15, Math.min(TOTAL_MINUTES, relativeEndMins));

    const top = (clampedStart / 60) * HOUR_HEIGHT;
    const height = Math.max(22, ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT - 2);

    return {
      lecture: lec,
      startMins: relativeStartMins,
      endMins: relativeEndMins,
      top,
      height,
      column: 0,
      totalColumns: 1,
    };
  });

  // Sort chronologically
  items.sort((a, b) => a.startMins - b.startMins || (b.endMins - b.startMins) - (a.endMins - a.startMins));

  // Compute collision columns
  for (let i = 0; i < items.length; i++) {
    const current = items[i];
    const overlaps = items.filter(
      (other, j) =>
        i !== j &&
        current.startMins < other.endMins &&
        current.endMins > other.startMins
    );

    if (overlaps.length > 0) {
      const usedCols = new Set(overlaps.map((o) => o.column));
      let col = 0;
      while (usedCols.has(col)) col++;
      current.column = col;
      const maxCol = Math.max(col, ...overlaps.map((o) => o.column));
      current.totalColumns = maxCol + 1;
      overlaps.forEach((o) => {
        o.totalColumns = Math.max(o.totalColumns, current.totalColumns);
      });
    }
  }

  return items;
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  lectures,
  currentDate,
  viewMode,
  visibleDays = 5,
  hideWeekends = false,
  onSelectLecture,
  onNavigateDate,
  onChangeViewMode,
  onChangeVisibleDays: _onChangeVisibleDays,
}) => {
  const activeDaysCount = visibleDays || 5;
  const gridScrollRef = useRef<HTMLDivElement>(null);

  // Live timer for current time indicator (Google Calendar red line)
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTotalMins = currentHour * 60 + currentMinute;
  const isNowWithinGrid = currentTotalMins >= START_MINUTES && currentTotalMins <= END_MINUTES;
  const currentMinsSinceStart = currentTotalMins - START_MINUTES;
  const currentTimeTop = (currentMinsSinceStart / 60) * HOUR_HEIGHT;
  const currentTimeFormatted = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const todayDateStr = toLocalDateKey(now);

  // Auto-scroll to current time (or top) on mount or view mode change
  useEffect(() => {
    if (viewMode === "timeGridWeek" || viewMode === "timeGridDay") {
      const timer = setTimeout(() => {
        if (gridScrollRef.current) {
          const scrollTarget = isNowWithinGrid ? Math.max(0, currentTimeTop - 70) : 0;
          gridScrollRef.current.scrollTo({ top: scrollTarget, behavior: "smooth" });
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [viewMode, currentDate]);

  // Compute days for Week View
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    const curr = new Date(currentDate);
    const dayOfWeek = (curr.getDay() + 6) % 7; // Monday = 0
    const startOfWeek = new Date(curr);
    startOfWeek.setDate(curr.getDate() - dayOfWeek);

    const count = hideWeekends ? Math.min(activeDaysCount, 5) : activeDaysCount;
    for (let i = 0; i < count; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate, activeDaysCount, hideWeekends]);

  // Compute Month View cells (handles 35 or 42 cells depending on month length, skipping weekends if hideWeekends is true)
  const monthCalendarGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0

    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalDaysNeeded = startDayOfWeek + lastDayOfMonth.getDate();
    const totalWeeks = totalDaysNeeded > 35 ? 6 : 5;
    const totalCells = totalWeeks * 7;

    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - startDayOfWeek);

    const cells: { date: Date; isCurrentMonth: boolean; dateKey: string }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dayOfWeek = (d.getDay() + 6) % 7; // 0=Mon, ..., 5=Sat, 6=Sun
      if (hideWeekends && (dayOfWeek === 5 || dayOfWeek === 6)) {
        continue;
      }
      const isCurrentMonth = d.getMonth() === month;
      const dateKey = toLocalDateKey(d);
      cells.push({ date: d, isCurrentMonth, dateKey });
    }
    return cells;
  }, [currentDate, hideWeekends]);

  const monthWeekdays = useMemo(() => {
    return hideWeekends
      ? ["Mon", "Tue", "Wed", "Thu", "Fri"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  }, [hideWeekends]);

  const monthGridColsClass = hideWeekends ? "grid-cols-5" : "grid-cols-7";

  // Group lectures by date YYYY-MM-DD
  const lecturesByDate = useMemo(() => {
    const map: Record<string, Lecture[]> = {};
    lectures.forEach((lec) => {
      const dateKey = (lec.start || "").split("T")[0];
      if (!dateKey) return;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(lec);
    });
    return map;
  }, [lectures]);

  const handlePrev = useCallback(() => {
    const d = new Date(currentDate);
    if (viewMode === "timeGridDay") {
      d.setDate(d.getDate() - 1);
    } else if (viewMode === "dayGridMonth") {
      d.setDate(1); // Set to 1st to prevent rollover month skips
      d.setMonth(d.getMonth() - 1);
    } else {
      d.setDate(d.getDate() - activeDaysCount);
    }
    onNavigateDate(d);
  }, [currentDate, viewMode, activeDaysCount, onNavigateDate]);

  const handleNext = useCallback(() => {
    const d = new Date(currentDate);
    if (viewMode === "timeGridDay") {
      d.setDate(d.getDate() + 1);
    } else if (viewMode === "dayGridMonth") {
      d.setDate(1); // Set to 1st to prevent rollover month skips
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setDate(d.getDate() + activeDaysCount);
    }
    onNavigateDate(d);
  }, [currentDate, viewMode, activeDaysCount, onNavigateDate]);

  const handleToday = () => {
    onNavigateDate(new Date());
  };

  const headerLabel = useMemo(() => {
    if (viewMode === "timeGridDay") {
      return currentDate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    if (viewMode === "dayGridMonth") {
      return currentDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    }
    if (weekDays.length === 0) return "";
    const first = weekDays[0];
    const last = weekDays[weekDays.length - 1];
    const firstStr = first.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const lastStr = last.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${firstStr} – ${lastStr}`;
  }, [viewMode, currentDate, weekDays]);

  const gridColsClass =
    activeDaysCount === 5 ? "grid-cols-5" : activeDaysCount === 7 ? "grid-cols-7" : "grid-cols-3";

  // Day mode lectures
  const currentDayKey = toLocalDateKey(currentDate);
  const isCurrentDayToday = currentDayKey === todayDateStr;
  const dayModeLayoutItems = useMemo(
    () => layoutDayLectures(lecturesByDate[currentDayKey] || []),
    [lecturesByDate, currentDayKey]
  );

  return (
    <div className="flex-1 flex flex-col bg-slate-900/40 rounded-2xl border border-slate-800/80 overflow-hidden shadow-inner h-full">
      {/* Top Toolbar (Clean, minimal header) */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-3 bg-slate-950/40 select-none flex-shrink-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleToday}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            Today
          </button>
          <div className="flex items-center space-x-1">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="font-bold text-sm text-slate-100 tracking-wide pl-2">{headerLabel}</span>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => onChangeViewMode("timeGridWeek")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
              viewMode === "timeGridWeek"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Week
          </button>
          <button
            onClick={() => onChangeViewMode("timeGridDay")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
              viewMode === "timeGridDay"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Day
          </button>
          <button
            onClick={() => onChangeViewMode("dayGridMonth")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
              viewMode === "dayGridMonth"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* VIEW 1: WEEK TIME GRID (07:30 - 21:00 with Google Calendar Current Time Red Line) */}
      {viewMode === "timeGridWeek" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Weekday Column Headers with Time Axis Spacer */}
          <div className="flex border-b border-slate-800/80 bg-slate-950/70 select-none flex-shrink-0">
            {/* Left Time Axis Header Spacer */}
            <div className="w-14 flex-shrink-0 border-r border-slate-800/80 flex items-center justify-center text-[10px] font-mono text-slate-500">
              GMT+2
            </div>

            {/* Days Header */}
            <div className={`flex-1 grid ${gridColsClass} text-center py-2 text-xs font-semibold text-slate-400`}>
              {weekDays.map((day) => {
                const isToday = toLocalDateKey(day) === todayDateStr;
                return (
                  <div key={toLocalDateKey(day)} className="flex flex-col items-center">
                    <span className="text-[11px] uppercase tracking-wider">
                      {day.toLocaleDateString("en-US", { weekday: "short" })}
                    </span>
                    <span
                      className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                        isToday ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/50" : "text-slate-200"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scrollable Time Grid Body (07:30 - 21:00) */}
          <div ref={gridScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
            <div className="flex relative" style={{ height: `${TOTAL_GRID_HEIGHT + 20}px` }}>
              {/* Left Time Axis Gutter */}
              <div className="w-14 flex-shrink-0 border-r border-slate-800/80 bg-slate-950/40 relative select-none">
                {TIME_MARKERS.map((marker, idx) => {
                  if (marker.hideLabel) return null;
                  const isLast = idx === TIME_MARKERS.length - 1;
                  return (
                    <div
                      key={marker.label}
                      className={`absolute right-0 pr-2 font-mono text-[10px] text-slate-400 font-semibold ${
                        isLast ? "-translate-y-full pb-0.5" : "-translate-y-1/2"
                      }`}
                      style={{
                        top: isLast
                          ? `${TOTAL_GRID_HEIGHT}px`
                          : `${(marker.minutes / 60) * HOUR_HEIGHT}px`,
                      }}
                    >
                      {marker.label}
                    </div>
                  );
                })}

                {/* Google Calendar Current Time Red Badge on Time Axis */}
                {isNowWithinGrid && (
                  <div
                    className="absolute right-0 z-30 -translate-y-1/2 pr-1 pointer-events-none transition-all duration-300"
                    style={{ top: `${currentTimeTop}px` }}
                  >
                    <span className="bg-red-500 text-white text-[9px] font-bold font-mono px-1 py-0.5 rounded shadow-md">
                      {currentTimeFormatted}
                    </span>
                  </div>
                )}
              </div>

              {/* Day Columns Container */}
              <div className={`flex-1 grid ${gridColsClass} divide-x divide-slate-800/50 relative`}>
                {/* Horizontal Guide Lines Across All Columns */}
                {TIME_MARKERS.map((marker) => (
                  <div
                    key={marker.label}
                    className="absolute left-0 right-0 border-b border-slate-800/40 pointer-events-none"
                    style={{ top: `${(marker.minutes / 60) * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Individual Day Columns */}
                {weekDays.map((day) => {
                  const dateKey = toLocalDateKey(day);
                  const isToday = dateKey === todayDateStr;
                  const dayItems = layoutDayLectures(lecturesByDate[dateKey] || []);

                  return (
                    <div
                      key={dateKey}
                      className={`relative h-full transition-colors ${
                        isToday ? "bg-indigo-950/15" : "bg-transparent"
                      }`}
                    >
                      {/* Google Calendar Red Current Time Indicator Line across today's column */}
                      {isToday && isNowWithinGrid && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none flex items-center transition-all duration-300"
                          style={{ top: `${currentTimeTop}px` }}
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 shadow-md shadow-red-500/80 ring-2 ring-[#0b0f19]" />
                          <div className="flex-1 h-[2px] bg-red-500 shadow-sm shadow-red-500/50" />
                        </div>
                      )}

                      {/* Lectures Positioned by Exact Time */}
                      {dayItems.map(({ lecture: lec, top, height, column, totalColumns }) => {
                        const startTime = new Date(lec.start).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        const endTime = new Date(lec.end).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        });

                        const colWidth = 100 / totalColumns;
                        const colLeft = column * colWidth;

                        return (
                          <div
                            key={lec.id}
                            onClick={() => onSelectLecture(lec)}
                            style={{
                              top: `${top}px`,
                              height: `${height}px`,
                              width: `calc(${colWidth}% - 4px)`,
                              left: `calc(${colLeft}% + 2px)`,
                              borderLeftColor: lec.backgroundColor || "#6366f1",
                            }}
                            className="absolute z-10 p-1.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 border-l-4 shadow-md transition transform hover:-translate-y-0.5 cursor-pointer overflow-hidden flex flex-col justify-between group"
                            title={`${lec.extendedProps?.subject_name || lec.title} (${startTime} - ${endTime})`}
                          >
                            <div>
                              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                                <span className="font-semibold text-slate-300 truncate">
                                  {startTime} – {endTime}
                                </span>
                                {lec.extendedProps?.has_recording && (
                                  <span className="flex items-center text-red-400 flex-shrink-0 pl-1" title="Recorded">
                                    <Disc className="w-3 h-3 animate-spin" />
                                  </span>
                                )}
                              </div>

                              <div className="font-bold text-[11px] text-white group-hover:text-indigo-300 transition truncate pt-0.5">
                                {lec.extendedProps?.subject_name || (lec as any).subject_name || lec.title}
                              </div>

                              {/* Attached Tasks Indicator */}
                              {Boolean(lec.extendedProps?.incoming_tasks_count || lec.extendedProps?.action_items_count) && (
                                <div className="pt-0.5 flex items-center">
                                  {lec.extendedProps?.incoming_tasks_count ? (
                                    <span
                                      className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 border border-amber-500/40 text-[9px] font-bold truncate max-w-full"
                                      title={`${lec.extendedProps.incoming_tasks_count} preparation tasks due from previous class`}
                                    >
                                      <CheckSquare className="w-2.5 h-2.5 shrink-0 text-amber-400" />
                                      <span className="truncate">{lec.extendedProps.incoming_tasks_count} prep tasks due</span>
                                    </span>
                                  ) : lec.extendedProps?.action_items_count ? (
                                    <span
                                      className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 text-[9px] font-semibold truncate max-w-full"
                                      title={`${lec.extendedProps.action_items_count} action items assigned`}
                                    >
                                      <ListTodo className="w-2.5 h-2.5 shrink-0 text-indigo-400" />
                                      <span className="truncate">{lec.extendedProps.action_items_count} tasks assigned</span>
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </div>

                            {height >= 44 && (
                              <div className="flex items-center space-x-2 text-[10px] text-slate-400 truncate pt-0.5">
                                {(lec.extendedProps?.room || (lec as any).room) && (
                                  <div className="flex items-center space-x-1 truncate">
                                    <MapPin className="w-3 h-3 text-slate-500 flex-shrink-0" />
                                    <span className="truncate">{lec.extendedProps?.room || (lec as any).room}</span>
                                  </div>
                                )}
                                {(lec.extendedProps?.meeting_link || (lec as any).meeting_link) && (
                                  <div className="flex items-center space-x-1 text-cyan-400 flex-shrink-0">
                                    <Video className="w-3 h-3" />
                                    <span>Online</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: DAY TIME GRID (07:30 - 21:00 for the selected day) */}
      {viewMode === "timeGridDay" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Single Day Header */}
          <div className="flex border-b border-slate-800/80 bg-slate-950/70 select-none flex-shrink-0">
            <div className="w-14 flex-shrink-0 border-r border-slate-800/80 flex items-center justify-center text-[10px] font-mono text-slate-500">
              GMT+2
            </div>
            <div className="flex-1 p-2.5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                    isCurrentDayToday ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-200"
                  }`}
                >
                  {currentDate.getDate()}
                </span>
                <span className="font-bold text-sm text-white">
                  {currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </span>
                <span className="text-xs text-slate-400 font-mono pl-2">
                  ({dayModeLayoutItems.length} {dayModeLayoutItems.length === 1 ? "lecture" : "lectures"})
                </span>
              </div>
              <button
                onClick={() => onChangeViewMode("timeGridWeek")}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
              >
                Back to Week ➜
              </button>
            </div>
          </div>

          {/* Scrollable Day Time Grid */}
          <div ref={gridScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
            <div className="flex relative" style={{ height: `${TOTAL_GRID_HEIGHT + 20}px` }}>
              {/* Left Time Axis Gutter */}
              <div className="w-14 flex-shrink-0 border-r border-slate-800/80 bg-slate-950/40 relative select-none">
                {TIME_MARKERS.map((marker, idx) => {
                  if (marker.hideLabel) return null;
                  const isLast = idx === TIME_MARKERS.length - 1;
                  return (
                    <div
                      key={marker.label}
                      className={`absolute right-0 pr-2 font-mono text-[10px] text-slate-400 font-semibold ${
                        isLast ? "-translate-y-full pb-0.5" : "-translate-y-1/2"
                      }`}
                      style={{
                        top: isLast
                          ? `${TOTAL_GRID_HEIGHT}px`
                          : `${(marker.minutes / 60) * HOUR_HEIGHT}px`,
                      }}
                    >
                      {marker.label}
                    </div>
                  );
                })}

                {/* Google Calendar Current Time Red Badge */}
                {isCurrentDayToday && isNowWithinGrid && (
                  <div
                    className="absolute right-0 z-30 -translate-y-1/2 pr-1 pointer-events-none transition-all duration-300"
                    style={{ top: `${currentTimeTop}px` }}
                  >
                    <span className="bg-red-500 text-white text-[9px] font-bold font-mono px-1 py-0.5 rounded shadow-md">
                      {currentTimeFormatted}
                    </span>
                  </div>
                )}
              </div>

              {/* Single Day Column with Events */}
              <div className="flex-1 relative">
                {/* Horizontal Guide Lines */}
                {TIME_MARKERS.map((marker) => (
                  <div
                    key={marker.label}
                    className="absolute left-0 right-0 border-b border-slate-800/40 pointer-events-none"
                    style={{ top: `${(marker.minutes / 60) * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Google Calendar Red Current Time Indicator Line */}
                {isCurrentDayToday && isNowWithinGrid && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none flex items-center transition-all duration-300"
                    style={{ top: `${currentTimeTop}px` }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 shadow-md shadow-red-500/80 ring-2 ring-[#0b0f19]" />
                    <div className="flex-1 h-[2px] bg-red-500 shadow-sm shadow-red-500/50" />
                  </div>
                )}

                {/* Day Mode Lectures */}
                {dayModeLayoutItems.map(({ lecture: lec, top, height, column, totalColumns }) => {
                  const startTime = new Date(lec.start).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const endTime = new Date(lec.end).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  const colWidth = 100 / totalColumns;
                  const colLeft = column * colWidth;

                  return (
                    <div
                      key={lec.id}
                      onClick={() => onSelectLecture(lec)}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        width: `calc(${colWidth}% - 8px)`,
                        left: `calc(${colLeft}% + 4px)`,
                        borderLeftColor: lec.backgroundColor || "#6366f1",
                      }}
                      className="absolute z-10 p-2.5 rounded-2xl bg-slate-900/95 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 border-l-4 shadow-lg transition transform hover:-translate-y-0.5 cursor-pointer overflow-hidden flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center space-x-1.5 font-mono text-indigo-300 font-bold bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-500/20">
                            <Clock className="w-3 h-3 text-indigo-400" />
                            <span>
                              {startTime} – {endTime}
                            </span>
                          </span>

                          <div className="flex items-center space-x-2">
                            {lec.extendedProps?.incoming_tasks_count ? (
                              <span
                                className="flex items-center space-x-1 text-amber-300 text-xs font-bold bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-500/40"
                                title="Preparation tasks due from previous class"
                              >
                                <CheckSquare className="w-3 h-3 text-amber-400" />
                                <span>{lec.extendedProps.incoming_tasks_count} prep tasks due</span>
                              </span>
                            ) : lec.extendedProps?.action_items_count ? (
                              <span
                                className="flex items-center space-x-1 text-indigo-300 text-xs font-semibold bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-500/30"
                                title="Action items assigned for next lecture"
                              >
                                <ListTodo className="w-3 h-3 text-indigo-400" />
                                <span>{lec.extendedProps.action_items_count} tasks assigned</span>
                              </span>
                            ) : null}
                            {lec.extendedProps?.has_recording && (
                              <span className="flex items-center space-x-1 text-red-400 text-xs font-medium bg-red-950/40 px-1.5 py-0.5 rounded border border-red-500/30">
                                <Disc className="w-3 h-3 animate-spin" />
                                <span>Recorded</span>
                              </span>
                            )}
                            <span className="text-xs text-slate-400 group-hover:text-indigo-300 font-medium">
                              Details ➜
                            </span>
                          </div>
                        </div>

                        <div className="font-bold text-sm text-white group-hover:text-indigo-300 transition truncate pt-1">
                          {lec.extendedProps?.subject_name || (lec as any).subject_name || lec.title}
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 text-xs text-slate-400 pt-1">
                        {(lec.extendedProps?.room || (lec as any).room) && (
                          <div className="flex items-center space-x-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span>Room: {lec.extendedProps?.room || (lec as any).room}</span>
                          </div>
                        )}
                        {(lec.extendedProps?.meeting_link || (lec as any).meeting_link) && (
                          <div className="flex items-center space-x-1 text-cyan-400 font-semibold">
                            <Video className="w-3.5 h-3.5" />
                            <span>Online Link</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: MONTH VIEW (Clean Month Grid - Wheel/Trackpad Scrollable through Months) */}
      {viewMode === "dayGridMonth" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden select-none">
          {/* Month Weekday Header (Pinned above month grid) */}
          <div
            className={`grid ${monthGridColsClass} border-b border-slate-800/80 bg-slate-950/80 text-center py-2 text-xs font-semibold text-slate-400 flex-shrink-0 z-10 shadow-sm`}
          >
            {monthWeekdays.map((name) => (
              <div key={name} className="uppercase tracking-wider text-[11px]">
                {name}
              </div>
            ))}
          </div>

          {/* Month Days Grid - Fills container evenly */}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <div
              className={`h-full grid ${monthGridColsClass} ${
                monthCalendarGrid.length > 35 ? "grid-rows-6" : "grid-rows-5"
              } divide-x divide-y divide-slate-800/50`}
            >
              {monthCalendarGrid.map(({ date, isCurrentMonth, dateKey }) => {
                const cellLectures = lecturesByDate[dateKey] || [];
                const isToday = dateKey === todayDateStr;

                return (
                  <div
                    key={dateKey}
                    onClick={() => {
                      onNavigateDate(date);
                      onChangeViewMode("timeGridDay");
                    }}
                    className={`p-1.5 flex flex-col min-h-0 overflow-hidden transition cursor-pointer hover:bg-slate-800/30 ${
                      isCurrentMonth ? "bg-transparent" : "bg-slate-950/40 opacity-40"
                    }`}
                    title={`Click to view ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} in Day Mode`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1 flex-shrink-0">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] ${
                          isToday ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/50" : "text-slate-300"
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      {cellLectures.length > 0 && (
                        <span className="text-[10px] font-mono text-slate-500">
                          {cellLectures.length} {cellLectures.length === 1 ? "class" : "classes"}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 flex-1 overflow-hidden">
                      {cellLectures.slice(0, 3).map((lec) => {
                        const startTime = new Date(lec.start).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        return (
                          <div
                            key={lec.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectLecture(lec);
                            }}
                            style={{
                              borderLeftColor: lec.backgroundColor || "#6366f1",
                            }}
                            className="truncate text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700/80 border-l-2 text-slate-200 transition font-medium flex items-center space-x-1"
                            title={`${lec.title} (${startTime})`}
                          >
                            <span className="font-mono text-[9px] text-slate-400 shrink-0">{startTime}</span>
                            <span className="truncate flex-1">
                              {lec.extendedProps?.subject_name || (lec as any).subject_name || lec.title}
                            </span>
                            {Boolean(lec.extendedProps?.incoming_tasks_count) && (
                              <span
                                className="px-1 py-0.2 rounded bg-amber-500/25 text-amber-300 text-[8px] font-bold border border-amber-500/40 shrink-0"
                                title={`${lec.extendedProps?.incoming_tasks_count} tasks due`}
                              >
                                {lec.extendedProps?.incoming_tasks_count} due
                              </span>
                            )}
                            {!lec.extendedProps?.incoming_tasks_count && Boolean(lec.extendedProps?.action_items_count) && (
                              <span
                                className="px-1 py-0.2 rounded bg-indigo-500/25 text-indigo-300 text-[8px] font-bold border border-indigo-500/40 shrink-0"
                                title={`${lec.extendedProps?.action_items_count} tasks assigned`}
                              >
                                {lec.extendedProps?.action_items_count} tasks
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {cellLectures.length > 3 && (
                        <div className="text-[10px] font-mono text-indigo-400 pl-1">
                          +{cellLectures.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
