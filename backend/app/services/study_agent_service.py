import json
from datetime import UTC, datetime
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logger import get_logger
from app.models.db import AgentCheckpointDB, LectureDB, SubjectDB
from app.services.checkpointer import AgentCheckpointer
from app.services.rag_service import GrillAgent, RagService

logger = get_logger("meeting_agent.study_agent")


def extract_text_from_message(content: Any) -> str:
    """Safely extract plain text from diverse LangChain message content structures."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and "text" in part:
                parts.append(part["text"])
        return "\n".join(parts)
    return str(content) if content is not None else ""


class StudyAgentService:
    """
    LangGraph-powered AI Academic Agent.
    Operates in two scopes:
      1. 'lecture' - Focused on a single lecture (detail page). Tools to search materials,
                     edit/update the lecture summary live, and /grill me on lecture concepts.
      2. 'subject' - Broad course tutor (main subject page). Tools to access all lectures,
                     presentations, summaries across the course, search topics, and /grill me across the curriculum.
    """

    @staticmethod
    def get_llm(token_saver: bool = False):
        settings = get_settings()
        max_tokens = 600 if token_saver else None
        if settings.summarization_engine == "gemini":
            from langchain_google_genai import ChatGoogleGenerativeAI
            kwargs: dict[str, Any] = {
                "model": settings.gemini_model or "gemini-flash-latest",
                "google_api_key": settings.gemini_api_key,
                "temperature": 0.2,
            }
            if max_tokens:
                kwargs["max_output_tokens"] = max_tokens
            return ChatGoogleGenerativeAI(**kwargs)
        elif settings.summarization_engine == "openai":
            from langchain_openai import ChatOpenAI
            kwargs = {
                "model": settings.openai_model or "gpt-4o",
                "api_key": settings.openai_api_key,
                "temperature": 0.2,
            }
            if max_tokens:
                kwargs["max_tokens"] = max_tokens
            return ChatOpenAI(**kwargs)
        else:
            from langchain_google_genai import ChatGoogleGenerativeAI
            kwargs = {
                "model": "gemini-flash-latest",
                "google_api_key": settings.gemini_api_key,
                "temperature": 0.2,
            }
            if max_tokens:
                kwargs["max_output_tokens"] = max_tokens
            return ChatGoogleGenerativeAI(**kwargs)

    @classmethod
    def create_tools(
        cls,
        db: Session,
        scope: str,
        lecture_id: str | None,
        subject_id: str | None,
        tracker: dict[str, Any],
        token_saver: bool = False,
    ) -> list[Any]:
        """Creates specialized LangChain tools bound to DB session and execution context."""

        # Fetch subject and lecture metadata
        lec_obj = db.query(LectureDB).filter(LectureDB.id == lecture_id).first() if lecture_id else None
        subj_obj = (
            db.query(SubjectDB).filter(SubjectDB.id == subject_id).first()
            if subject_id
            else (lec_obj.subject if lec_obj else None)
        )
        subject_name = subj_obj.name if subj_obj else "Computer Science"
        effective_subject_id = subj_obj.id if subj_obj else None
        effective_lecture_id = lec_obj.id if lec_obj else None

        @tool
        def search_knowledge_base(query: str) -> str:
            """
            Search indexed course materials, lecture presentation slides, transcripts,
            and markdown summaries using semantic vector search and keyword ranking.
            """
            tracker["actions_taken"].append(f"Searched knowledge base for: '{query}'")
            search_limit = 2 if token_saver else 6
            results = RagService.search(
                db=db,
                query=query,
                subject_id=effective_subject_id,
                lecture_id=effective_lecture_id if scope == "lecture" else None,
                limit=search_limit
            )
            if not results:
                return f"No direct matches found in knowledge base for '{query}'."

            formatted = []
            for idx, r in enumerate(results, 1):
                src = r.get("source_type", "doc").upper()
                lec_title = r.get("lecture_title") or "Course Material"
                raw_chunk = (r.get("content") or "").strip()
                if token_saver and len(raw_chunk) > 400:
                    raw_chunk = raw_chunk[:400] + "... [truncated for token economy]"
                formatted.append(f"--- [Match {idx} | {src} | {lec_title}] ---\n{raw_chunk}")
            return "\n\n".join(formatted)

        @tool
        def edit_lecture_summary(target_lecture_id: str, updated_summary_markdown: str, change_description: str) -> str:
            """
            Update or edit the Markdown summary of a lecture.
            Use this tool whenever the student asks to modify, rewrite, expand, or clean up the lecture summary.
            target_lecture_id: The ID of the lecture to update (e.g. current lecture ID).
            updated_summary_markdown: The complete new markdown summary to save.
            change_description: A brief explanation of the modifications made.
            """
            target_id = target_lecture_id or effective_lecture_id
            target_lec = db.query(LectureDB).filter(LectureDB.id == target_id).first()
            if not target_lec:
                return f"Error: Lecture with ID '{target_id}' not found."

            clean_md = updated_summary_markdown.strip()
            target_lec.ai_summary_override = clean_md

            # Also update associated meeting if exists
            if target_lec.meetings:
                target_lec.meetings[0].markdown_content = clean_md

            db.commit()

            # Re-index RAG so knowledge chunks immediately reflect the updated summary
            try:
                RagService.index_lecture(db, target_lec.id)
            except Exception as e:
                logger.warning(f"Error re-indexing lecture after summary edit: {e}")

            tracker["actions_taken"].append(f"Updated lecture summary for '{target_lec.title}'")
            tracker["updated_summary"] = clean_md
            return (
                f"Successfully updated summary for lecture '{target_lec.title}' (ID: {target_lec.id}). "
                f"Summary changes: {change_description}. The update is live and RAG indexed."
            )

        @tool
        def grill_me(topic_focus: str | None = None, difficulty: str = "exam_level") -> str:
            """
            Test and grill the student with a challenging, exam-level question based on the lecture/course material.
            Use this when the student types '/grill me', asks to be tested, wants a quiz, or asks for practice questions.
            """
            tracker["actions_taken"].append("Generated exam grill question")
            context = RagService.build_context(
                db=db,
                subject_id=effective_subject_id,
                lecture_id=effective_lecture_id if scope == "lecture" else None,
                query=topic_focus
            )
            settings = get_settings()
            key = settings.gemini_api_key if settings.summarization_engine == "gemini" else settings.openai_api_key
            model = settings.gemini_model if settings.summarization_engine == "gemini" else settings.openai_model
            agent = GrillAgent(engine=settings.summarization_engine, api_key=key, model=model)
            question_data = agent.generate_question(
                context=context,
                subject_name=subject_name,
                lecture_title=lec_obj.title if lec_obj else None,
                difficulty=difficulty or "exam_level",
                topic_focus=topic_focus
            )

            q_text = question_data.get("question", "")
            topic = question_data.get("topic", subject_name)
            diff = question_data.get("difficulty", "exam_level")
            hints = question_data.get("hints", [])

            hints_formatted = "\n".join([f"- *Hint:* {h}" for h in hints]) if hints else ""

            return (
                f"### 🔥 Exam Drill Question ({diff.upper()} - {topic})\n\n"
                f"{q_text}\n\n"
                f"{hints_formatted}\n\n"
                f"*(Please write your answer below so I can grade and evaluate your response!)*"
            )

        @tool
        def evaluate_student_answer(question: str, student_answer: str) -> str:
            """
            Evaluate and grade a student's answer to an exam question out of 10 points.
            Highlights strengths, missing details, offers a model answer, and asks a follow-up.
            """
            tracker["actions_taken"].append("Evaluated student answer")
            context = RagService.build_context(
                db=db,
                subject_id=effective_subject_id,
                lecture_id=effective_lecture_id if scope == "lecture" else None,
                query=question
            )
            settings = get_settings()
            key = settings.gemini_api_key if settings.summarization_engine == "gemini" else settings.openai_api_key
            model = settings.gemini_model if settings.summarization_engine == "gemini" else settings.openai_model
            agent = GrillAgent(engine=settings.summarization_engine, api_key=key, model=model)
            res = agent.evaluate_answer(
                context=context,
                question=question,
                student_answer=student_answer,
                subject_name=subject_name
            )

            score = res.get("score", 0)
            feedback = res.get("feedback", "")
            strengths = "\n".join([f"- {s}" for s in res.get("strengths", [])])
            missing = "\n".join([f"- {m}" for m in res.get("missing_or_incorrect", [])])
            model_ans = res.get("model_answer", "")
            followup = res.get("follow_up_question", "")

            return (
                f"### 🎯 Evaluation: **{score}/10 Points**\n\n"
                f"{feedback}\n\n"
                f"**Strengths:**\n{strengths}\n\n"
                f"**Missing / Needs Clarification:**\n{missing}\n\n"
                f"**Exemplary Model Answer:**\n{model_ans}\n\n"
                f"**Follow-up Question:**\n{followup}"
            )

        tools: list[Any] = [search_knowledge_base, edit_lecture_summary, grill_me, evaluate_student_answer]

        # Add course-level multi-lecture tools if scope is subject
        if scope == "subject":
            @tool
            def list_subject_lectures() -> str:
                """
                List all lectures scheduled or held for this subject with their dates,
                status, and available learning assets (slides, summaries, transcripts).
                """
                tracker["actions_taken"].append("Listed all subject lectures")
                lectures = (
                    db.query(LectureDB)
                    .filter(LectureDB.subject_id == effective_subject_id)
                    .order_by(LectureDB.start_time.asc())
                    .all()
                )
                if not lectures:
                    return f"No lectures found for subject '{subject_name}'."

                lines = [f"**Lectures for {subject_name} ({len(lectures)} total):**\n"]
                for i, l in enumerate(lectures, 1):
                    dt = l.start_time.strftime("%Y-%m-%d %H:%M")
                    mats_count = len(l.materials or [])
                    has_sum = "✅ Summary" if (l.ai_summary_override or l.meetings) else "❌ No Summary"
                    lines.append(f"{i}. **{l.title}** (ID: `{l.id}`)\n   - Date: {dt} | Status: `{l.status}` | {mats_count} materials | {has_sum}")
                return "\n".join(lines)

            @tool
            def get_lecture_details(target_lecture_id: str) -> str:
                """
                Retrieve detailed information, student notes, and markdown summary for a specific lecture in the subject.
                """
                tracker["actions_taken"].append(f"Fetched details for lecture {target_lecture_id}")
                l = db.query(LectureDB).filter(LectureDB.id == target_lecture_id).first()
                if not l:
                    return f"Lecture with ID '{target_lecture_id}' not found."

                summary = l.ai_summary_override or (l.meetings[0].markdown_content if l.meetings else "") or "No summary available yet."
                notes = l.notes or "No personal student notes recorded."
                return (
                    f"### {l.title}\n"
                    f"- **Date:** {l.start_time.strftime('%Y-%m-%d %H:%M')} | Room: {l.room or 'N/A'}\n"
                    f"- **Status:** {l.status}\n"
                    f"- **Student Notes:**\n{notes}\n\n"
                    f"- **Current Summary:**\n{summary[:2000]}"
                )

            tools.extend([list_subject_lectures, get_lecture_details])

        return tools

    @classmethod
    def build_system_prompt(
        cls,
        scope: str,
        lecture_title: str | None,
        subject_name: str,
        student_notes: str | None,
        token_saver: bool = False,
    ) -> str:
        """Constructs authoritative persona and operational instructions for LangGraph."""
        economy_directive = ""
        if token_saver:
            economy_directive = """
