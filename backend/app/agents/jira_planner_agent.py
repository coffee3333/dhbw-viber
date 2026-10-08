import json
from typing import Any
from app.agents.base import BaseAgent
from app.core.logger import get_logger

logger = get_logger("meeting_agent.jira_planner_agent")


class JiraPlannerAgent(BaseAgent):
    """Agent for planning Jira sprints, tasks, and realistic automated status moves."""

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        # Default to gemini engine
        super().__init__(engine="gemini", api_key=api_key, model=model)

    def plan(
        self,
        user_message: str,
        project_info: dict[str, Any],
        current_time_iso: str,
        active_sprints: list[dict[str, Any]],
        backlog_issues: list[dict[str, Any]],
        project_members: list[dict[str, Any]],
        chat_history: list[dict[str, str]] | None = None,
        existing_tasks: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Execute structured planning call to Gemini."""
        system_prompt = """You are an expert Jira Agile Planning Agent.
CRITICAL INSTRUCTIONS:
1. STRICTLY NO EMOJIS. Do not include any emojis in your response, task titles, descriptions, or messages.
2. MINIMIZE TOKEN CONSUMPTION. Be concise, direct, and straightforward. No conversational fluff or lengthy commentary.
3. ACTIONS & EDITION OF SPRINTS & TASKS:
   - When the user asks to edit, update, reschedule, or change an existing sprint (e.g. "edit the sprint", "change planned end to 13:50", "extend sprint", "rename sprint"):
     * You MUST set "action": "update".
     * You MUST set "existing_sprint_id" to the ID of the matching sprint from 'Active/Future Sprints' (or match by name).
     * DO NOT create a new sprint when the user asks to edit an existing one!
     * Specify the updated "start_date" or "end_date" or "name".
   - When the user asks to create a new sprint:
     * Set "action": "create".
   - When the user asks to edit, update, or reschedule an existing task or its events/status moves:
     * You MUST set "action": "update".
     * You MUST set "existing_task_id" to the ID of the existing task from 'Existing Tasks & Scheduled Moves' (and include "jira_issue_key" if known).
     * Specify the updated fields (e.g. title, start_date, due_date, or new scheduled moves).
     * DO NOT create a duplicate task when the user asks to edit or reschedule an existing task!
   - When the user asks to create new tasks:
     * Set "action": "create".
     * If 'Active/Future Sprints' is empty, auto-include a new sprint ("action": "create") and assign tasks to it.
     * If there are already active sprints and user didn't request a new sprint, assign tasks to the active sprint ("existing_sprint_id": "...").
   - When the user asks to delete or remove a sprint or task:
     * Set "action": "delete" and provide "existing_sprint_id" or "existing_task_id".
4. HUMAN-IN-THE-LOOP PLAN MODE:
   When the user asks to create, edit, or schedule sprints, tasks, or status moves, you MUST produce a structured 'plan' object.
   The user will review this plan card and decide whether to approve and execute it.
5. STATUS MOVE SCHEDULING RULES:
   - When tasks are scheduled to move through statuses ('To Do' -> 'In Progress' -> 'Done'):
     * All moves must occur between the sprint's start_date and end_date.
     * All move timestamps MUST be scheduled strictly between 07:00 and 00:00 (7 AM to midnight).
     * Move times must be natural and realistic with varied minutes (e.g. 09:14, 11:37, 14:22, 17:48). Never use round 00:00:00 or identical timestamps.
     * Realistic progression: 'In Progress' should be scheduled when work begins, and 'Done' near completion/due date.
6. ESTIMATED & ACTUAL TIME TRACKING:
   - For each task, you MUST specify realistic time durations:
     * "original_estimate": Estimated time required (e.g. "30m", "1h", "2h", "4h", "1d").
     * "time_spent": Actual time spent (e.g. "0m" for new tasks, or realistic spent time if work is underway or completed, e.g. "45m", "1h 30m").
7. JSON OUTPUT FORMAT:
   Return valid JSON strictly following this schema:
   {
     "message": "Short direct summary of the proposed actions or answers.",
     "plan": {
       "sprints": [
         {
           "action": "create|update|delete",
           "existing_sprint_id": "sprint_id_if_update_or_delete_or_null",
           "temp_id": "sp_1",
           "name": "Sprint Name",
           "start_date": "YYYY-MM-DDTHH:MM:SS",
           "end_date": "YYYY-MM-DDTHH:MM:SS"
         }
       ],
       "tasks": [
         {
           "action": "create|update|delete",
           "existing_task_id": "task_id_if_update_or_delete_or_null",
           "jira_issue_key": "TN-2",
           "temp_id": "t_1",
           "sprint_temp_id": "sp_1",
           "existing_sprint_id": "sprint_id",
           "title": "Task title",
           "description": "Optional brief description",
           "priority": "Low|Medium|High",
           "issue_type": "Task|Bug|Story|Meeting",
           "story_points": 3,
           "original_estimate": "2h",
           "time_spent": "0m",
           "assignee_id": "member_id_or_null",
           "start_date": "YYYY-MM-DDTHH:MM:SS",
           "due_date": "YYYY-MM-DDTHH:MM:SS"
         }
       ],
       "moves": [
         {
           "task_temp_id": "t_1",
           "existing_task_id": "task_id_or_null",
           "from_status": "To Do",
           "status": "In Progress",
           "move_at": "YYYY-MM-DDTHH:MM:SS"
         }
       ]
     }
   }
   If no new sprint or task plan is needed (e.g. user is asking a general question), set "plan": null."""

        history_context = ""
        if chat_history:
            history_context = "Conversation History:\n" + "\n".join(
                f"- {m.get('role', 'user')}: {m.get('content', '')}"
                for m in chat_history[-6:]
            ) + "\n\n"

        context_str = f"""Current Time: {current_time_iso}
Project: {project_info.get('name')} (Key: {project_info.get('jira_project_key')}, Board ID: {project_info.get('jira_board_id')})
Active/Future Sprints: {json.dumps(active_sprints, ensure_ascii=False)}
Existing Tasks & Scheduled Moves: {json.dumps(existing_tasks or [], ensure_ascii=False)}
Backlog Issues: {json.dumps(backlog_issues[:15], ensure_ascii=False)}
Project Team Members: {json.dumps(project_members, ensure_ascii=False)}

{history_context}User Request: {user_message}"""

        raw_resp = self.call_llm(system_prompt=system_prompt, user_prompt=context_str, json_mode=True)
        cleaned = self.clean_json(raw_resp)
        try:
            return json.loads(cleaned)
        except Exception as e:
            logger.error(f"Failed to parse LLM planner response as JSON: {e}. Raw: {raw_resp[:300]}")
            return {
                "message": raw_resp.strip() or "Could not parse plan.",
                "plan": None,
            }
