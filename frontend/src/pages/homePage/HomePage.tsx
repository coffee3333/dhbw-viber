import React, { useEffect, useState } from "react";
import { useCalendarViewModel } from "../../viewmodels/useCalendarViewModel";
import { CalendarGrid } from "../../components/CalendarGrid";
import { LectureDrawer } from "../../components/LectureDrawer";
import { RecorderModal } from "../../components/RecorderModal";
import { SubjectChainView } from "../../components/SubjectChainView";
import { LectureSubSection } from "../../components/LectureSubSection";

interface HomePageProps {
  onOpenRecorder?: () => void;
}

export const HomePage: React.FC<HomePageProps> = () => {
  const {
    lectures,
    selectedSubjectId,
    selectedSubjectDetail,
    activeLectureId,
    activeLectureDetail,
    lectureOrigin,
    currentDate,
    viewMode,
    visibleDays,
    hideWeekends,
    isLoading,
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
    setCurrentDate,
    setViewMode,
    setVisibleDays,
    selectLecture,
  } = useCalendarViewModel();

  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [recorderLectureId, setRecorderLectureId] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const handleOpenRecorderWithLecture = (lectureId: string) => {
    setRecorderLectureId(lectureId);
    setIsRecorderOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b0f19] overflow-hidden relative">
      {/* Loading Progress Indicator */}
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse" />
      )}

      {/* VIEW 1: Sub-section drilldown for a specific lecture */}
      {selectedSubjectId && activeLectureId && activeLectureDetail && selectedSubjectDetail ? (
        <LectureSubSection
          lecture={activeLectureDetail}
          subject={selectedSubjectDetail}
          lectureOrigin={lectureOrigin}
          onBackToChain={() => selectLectureChainItem(null)}
          onBackToOverview={() => selectSubject(null)}
          onSelectLecture={(lecId) => selectLectureChainItem(lecId)}
          onUpdateStatus={(status) => updateLectureStatus(activeLectureDetail.id, status)}
          onSaveNotes={(notes) => updateLectureNotes(activeLectureDetail.id, notes)}
          onAddMaterial={(mat) => addLectureMaterial(activeLectureDetail.id, mat)}
          onUploadMaterial={(file, type) => uploadLectureMaterial(activeLectureDetail.id, file, type)}
          onGenerateSummary={(instructions) => generateLectureSummary(activeLectureDetail.id, instructions)}
          onDeleteMaterial={(matId) => deleteLectureMaterial(activeLectureDetail.id, matId)}
          onOpenGrillMe={() =>
            openGrillMe({
              subjectId: selectedSubjectDetail.id,
              subjectName: selectedSubjectDetail.name,
              lectureId: activeLectureDetail.id,
              lectureTitle: activeLectureDetail.title,
            })
          }
          onOpenRecorder={() => handleOpenRecorderWithLecture(activeLectureDetail.id)}
        />
      ) : selectedSubjectId && selectedSubjectDetail ? (
        /* VIEW 2: Subject Chain View (Timeline of lectures for this subject) */
        <SubjectChainView
          subject={selectedSubjectDetail}
          onBackToOverview={() => selectSubject(null)}
          onSelectLecture={(lecId) => selectLectureChainItem(lecId)}
          onOpenGrillMe={() =>
            openGrillMe({
              subjectId: selectedSubjectDetail.id,
              subjectName: selectedSubjectDetail.name,
            })
          }
        />
      ) : (
        /* VIEW 3: Main Full Timetable Calendar Grid */
        <div className="flex-1 p-5 flex flex-col overflow-hidden">
          <CalendarGrid
            lectures={lectures}
            currentDate={currentDate}
            viewMode={viewMode}
            visibleDays={visibleDays}
            hideWeekends={hideWeekends}
            onSelectLecture={selectLecture}
            onNavigateDate={setCurrentDate}
            onChangeViewMode={setViewMode}
            onChangeVisibleDays={setVisibleDays}
          />
        </div>
      )}

      {/* Slide-over Lecture Drawer (when clicking events from CalendarGrid) */}
      <LectureDrawer onOpenRecorderForLecture={handleOpenRecorderWithLecture} />

      {/* Recorder Modal */}
      <RecorderModal
        isOpen={isRecorderOpen}
        onClose={() => {
          setIsRecorderOpen(false);
          setRecorderLectureId(undefined);
        }}
        initialLectureId={recorderLectureId}
      />
    </div>
  );
};

export default HomePage;