========================================
⚡ CRITICAL DIRECTIVE: TOKEN ECONOMY / ECO-MODE IS ACTIVE
========================================
1. MINIMIZE ALL TOKEN CONSUMPTION:
   - Provide ultra-dense, compact, high-signal responses.
   - Eliminate filler, pleasantries, conversational fluff, greetings, and pleasant endings.
   - NEVER repeat, rephrase, or acknowledge the user's question. Jump directly to the factual answer.
2. COMPACT STRUCTURE:
   - Use tight bullet points, concise technical definitions, or minimal code snippets.
   - Do NOT provide expansive background essays or unrequested tangents.
   - Deliver maximal knowledge using minimal tokens.
========================================
"""

        if scope == "lecture":
            return f"""You are the dedicated Academic AI Tutor and Pair Programmer for the lecture:
"{lecture_title or 'Current Lecture'}" in {subject_name}.
{economy_directive}
YOUR CAPABILITIES & TOOLS:
1. Knowledge Grounding (`search_knowledge_base`):
   - You have access to vector embeddings and full-text RAG of presentation slides (.pptx, .pdf), audio transcripts, uploaded markdown summaries, and timetable notes.
   - Always search the knowledge base when asked specific factual, theoretical, or code questions about this lecture.
2. Edit Lecture Summary (`edit_lecture_summary`):
   - If the student asks you to add something to the summary, rewrite sections, fix notes, or expand points, call `edit_lecture_summary`.
   - Provide the complete new markdown for the lecture summary. It will be saved directly to the database and re-indexed.
