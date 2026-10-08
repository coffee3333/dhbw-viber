"""Agent Integration Guide Generator for Claude Code, Antigravity CLI, and autonomous agents."""
from typing import Optional


def generate_agents_guide(
    base_url: str,
    project_id: Optional[str] = None,
    project_name: Optional[str] = None,
    jira_key: Optional[str] = None,
    jira_board_id: Optional[int] = None,
) -> str:
    """Generate dynamic AGENTS.md content configured for the current deployment and project."""
    clean_base_url = base_url.rstrip("/")
    proj_id_str = project_id or "<project_id>"
    proj_name_str = project_name or "MeetingAgent Project"
    jira_key_str = jira_key or "<jira_project_key>"
    board_id_str = str(jira_board_id) if jira_board_id is not None else "<jira_board_id>"

    return f"""# MeetingAgent - Agent Integration Guide (Claude Code & Antigravity)

This file instructs autonomous coding agents (**Claude Code**, **Antigravity CLI `agy`**, Cursor, and subagents) on how to authenticate, retrieve calendar context, and programmatically schedule meetings and agile tasks in MeetingAgent.

Target Project: **{proj_name_str}**
- Project ID: `{proj_id_str}`
- Jira Project Key: `{jira_key_str}`
- Jira Board ID: `{board_id_str}`
- API Base URL: `{clean_base_url}`

---

## 1. System Architecture & Base URLs

- **Backend API**: `{clean_base_url}`
- **Authentication Method**: JWT Bearer token via standard login endpoint

---

## 2. Authentication (Username & Password)

All API endpoints (except login and status) require a JWT Bearer token or session cookie.

### Step 1: Authenticate
```bash
curl -X POST {clean_base_url}/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{{
    "username": "<your_username_or_admin>",
    "password": "<your_password>"
  }}'
```

**Response (`200 OK`)**:
```json
{{
  "success": true,
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": {{
    "id": "6f710e2a-8e78-427a-bc31-cdd254ca1f06",
    "username": "admin",
    "display_name": "Administrator",
    "role": "admin"
  }}
}}
```

Store the `access_token` and include it in all subsequent requests:
```bash
-H "Authorization: Bearer <access_token>"
```

---

## 3. Retrieving Context (Projects, Sprints, Backlog)

### A. Get Connected Jira Projects
```bash
curl -X GET {clean_base_url}/jira-automation/projects \\
  -H "Authorization: Bearer <access_token>"
```
Returns list of projects with their `id`, `jira_project_key`, and `jira_board_id`.

### B. Get Sprints & Scheduled Tasks / Events for this Project
```bash
curl -X GET {clean_base_url}/jira-automation/projects/{proj_id_str}/sprints \\
  -H "Authorization: Bearer <access_token>"
```
Returns all sprints, task titles, statuses, estimates, and scheduled move times.

### C. Get Project Team Members
```bash
curl -X GET {clean_base_url}/jira-automation/projects/{proj_id_str}/members \\
  -H "Authorization: Bearer <access_token>"
```
Returns members with `user_id` and Jira account mapping.

---

## 4. Scheduling a Meeting or Agile Task

To schedule a meeting directly into a sprint, make a `POST` request to `/jira-automation/sprints/{{sprint_id}}/tasks`.

### Example: Schedule a 1-Hour Meeting Task
```bash
curl -X POST {clean_base_url}/jira-automation/sprints/<sprint_id>/tasks \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "title": "Architecture Review Meeting",
    "description": "Team alignment on API architecture and data models.",
    "issue_type": "Meeting",
    "priority": "High",
    "start_date": "2026-10-08T14:00:00Z",
    "due_date": "2026-10-08T15:00:00Z",
    "original_estimate": "1h",
    "time_spent": "0m",
    "moves": [
      {{
        "status": "In Progress",
        "move_at": "2026-10-08T14:05:22Z"
      }},
      {{
        "status": "Done",
        "move_at": "2026-10-08T14:55:18Z"
      }}
    ]
  }}'
```

**Fields**:
- `issue_type`: `"Meeting"`, `"Task"`, `"Research"`, `"Bug"`, or `"Story"`.
- `original_estimate`: Estimated time duration (e.g. `"30m"`, `"1h"`, `"2h 30m"`, `"1d"`).
- `time_spent`: Actual time spent so far (e.g. `"0m"`, `"45m"`, `"1h"`).
- `moves`: Array of status transitions (`To Do` -> `In Progress` -> `Done`) with ISO timestamps.

---

## 5. Triggering the AI Planner Agent via API

You can also leverage the built-in Gemini Planner Agent directly:

### Step 1: Request a Structured Plan
```bash
curl -X POST {clean_base_url}/jira-automation/agent/chat \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "project_id": "{proj_id_str}",
    "message": "plan a 45-minute sync meeting with 15m spent"
  }}'
```

### Step 2: Approve & Execute the Plan
```bash
curl -X POST {clean_base_url}/jira-automation/agent/execute-plan \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "project_id": "{proj_id_str}",
    "plan": <plan_object_from_step_1>
  }}'
```

The server creates the sprint and tasks directly in Jira Cloud, links them to the active board, and schedules the status moves.

---

## 6. Guidelines for Autonomous Agents

1. **Strictly No Emojis**: Never insert emoji characters in task summaries, descriptions, or comments.
2. **Realistic Move Times**: Schedule status transitions strictly between `07:00` and `00:00` with realistic, varied minutes (e.g. `14:12:35`, `16:47:19`).
3. **Always Include Estimates**: Always specify both `original_estimate` and `time_spent`.
4. **Prefer Existing Sprints**: If an active sprint exists for the target date range, assign tasks to that sprint rather than creating redundant sprints.
"""


