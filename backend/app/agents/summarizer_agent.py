import json

from app.agents.base import BaseAgent
from app.agents.templates import get_agent_prompt
from app.core.logger import get_logger
from app.models.schemas import ActionItemSchema, MeetingSummarySchema

logger = get_logger("meeting_agent.summarizer")

class SummarizerAgent(BaseAgent):
    """Agent responsible for understanding meeting flow and extracting structured summaries."""

    def analyze(
        self,
        transcript: str,
        template: str = "standard",
        custom_instructions: str | None = None,
        system_prompt_override: str | None = None
    ) -> MeetingSummarySchema:
        if not transcript or not transcript.strip():
            return MeetingSummarySchema(
                title="Empty Meeting",
                overview="No speech detected.",
                executive_summary="The audio did not contain audible speech.",
                key_points=[],
                decisions=[],
                action_items=[],
                open_questions=[],
                markdown_content="# Empty Recording\n\nNo speech was detected."
            )

        base_system = system_prompt_override or get_agent_prompt(template)
        system_prompt = f"""{base_system}

You must respond with valid JSON matching this schema:
{{
  "title": "string",
  "overview": "string",
  "executive_summary": "string",
  "key_points": ["string"],
  "decisions": ["string"],
  "action_items": [
    {{
      "task": "string",
      "assignee": "string",
      "priority": "High | Medium | Low",
      "deadline": "string or null"
    }}
  ],
  "open_questions": ["string"],
  "markdown_content": "string"
}}"""

        user_prompt = f"""{"Additional Instructions: " + custom_instructions if custom_instructions else ""}

Meeting Transcript:
-------------------
{transcript}
-------------------

Generate the structured JSON analysis."""

        raw_response = self.call_llm(system_prompt, user_prompt, json_mode=True)
        try:
            data = json.loads(self.clean_json(raw_response))
            actions = [
                ActionItemSchema(
                    task=a.get("task", ""),
                    assignee=a.get("assignee") or "Unassigned",
                    priority=a.get("priority") or "Medium",
                    deadline=a.get("deadline") or None,
                    completed=False
                )
                for a in data.get("action_items", [])
            ]
            return MeetingSummarySchema(
                title=data.get("title"),
                overview=data.get("overview", ""),
                executive_summary=data.get("executive_summary", ""),
                key_points=data.get("key_points", []),
                decisions=data.get("decisions", []),
                action_items=actions,
                open_questions=data.get("open_questions", []),
                markdown_content=data.get("markdown_content", "")
            )
        except Exception as e:
            logger.warning(f"SummarizerAgent parse fallback: {e}")
            return MeetingSummarySchema(
                title="Meeting Summary",
                overview="Generated from transcript.",
                executive_summary=raw_response[:500],
                key_points=["See full notes"],
                decisions=[],
                action_items=[],
                open_questions=[],
                markdown_content=raw_response
            )
