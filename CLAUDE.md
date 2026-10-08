# MeetingAgent - Claude Code Instructions (`CLAUDE.md`)

This guide enables Claude Code (`claude`) to schedule meetings, plan agile sprints, and automate Jira tasks via the MeetingAgent API.

## API Location & Authentication
- **Base URL**: `http://localhost:8000/api/v1`
- **Login Endpoint**: `POST /auth/login`
- **Payload**: `{"username": "<username>", "password": "<password>"}`
- **Auth Header**: `Authorization: Bearer <access_token>`

## Workflow for Scheduling a Meeting
1. **Login**: Authenticate to obtain the JWT bearer token.
2. **Context**: Fetch projects (`GET /jira-automation/projects`) and active sprints (`GET /jira-automation/projects/{project_id}/sprints`).
3. **Schedule**:
   - Direct: Call `POST /jira-automation/sprints/{sprint_id}/tasks` with `issue_type: "Meeting"`, `original_estimate` (e.g. `"1h"`), `time_spent` (e.g. `"0m"`), and scheduled `moves`.
   - Via AI Planner: Call `POST /jira-automation/agent/chat` followed by `POST /jira-automation/agent/execute-plan`.

## Rules
- **No emojis**: Never generate emojis in task titles, descriptions, or agent messages.
- **Time window**: All scheduled moves must fall between `07:00` and `00:00` with realistic minutes.
- **Time tracking**: Always supply `original_estimate` (estimated duration) and `time_spent` (actual time).
- For detailed curl examples and payload schemas, refer to `AGENTS.md`.