def generate_claude_guide(
    base_url: str,
    project_id: Optional[str] = None,
    project_name: Optional[str] = None,
    jira_key: Optional[str] = None,
    jira_board_id: Optional[int] = None,
) -> str:
    """Generate concise CLAUDE.md content for Claude Code repository integration."""
    clean_base_url = base_url.rstrip("/")
    proj_id_str = project_id or "<project_id>"
    proj_name_str = project_name or "MeetingAgent Project"

    return f"""# MeetingAgent - Claude Code Instructions (`CLAUDE.md`)

This guide enables Claude Code (`claude`) to schedule meetings, plan agile sprints, and automate Jira tasks via the MeetingAgent API.

Target Project: **{proj_name_str}** (`{proj_id_str}`)

## API Location & Authentication
- **Base URL**: `{clean_base_url}`
- **Login Endpoint**: `POST {clean_base_url}/auth/login`
- **Payload**: `{{"username": "<username>", "password": "<password>"}}`
- **Auth Header**: `Authorization: Bearer <access_token>`

## Workflow for Scheduling a Meeting
1. **Login**: Authenticate to obtain the JWT bearer token.
2. **Context**: Fetch projects (`GET {clean_base_url}/jira-automation/projects`) and active sprints (`GET {clean_base_url}/jira-automation/projects/{proj_id_str}/sprints`).
3. **Schedule**:
   - Direct: Call `POST {clean_base_url}/jira-automation/sprints/<sprint_id>/tasks` with `issue_type: "Meeting"`, `original_estimate` (e.g. `"1h"`), `time_spent` (e.g. `"0m"`), and scheduled `moves`.
   - Via AI Planner: Call `POST {clean_base_url}/jira-automation/agent/chat` followed by `POST {clean_base_url}/jira-automation/agent/execute-plan` with `"project_id": "{proj_id_str}"`.

## Rules
- **No emojis**: Never generate emojis in task titles, descriptions, or agent messages.
- **Time window**: All scheduled moves must fall between `07:00` and `00:00` with realistic minutes.
- **Time tracking**: Always supply `original_estimate` (estimated duration) and `time_spent` (actual time).
- For detailed curl examples and payload schemas, refer to `AGENTS.md`.
"""
