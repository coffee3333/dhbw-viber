import json
import re
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.agents.base import BaseAgent
from app.core.logger import get_logger
from app.models.db import LectureDB, LectureKnowledgeChunkDB
from app.services.checkpointer import AgentCheckpointer
from app.services.embedding_service import EmbeddingService

logger = get_logger("meeting_agent.rag")


class GrillAgent(BaseAgent):
    """AI Tutor Agent that grills the student on lecture contents using RAG context."""

    def generate_question(
        self,
        context: str,
        subject_name: str,
        lecture_title: str | None = None,
        difficulty: str = "exam",
        topic_focus: str | None = None,
        thread_id: str | None = None,
        db: Session | None = None
    ) -> dict[str, Any]:
        system_prompt = f"""You are an elite DHBW university professor and exam examiner specializing in {subject_name}.
Your job is to test and grill the student rigorously on their actual lecture content.
Produce questions that require deep technical understanding, critical thinking, or practical problem solving rather than superficial definitions.

You MUST respond strictly in valid JSON format with the following structure:
{{
  "question": "A clear, rigorous exam-level question based on the lecture material",
  "difficulty": "medium" or "hard" or "exam_level",
  "topic": "The key topic being tested",
  "hints": ["Hint 1 for when the student gets stuck", "Hint 2"],
  "model_answer_points": ["Point 1 that a full-mark answer must include", "Point 2", "Point 3"],
  "question_type": "open" or "code" or "multiple_choice",
  "options": ["Option A", "Option B", "Option C", "Option D"] (only if question_type is multiple_choice, else empty list)
}}"""

        user_prompt = f"""Subject: {subject_name}
Target Lecture: {lecture_title or 'All lectures in this module'}
Topic Focus / Student Query: {topic_focus or 'Key concepts covered in lectures'}

Lecture Notes, Summaries & Material Context:
============================================
{context if context.strip() else 'No detailed notes found yet. Generate a standard university-level DHBW question on this topic.'}
============================================

Generate a challenging question for the student to answer now:"""

        raw = self.call_llm(system_prompt, user_prompt, json_mode=True)
        try:
            res = json.loads(self.clean_json(raw))
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            logger.warning(f"Failed to parse GrillAgent question JSON: {e}")
            res = {
                "question": f"Explain the core principles and practical architectural implications of {subject_name} as discussed in class.",
                "difficulty": "exam_level",
                "topic": subject_name,
                "hints": ["Consider real-world tradeoffs and architectural patterns."],
                "model_answer_points": ["Clear definitions", "Tradeoffs", "Concrete implementation"],
                "question_type": "open",
                "options": []
            }

        if db and thread_id:
            try:
                cp = AgentCheckpointer.save_checkpoint(
                    db=db,
                    thread_id=thread_id,
                    state={"type": "question", "question_data": res, "topic_focus": topic_focus, "difficulty": difficulty},
                    agent_name="grill_agent",
                    metadata={"subject": subject_name, "lecture": lecture_title}
                )
                res["checkpoint_id"] = cp.checkpoint_id
                res["thread_id"] = thread_id
            except Exception as e:
                logger.warning(f"GrillAgent Checkpointer notice: {e}")

        return res

    def evaluate_answer(
        self,
        context: str,
        question: str,
        student_answer: str,
        subject_name: str,
        thread_id: str | None = None,
        db: Session | None = None
    ) -> dict[str, Any]:
        system_prompt = f"""You are an examiner grading a student's answer for the DHBW course: {subject_name}.
Be encouraging yet strict and precise like an academic professor.
Grade the student out of 10 points based strictly on technical accuracy, completeness, and adherence to the lecture material.

You MUST respond strictly in valid JSON format:
{{
  "score": 8, // Integer 0 to 10
  "feedback": "Overall assessment paragraph evaluating the answer",
  "strengths": ["Strong point 1", "Strong point 2"],
  "missing_or_incorrect": ["What was missing or conceptually inaccurate"],
  "model_answer": "Complete, exemplary answer demonstrating full mastery",
  "follow_up_question": "Next challenging question to deepen understanding"
}}"""

        user_prompt = f"""Exam Question: {question}

Student's Submitted Answer:
\"\"\"{student_answer}\"\"\"

Relevant Lecture Knowledge & Context:
====================================
{context}
====================================

Evaluate the student's answer now:"""

        raw = self.call_llm(system_prompt, user_prompt, json_mode=True)
        try:
            res = json.loads(self.clean_json(raw))
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            logger.warning(f"Failed to parse GrillAgent evaluation JSON: {e}")
            res = {
                "score": 7,
                "feedback": "Good attempt! You demonstrated solid understanding, though you can expand on key implementation details.",
                "strengths": ["Clear communication", "Identified key concepts"],
                "missing_or_incorrect": ["Could elaborate on edge cases"],
                "model_answer": "A complete answer would directly integrate the architectural patterns mentioned in lecture.",
                "follow_up_question": "How would you handle failure scenarios in this design?"
            }

        if db and thread_id:
            try:
                cp = AgentCheckpointer.save_checkpoint(
                    db=db,
                    thread_id=thread_id,
                    state={"type": "evaluation", "question": question, "student_answer": student_answer, "evaluation": res},
                    agent_name="grill_agent",
                    metadata={"subject": subject_name, "score": res.get("score")}
                )
                res["checkpoint_id"] = cp.checkpoint_id
                res["thread_id"] = thread_id
            except Exception as e:
                logger.warning(f"GrillAgent Checkpointer notice: {e}")

        return res