3. Exam Drill (`grill_me` and `evaluate_student_answer`):
   - If the student types `/grill me` or asks for practice questions, use `grill_me` to challenge them on real course concepts.
   - When the student replies with their answer, use `evaluate_student_answer` to grade them accurately out of 10 points.

{f'STUDENT NOTES CONTEXT:\n"""{student_notes}"""\n' if student_notes else ''}
COMMUNICATION STYLE:
- Professional, supportive, highly technical, and concise.
- Format responses with GitHub Markdown, code blocks with syntax highlighting, bullet points, and clear bold headings.
- Never invent facts; consult the lecture materials when uncertain."""
        else:
            return f"""You are the Master Course AI Tutor and Examiner for the entire academic module:
"{subject_name}".
{economy_directive}
YOUR CAPABILITIES & TOOLS:
1. Course-Wide Search (`search_knowledge_base`):
   - You have indexed access to all lectures, slides (.pptx/.pdf), audio recordings, and summaries in this subject.
   - Search across lectures to answer overarching questions, track topic progression, or locate specific concepts.
2. Lecture Catalog (`list_subject_lectures` & `get_lecture_details`):
   - List lectures and inspect individual lecture summaries, dates, and materials.
3. Edit Any Lecture Summary (`edit_lecture_summary`):
   - You can update the summary of any lecture in this subject when requested.