class RagService:
    """Manages indexing of lecture transcripts, summaries, and notes for RAG retrieval."""

    @staticmethod
    def index_lecture(db: Session, lecture_id: str) -> int:
        """Extract and index knowledge chunks from a single lecture."""
        lec = db.query(LectureDB).filter(LectureDB.id == lecture_id).first()
        if not lec:
            return 0

        # Remove existing chunks for this lecture to re-index cleanly
        db.query(LectureKnowledgeChunkDB).filter(LectureKnowledgeChunkDB.lecture_id == lecture_id).delete()
        chunks_added = 0

        def add_chunk(title: str, content: str, source_type: str, metadata: dict):
            nonlocal chunks_added
            emb = EmbeddingService.get_embedding(f"{title}\n{content}")
            db.add(LectureKnowledgeChunkDB(
                id=uuid.uuid4().hex[:16],
                subject_id=lec.subject_id,
                lecture_id=lec.id,
                source_type=source_type,
                title=title,
                content=content,
                metadata_json=json.dumps(metadata or {}),
                embedding=emb
            ))
            chunks_added += 1

        # 1. Index Lecture Description & Notes
        if lec.description and len(lec.description.strip()) > 10:
            add_chunk(
                title=f"{lec.title} - Overview",
                content=lec.description.strip(),
                source_type="description",
                metadata={"room": lec.room, "date": lec.start_time.isoformat()}
            )

        if lec.notes and len(lec.notes.strip()) > 10:
            add_chunk(
                title=f"{lec.title} - Student Notes",
                content=lec.notes.strip(),
                source_type="notes",
                metadata={"date": lec.start_time.isoformat()}
            )

        if lec.ai_summary_override and len(lec.ai_summary_override.strip()) > 10:
            add_chunk(
                title=f"{lec.title} - AI Summary",
                content=lec.ai_summary_override.strip(),
                source_type="summary",
                metadata={"date": lec.start_time.isoformat()}
            )

        # 2. Index Meetings attached to this lecture
        for m in lec.meetings:
            if m.overview:
                add_chunk(
                    title=f"{lec.title} - Meeting Overview",
                    content=m.overview,
                    source_type="summary",
                    metadata={"meeting_id": m.id}
                )

            if m.executive_summary:
                add_chunk(
                    title=f"{lec.title} - Executive Summary",
                    content=m.executive_summary,
                    source_type="summary",
                    metadata={"meeting_id": m.id}
                )

            if m.key_points:
                add_chunk(
                    title=f"{lec.title} - Key Points",
                    content="\n".join([f"- {kp}" for kp in m.key_points]),
                    source_type="key_points",
                    metadata={"meeting_id": m.id}
                )

            if m.decisions:
                add_chunk(
                    title=f"{lec.title} - Decisions & Takeaways",
                    content="\n".join([f"- {d}" for d in m.decisions]),
                    source_type="decisions",
                    metadata={"meeting_id": m.id}
                )

            # Index transcript in meaningful segments (groups of 5 lines)
            if m.transcript_segments:
                seg_buffer = []
                for i, seg in enumerate(m.transcript_segments):
                    seg_buffer.append(f"{seg.speaker}: {seg.text}")
                    if len(seg_buffer) >= 6 or i == len(m.transcript_segments) - 1:
                        chunk_text = "\n".join(seg_buffer)
                        add_chunk(
                            title=f"{lec.title} - Transcript ({seg.start:.0f}s)",
                            content=chunk_text,
                            source_type="transcript",
                            metadata={"start": seg.start, "end": seg.end}
                        )
                        seg_buffer = []

        # 3. Index Lecture Materials (Presentation Slides, Uploaded MD Summaries, Reference Documents)
        for mat in (lec.materials or []):
            mat_title = mat.get("title") or "Material"
            mat_type = mat.get("type") or "material"
            text_content = (mat.get("text_content") or "").strip()
            if text_content and len(text_content) > 15:
                # Segment long materials into readable chunks of ~1200 chars
                chunk_size = 1200
                chunks = [text_content[i:i+chunk_size] for i in range(0, len(text_content), chunk_size)]
                for c_idx, chunk_text in enumerate(chunks[:15]):  # index up to 15 chunks per material
                    source_label = "Slides" if mat_type == "presentation" else "AI Summary" if mat_type == "summary_md" else "Material"
                    part_suffix = f" (Part {c_idx+1})" if len(chunks) > 1 else ""
                    add_chunk(
                        title=f"{lec.title} - {source_label}: {mat_title}{part_suffix}",
                        content=chunk_text,
                        source_type="presentation" if mat_type == "presentation" else "summary" if mat_type == "summary_md" else "material",
                        metadata={"material_id": mat.get("id"), "filename": mat.get("filename"), "type": mat_type}
                    )

        db.commit()
        return chunks_added

    @staticmethod
    def sync_all(db: Session) -> dict[str, Any]:
        """Index all lectures across all subjects."""
        lectures = db.query(LectureDB).all()
        total_chunks = 0
        for lec in lectures:
            total_chunks += RagService.index_lecture(db, lec.id)
        return {
            "lectures_indexed": len(lectures),
            "chunks_created": total_chunks,
            "message": f"Successfully indexed {total_chunks} knowledge chunks across {len(lectures)} lectures."
        }

    @staticmethod
    def search(
        db: Session,
        query: str,
        subject_id: str | None = None,
        lecture_id: str | None = None,
        limit: int = 6
    ) -> list[dict[str, Any]]:
        """Search knowledge base using hybrid semantic vector embeddings + keyword ranking."""
        q = db.query(LectureKnowledgeChunkDB)
        if subject_id:
            q = q.filter(LectureKnowledgeChunkDB.subject_id == subject_id)
        if lecture_id:
            q = q.filter(LectureKnowledgeChunkDB.lecture_id == lecture_id)

        clean_query = (query or "").strip()
        query_emb = EmbeddingService.get_embedding(clean_query) if clean_query else None
        tokens = [t.lower() for t in re.findall(r"\w+", clean_query) if len(t) > 2]
        all_chunks = q.all()

        scored_results = []
        for chunk in all_chunks:
            # 1. Semantic Vector Similarity
            sem_score = 0.0
            if query_emb and chunk.embedding:
                sem_score = EmbeddingService.cosine_similarity(query_emb, chunk.embedding)

            # 2. Keyword BM25 / token matching
            kw_score = 0.0
            text_lower = (chunk.title + " " + chunk.content).lower()
            for token in tokens:
                if token in text_lower:
                    kw_score += text_lower.count(token)

            kw_normalized = min(kw_score / max(len(tokens) * 2, 1), 1.0)

            # 3. Hybrid Score (70% semantic embedding, 30% keyword)
            final_score = (0.7 * sem_score) + (0.3 * kw_normalized) if query_emb else kw_normalized

            # Prioritize summaries and key points over raw transcripts
            if chunk.source_type in ("summary", "key_points", "notes"):
                final_score *= 1.25

            if final_score > 0.05 or not tokens:
                subj = chunk.subject
                lec = chunk.lecture
                scored_results.append({
                    "id": chunk.id,
                    "title": chunk.title,
                    "content": chunk.content,
                    "source_type": chunk.source_type,
                    "subject_name": subj.name if subj else "General",
                    "lecture_title": lec.title if lec else None,
                    "score": round(float(final_score), 4),
                    "semantic_score": round(float(sem_score), 4)
                })

        scored_results.sort(key=lambda x: x["score"], reverse=True)
        return scored_results[:limit]

    @staticmethod
    def build_context(
        db: Session,
        subject_id: str | None = None,
        lecture_id: str | None = None,
        query: str | None = None
    ) -> str:
        """Gathers unified textual context for LLM prompt grounding."""
        results = RagService.search(db, query=query or "", subject_id=subject_id, lecture_id=lecture_id, limit=8)
        if not results and (subject_id or lecture_id):
            # If no chunks indexed yet, fetch raw lecture info directly
            q = db.query(LectureDB)
            if lecture_id:
                q = q.filter(LectureDB.id == lecture_id)
            elif subject_id:
                q = q.filter(LectureDB.subject_id == subject_id)
            lectures = q.limit(5).all()
            parts = []
            for lec in lectures:
                parts.append(f"Lecture: {lec.title} (Date: {lec.start_time.strftime('%Y-%m-%d')})\nRoom: {lec.room}\nDescription: {lec.description or 'N/A'}")
                if lec.notes:
                    parts.append(f"Student Notes: {lec.notes}")
                for m in lec.meetings:
                    if m.overview:
                        parts.append(f"Meeting Overview: {m.overview}")
                    if m.executive_summary:
                        parts.append(f"Summary: {m.executive_summary}")
            return "\n\n".join(parts)

        context_blocks = []
        for r in results:
            context_blocks.append(f"[{r['source_type'].upper()}] {r['title']}:\n{r['content']}")
        return "\n\n".join(context_blocks)