4. Subject-Wide Exam Drill (`grill_me` & `evaluate_student_answer`):
   - Test the student on individual lectures or holistic course themes when they type `/grill me`.

COMMUNICATION STYLE:
- Clear, academic, structured, and exam-oriented.
- Highlight connections between different lectures in the course."""

    @classmethod
    def load_thread_history(cls, db: Session, thread_id: str) -> list[BaseMessage]:
        """Loads persistent message history from AgentCheckpointDB."""
        latest_cp = AgentCheckpointer.get_latest_checkpoint(db, thread_id)
        if not latest_cp or not latest_cp.state:
            return []

        raw_msgs = latest_cp.state.get("messages", [])
        messages: list[BaseMessage] = []
        for m in raw_msgs:
            role = m.get("role")
            content = m.get("content", "")
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
        return messages

    @classmethod
    def save_thread_history(
        cls,
        db: Session,
        thread_id: str,
        user_message: str,
        assistant_message: str,
        metadata: dict[str, Any] | None = None
    ) -> None:
        """Appends new messages to persistent thread state in AgentCheckpointDB."""
        latest_cp = AgentCheckpointer.get_latest_checkpoint(db, thread_id)
        current_msgs = latest_cp.state.get("messages", []) if (latest_cp and latest_cp.state) else []

        current_msgs.append({
            "role": "user",
            "content": user_message,
            "timestamp": datetime.now(UTC).isoformat()
        })
        current_msgs.append({
            "role": "assistant",
            "content": assistant_message,
            "timestamp": datetime.now(UTC).isoformat()
        })

        # Keep last 30 messages in memory window
        if len(current_msgs) > 30:
            current_msgs = current_msgs[-30:]

        AgentCheckpointer.save_checkpoint(
            db=db,
            thread_id=thread_id,
            state={"messages": current_msgs},
            agent_name="langgraph_study_agent",
            metadata=metadata or {}
        )

    @classmethod
    def chat(
        cls,
        db: Session,
        message: str,
        scope: str = "lecture",
        lecture_id: str | None = None,
        subject_id: str | None = None,
        thread_id: str | None = None,
        token_saver: bool = False,
    ) -> dict[str, Any]:
        """
        Executes a LangGraph conversational turn with dynamic tools and context.
        """
        clean_msg = message.strip()
        effective_thread_id = thread_id or (
            f"lec_chat_{lecture_id}" if scope == "lecture" and lecture_id else f"subj_chat_{subject_id or 'general'}"
        )

        # Context details
        lec_obj = db.query(LectureDB).filter(LectureDB.id == lecture_id).first() if lecture_id else None
        subj_obj = (
            db.query(SubjectDB).filter(SubjectDB.id == subject_id).first()
            if subject_id
            else (lec_obj.subject if lec_obj else None)
        )
        subject_name = subj_obj.name if subj_obj else "Academic Course"
        lecture_title = lec_obj.title if lec_obj else None
        student_notes = lec_obj.notes if lec_obj else None

        # Build tools & tracking container
        tracker: dict[str, Any] = {
            "actions_taken": [],
            "updated_summary": None
        }
        if token_saver:
            tracker["actions_taken"].append("⚡ Eco-mode active")

        tools = cls.create_tools(
            db=db,
            scope=scope,
            lecture_id=lecture_id,
            subject_id=subject_id,
            tracker=tracker,
            token_saver=token_saver,
        )

        llm = cls.get_llm(token_saver=token_saver)
        llm_with_tools = llm.bind_tools(tools)

        def call_model(state: MessagesState):
            messages = state["messages"]
            response = llm_with_tools.invoke(messages)
            return {"messages": [response]}

        # Define pure LangGraph workflow
        workflow = StateGraph(MessagesState)
        workflow.add_node("agent", call_model)
        workflow.add_node("tools", ToolNode(tools))
        workflow.add_edge(START, "agent")
        workflow.add_conditional_edges("agent", tools_condition)
        workflow.add_edge("tools", "agent")

        graph = workflow.compile()

        # Build message history for prompt
        system_prompt = cls.build_system_prompt(
            scope=scope,
            lecture_title=lecture_title,
            subject_name=subject_name,
            student_notes=student_notes,
            token_saver=token_saver,
        )

        past_messages = cls.load_thread_history(db, effective_thread_id)

        # Handle explicit /grill me shortcut
        augmented_input = clean_msg
        if clean_msg.lower().startswith("/grill") or clean_msg.lower() == "/grill me":
            augmented_input = "Please grill me on this material by generating a challenging exam question using the grill_me tool!"

        # Reduce input token window in token saver mode (3 turns instead of 10)
        history_window = 3 if token_saver else 10

        graph_input_messages = [
            SystemMessage(content=system_prompt),
            *past_messages[-history_window:],  # keep compact context window to save tokens
            HumanMessage(content=augmented_input)
        ]

        try:
            result = graph.invoke({"messages": graph_input_messages})
            final_message = result["messages"][-1]
            response_text = extract_text_from_message(final_message.content)
        except Exception as e:
            logger.error(f"Error executing LangGraph study agent: {e}", exc_info=True)
            response_text = f"I encountered an issue processing your request: {e}. Please try again."

        # Save to persistent thread checkpointer
        cls.save_thread_history(
            db=db,
            thread_id=effective_thread_id,
            user_message=clean_msg,
            assistant_message=response_text,
            metadata={"scope": scope, "lecture_id": lecture_id, "subject_id": subject_id, "token_saver": token_saver}
        )

        # Generate smart follow-up suggestions (disabled in token_saver to keep response payload small)
        suggestions = []
        if not token_saver:
            if scope == "lecture":
                suggestions = [
                    "🔥 /grill me on this topic",
                    "✏️ Update summary with key takeaways",
                    "💡 Explain the core formula/algorithm",
                ]
            else:
                suggestions = [
                    "🔥 /grill me across the course",
                    "🔍 Which lecture covered indexing?",
                    "📊 Compare lecture topics",
                ]

        return {
            "response": response_text,
            "thread_id": effective_thread_id,
            "actions_taken": tracker["actions_taken"],
            "suggested_followups": suggestions,
            "updated_summary": tracker["updated_summary"]
        }

    @classmethod
    def get_history(cls, db: Session, thread_id: str) -> list[dict[str, Any]]:
        """Retrieve formatted message history for UI hydration."""
        latest_cp = AgentCheckpointer.get_latest_checkpoint(db, thread_id)
        if not latest_cp or not latest_cp.state:
            return []
        return latest_cp.state.get("messages", [])

    @classmethod
    def clear_history(cls, db: Session, thread_id: str) -> bool:
        """Clear all checkpoints for a specific thread."""
        db.query(AgentCheckpointDB).filter(AgentCheckpointDB.thread_id == thread_id).delete()
        db.commit()
        return True
