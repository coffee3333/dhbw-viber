import base64
import ipaddress
import re
import socket
from typing import Any
import httpx
from app.core.logger import get_logger

logger = get_logger("meeting_agent.jira_client")

JIRA_DOMAIN_REGEX = re.compile(
    r"^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"
)


def validate_jira_domain(domain: str) -> str:
    """Validate Jira domain to prevent SSRF against internal cluster services or metadata APIs."""
    clean_domain = re.sub(r"^https?://", "", domain.strip()).rstrip("/").split("/")[0].split(":")[0]
    if not JIRA_DOMAIN_REGEX.match(clean_domain):
        raise ValueError(f"Invalid Jira domain format: {domain}")

    # DNS check to block private IP ranges and cloud metadata
    try:
        addr_info = socket.getaddrinfo(clean_domain, 443, proto=socket.IPPROTO_TCP)
        for entry in addr_info:
            ip_str = entry[4][0]
            ip_obj = ipaddress.ip_address(ip_str)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved or ip_obj.is_multicast:
                raise ValueError(f"Target domain resolves to forbidden private or link-local address: {ip_str}")
    except socket.gaierror as e:
        raise ValueError(f"Could not resolve Jira domain: {e}") from e

    return clean_domain


class JiraClient:
    """Async Jira REST & Agile API client."""

    def __init__(self, domain: str, email: str, api_token: str):
        self.domain = validate_jira_domain(domain)
        email = email.strip()
        api_token = api_token.strip()
        self.base_url = f"https://{self.domain}/rest"
        auth_str = f"{email}:{api_token}"
        b64_token = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
        self.headers = {
            "Authorization": f"Basic {b64_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def create_sprint(self, name: str, start_date: str, end_date: str, board_id: int, activate: bool = False) -> int:
        """Create a sprint in Jira Agile and optionally activate it."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                res = await client.post(
                    f"{self.base_url}/agile/1.0/sprint",
                    json={
                        "name": name,
                        "originBoardId": board_id,
                        "startDate": start_date,
                        "endDate": end_date,
                    },
                    headers=self.headers,
                )
                res.raise_for_status()
            except httpx.HTTPStatusError as e:
                # If board has sprints feature disabled (Team-Managed / Kanban), automatically enable it and retry
                if e.response is not None and "does not support sprints" in e.response.text:
                    logger.info(f"Board {board_id} has sprints feature disabled in Jira. Auto-enabling jsw.agility.sprints...")
                    try:
                        # Auto-enable backlog feature first (prerequisite for sprints)
                        await client.put(
                            f"{self.base_url}/agile/1.0/board/{board_id}/features",
                            json={"boardId": board_id, "feature": "jsw.agility.backlog", "enabling": True},
                            headers=self.headers,
                        )
                        enable_res = await client.put(
                            f"{self.base_url}/agile/1.0/board/{board_id}/features",
                            json={"boardId": board_id, "feature": "jsw.agility.sprints", "enabling": True},
                            headers=self.headers,
                        )
                        logger.info(f"Board {board_id} feature enable status: {enable_res.status_code}")
                        # Retry creating sprint
                        res = await client.post(
                            f"{self.base_url}/agile/1.0/sprint",
                            json={
                                "name": name,
                                "originBoardId": board_id,
                                "startDate": start_date,
                                "endDate": end_date,
                            },
                            headers=self.headers,
                        )
                        res.raise_for_status()
                    except Exception as retry_err:
                        logger.error(f"Failed to auto-enable sprints on board {board_id}: {retry_err}")
                        raise
                else:
                    raise
            sprint_id = res.json()["id"]

            if activate:
                try:
                    await client.put(
                        f"{self.base_url}/agile/1.0/sprint/{sprint_id}",
                        json={
                            "name": name,
                            "state": "active",
                            "startDate": start_date,
                            "endDate": end_date,
                        },
                        headers=self.headers,
                    )
                except Exception as e:
                    logger.warning(f"Could not immediately activate sprint {sprint_id} in Jira: {e}")

            return sprint_id

    async def update_sprint(
        self,
        sprint_id: int,
        name: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        state: str | None = None,
    ) -> bool:
        """Update sprint dates, name, or state in Jira Agile."""
        payload: dict[str, Any] = {}
        if name:
            payload["name"] = name
        if start_date:
            payload["startDate"] = start_date
        if end_date:
            payload["endDate"] = end_date
        if state:
            payload["state"] = state
        else:
            # Jira requires 'state' on PUT /agile/1.0/sprint/{id}
            async with httpx.AsyncClient(timeout=10.0) as client:
                try:
                    curr = await client.get(f"{self.base_url}/agile/1.0/sprint/{sprint_id}", headers=self.headers)
                    if curr.status_code == 200:
                        payload["state"] = curr.json().get("state", "future")
                except Exception:
                    payload["state"] = "future"
            if "state" not in payload:
                payload["state"] = "future"

        if not payload:
            return True

        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.put(
                f"{self.base_url}/agile/1.0/sprint/{sprint_id}",
                json=payload,
                headers=self.headers,
            )
            if res.status_code in (200, 204):
                return True
            logger.warning(f"Failed to update sprint {sprint_id} in Jira: {res.status_code} {res.text}")
            return False

    async def create_issue(
        self,
        project_key: str,
        summary: str,
        description: str = "",
        issue_type: str = "Task",
        priority: str = "Medium",
        start_date: str | None = None,
        due_date: str | None = None,
        story_points: float | None = None,
        original_estimate: str | None = None,
        time_spent: str | None = None,
        assignee_account_id: str | None = None,
        custom_fields: dict[str, Any] | None = None,
    ) -> str:
        """Create an issue in Jira with complete metadata and worklog."""
        fields: dict[str, Any] = {
            "project": {"key": project_key},
            "summary": summary,
            "description": {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": description or ""}],
                    }
                ],
            },
            "issuetype": {"name": issue_type or "Task"},
            "priority": {"name": priority or "Medium"},
        }

        if due_date:
            fields["duedate"] = due_date[:10]
        if start_date:
            fields["customfield_10015"] = start_date[:10]
        if story_points is not None:
            fields["customfield_10016"] = float(story_points)
        if assignee_account_id:
            fields["assignee"] = {"accountId": assignee_account_id}

        if original_estimate:
            est_str = str(original_estimate).strip()
            fields["timetracking"] = {"originalEstimate": est_str}

        # Apply any dynamic custom fields
        if custom_fields:
            for k, v in custom_fields.items():
                if v is not None:
                    fields[k] = v if isinstance(v, list) else [v]

        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                f"{self.base_url}/api/3/issue",
                json={"fields": fields},
                headers=self.headers,
            )
            res.raise_for_status()
            issue_key = res.json()["key"]

            # Log work time if provided
            if time_spent:
                try:
                    await client.post(
                        f"{self.base_url}/api/3/issue/{issue_key}/worklog",
                        json={"timeSpent": str(time_spent)},
                        headers=self.headers,
                    )
                except Exception as e:
                    logger.warning(f"Could not log worklog for {issue_key}: {e}")

            return issue_key

    async def update_issue(
        self,
        issue_key: str,
        summary: str | None = None,
        description: str | None = None,
        priority: str | None = None,
        start_date: str | None = None,
        due_date: str | None = None,
        story_points: float | None = None,
        assignee_account_id: str | None = None,
        original_estimate: str | None = None,
        time_spent: str | None = None,
    ) -> bool:
        """Update an existing issue's fields in Jira."""
        if not issue_key:
            return False
        fields: dict[str, Any] = {}
        if summary is not None:
            fields["summary"] = summary
        if description is not None:
            fields["description"] = {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": description}],
                    }
                ],
            }
        if priority is not None:
            fields["priority"] = {"name": priority}
        if due_date is not None:
            fields["duedate"] = due_date[:10] if due_date else None
        if start_date is not None:
            fields["customfield_10015"] = start_date[:10] if start_date else None
        if story_points is not None:
            fields["customfield_10016"] = float(story_points)
        if assignee_account_id is not None:
            fields["assignee"] = {"accountId": assignee_account_id} if assignee_account_id else None
        if original_estimate:
            fields["timetracking"] = {"originalEstimate": str(original_estimate).strip()}

        success = True
        if fields:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.put(
                    f"{self.base_url}/api/3/issue/{issue_key}",
                    json={"fields": fields},
                    headers=self.headers,
                )
                if res.status_code in (200, 204):
                    logger.info(f"Updated issue {issue_key} in Jira")
                else:
                    logger.warning(f"Failed to update issue {issue_key} in Jira: {res.status_code} {res.text}")
                    success = False

        if time_spent:
            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    await client.post(
                        f"{self.base_url}/api/3/issue/{issue_key}/worklog",
                        json={"timeSpent": str(time_spent)},
                        headers=self.headers,
                    )
            except Exception as we:
                logger.warning(f"Could not log worklog for {issue_key}: {we}")

        return success

    async def add_to_sprint(self, sprint_id: int, issue_keys: list[str] | str) -> None:
        """Add one or more issues to an active sprint."""
        keys = [issue_keys] if isinstance(issue_keys, str) else issue_keys
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                f"{self.base_url}/agile/1.0/sprint/{sprint_id}/issue",
                json={"issues": keys},
                headers=self.headers,
            )
            res.raise_for_status()

    async def transition_issue(self, issue_key: str, target_status: str) -> None:
        """Transition an issue to the target status (e.g. In Progress, Done)."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            # 1. Get available transitions
            trans_res = await client.get(
                f"{self.base_url}/api/3/issue/{issue_key}/transitions",
                headers=self.headers,
            )
            trans_res.raise_for_status()
            transitions = trans_res.json().get("transitions", [])

            match = next((t for t in transitions if t["name"].lower() == target_status.lower()), None)
            if not match:
                available = ", ".join([t["name"] for t in transitions])
                raise ValueError(
                    f"Transition '{target_status}' not found for {issue_key}. Available: {available}"
                )

            # 2. Perform transition
            post_res = await client.post(
                f"{self.base_url}/api/3/issue/{issue_key}/transitions",
                json={"transition": {"id": match["id"]}},
                headers=self.headers,
            )
            post_res.raise_for_status()

    async def close_sprint(self, sprint_id: int) -> None:
        """Close an active sprint."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            get_res = await client.get(
                f"{self.base_url}/agile/1.0/sprint/{sprint_id}",
                headers=self.headers,
            )
            get_res.raise_for_status()
            sprint_data = get_res.json()

            close_res = await client.put(
                f"{self.base_url}/agile/1.0/sprint/{sprint_id}",
                json={
                    "name": sprint_data["name"],
                    "state": "closed",
                    "startDate": sprint_data["startDate"],
                    "endDate": sprint_data["endDate"],
                },
                headers=self.headers,
            )
            close_res.raise_for_status()

    async def delete_sprint(self, sprint_id: int) -> None:
        """Delete a sprint in Jira Agile."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.delete(
                f"{self.base_url}/agile/1.0/sprint/{sprint_id}",
                headers=self.headers,
            )
            if res.status_code not in (200, 204, 404):
                res.raise_for_status()

    async def ensure_board_features(self, board_id: int) -> bool:
        """Auto-configure agile board: Ensure Backlog, Sprints, Estimation, and Reports are enabled."""
        if not board_id:
            return False
        features_to_enable = [
            "jsw.agility.backlog",     # Must be enabled first (prerequisite for sprints)
            "jsw.agility.sprints",     # Enables sprint lifecycle & agile endpoints
            "jsw.agility.reports",     # Enables velocity & burnup charts
            "jsw.agility.estimation",  # Enables story points estimation
        ]
        async with httpx.AsyncClient(timeout=10.0) as client:
            success = True
            for feat in features_to_enable:
                try:
                    res = await client.put(
                        f"{self.base_url}/agile/1.0/board/{board_id}/features",
                        json={"boardId": board_id, "feature": feat, "enabling": True},
                        headers=self.headers,
                    )
                    if res.status_code not in (200, 204):
                        success = False
                except Exception as e:
                    logger.debug(f"Could not enable feature {feat} on board {board_id}: {e}")
                    success = False
            if success:
                logger.info(f"Successfully verified/enabled agile features on board {board_id}")
            return success

    async def get_backlog_issues(self, board_id: int) -> list[dict[str, Any]]:
        """Fetch incomplete issues currently in the board backlog."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                f"{self.base_url}/agile/1.0/board/{board_id}/backlog?maxResults=100&fields=summary,status,assignee,priority,issuetype",
                headers=self.headers,
            )
            if res.status_code in (400, 404):
                try:
                    enabled = await self.ensure_board_features(board_id)
                    if enabled:
                        retry_res = await client.get(
                            f"{self.base_url}/agile/1.0/board/{board_id}/backlog?maxResults=100&fields=summary,status,assignee,priority,issuetype",
                            headers=self.headers,
                        )
                        if retry_res.status_code == 200:
                            return retry_res.json().get("issues", [])
                except Exception:
                    pass
                logger.info(f"Board {board_id} does not support agile backlog (HTTP {res.status_code})")
                return []
            res.raise_for_status()
            return res.json().get("issues", [])

    async def discover_members(self, project_key: str) -> list[dict[str, Any]]:
        """Auto-discovery: Fetch assignable users for a project."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                f"{self.base_url}/api/3/user/assignable/search?project={project_key}&maxResults=50",
                headers=self.headers,
            )
            res.raise_for_status()
            users = res.json()
            return [
                {
                    "account_id": u.get("accountId"),
                    "display_name": u.get("displayName"),
                    "email": u.get("emailAddress"),
                    "avatar_url": u.get("avatarUrls", {}).get("48x48"),
                    "active": u.get("active", True),
                }
                for u in users
                if u.get("accountType") == "atlassian"
            ]

    async def discover_custom_fields(self) -> list[dict[str, Any]]:
        """Auto-discovery: List all custom fields in Jira to map story points, use case, etc."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                f"{self.base_url}/api/3/field",
                headers=self.headers,
            )
            res.raise_for_status()
            fields = res.json()
            return [
                {"id": f["id"], "name": f["name"], "custom": f.get("custom", False)}
                for f in fields
                if f.get("custom")
            ]

    async def test_connection(self) -> dict[str, Any]:
        """Test authentication and Jira API access."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(
                f"{self.base_url}/api/3/myself",
                headers=self.headers,
            )
            res.raise_for_status()
            return res.json()

    async def get_boards(self, project_key: str | None = None) -> list[dict[str, Any]]:
        """Get agile boards for the project and ensure their agile features are enabled."""
        url = f"{self.base_url}/agile/1.0/board"
        params = {}
        if project_key:
            params["projectKeyOrId"] = project_key
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(url, params=params, headers=self.headers)
            res.raise_for_status()
            boards = res.json().get("values", [])
            for b in boards:
                bid = b.get("id")
                if bid:
                    try:
                        await self.ensure_board_features(bid)
                    except Exception as fe:
                        logger.debug(f"Failed to auto-enable features on board {bid}: {fe}")
            return boards

    async def get_sprints(self, board_id: int) -> list[dict[str, Any]]:
        """Get all sprints for a board. Returns [] if board does not support sprints (e.g. Kanban)."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                f"{self.base_url}/agile/1.0/board/{board_id}/sprint",
                headers=self.headers,
            )
            if res.status_code in (400, 404):
                try:
                    enabled = await self.ensure_board_features(board_id)
                    if enabled:
                        retry_res = await client.get(
                            f"{self.base_url}/agile/1.0/board/{board_id}/sprint",
                            headers=self.headers,
                        )
                        if retry_res.status_code == 200:
                            return retry_res.json().get("values", [])
                except Exception:
                    pass
                # Board does not support sprints (Kanban board)
                logger.info(f"Board {board_id} does not support sprints (HTTP {res.status_code}) - treating as Kanban board")
                return []
            res.raise_for_status()
            return res.json().get("values", [])

    async def get_projects(self) -> list[dict[str, Any]]:
        """Get all projects accessible in Jira."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                f"{self.base_url}/api/3/project",
                headers=self.headers,
            )
            res.raise_for_status()
            return res.json()

    async def get_sprint_issues(self, sprint_id: int) -> list[dict[str, Any]]:
        """Fetch all issues belonging to a sprint."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                f"{self.base_url}/agile/1.0/sprint/{sprint_id}/issue?maxResults=100",
                headers=self.headers,
            )
            if res.status_code in (400, 404):
                return []
            res.raise_for_status()
            return res.json().get("issues", [])

    async def get_board_issues(self, board_id: int) -> list[dict[str, Any]]:
        """Fetch all issues on an agile board."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                f"{self.base_url}/agile/1.0/board/{board_id}/issue?maxResults=100",
                headers=self.headers,
            )
            if res.status_code in (400, 404):
                return []
            res.raise_for_status()
            return res.json().get("issues", [])

    async def get_project_issues(self, project_key: str) -> list[dict[str, Any]]:
        """Fetch all issues for a project key via JQL search."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(
                f"{self.base_url}/api/3/search/jql?jql=project%3D{project_key}&maxResults=100&fields=key,summary,status,assignee,priority,issuetype,customfield_10016",
                headers=self.headers,
            )
            if res.status_code != 200:
                logger.warning(f"get_project_issues failed ({res.status_code}): {res.text[:200]}")
                return []
            return res.json().get("issues", [])

    async def move_issues_to_sprint(self, sprint_id: int, issue_keys: list[str]) -> bool:
        """Move issues to a sprint in Jira Agile."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                f"{self.base_url}/agile/1.0/sprint/{sprint_id}/issue",
                json={"issues": issue_keys},
                headers=self.headers,
            )
            if res.status_code in (204, 200, 201):
                return True
            logger.warning(f"Failed to move issues to sprint in Jira: {res.status_code} {res.text}")
            return False

    async def move_issues_to_board(self, board_id: int, issue_keys: list[str]) -> bool:
        """Move issues from backlog to the board in Jira Agile."""
        if not board_id or not issue_keys:
            return False
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                f"{self.base_url}/agile/1.0/board/{board_id}/issue",
                json={"issues": issue_keys},
                headers=self.headers,
            )
            if res.status_code in (204, 200, 201):
                logger.info(f"Successfully moved issues {issue_keys} to board {board_id}")
                return True
            logger.warning(f"Failed to move issues to board {board_id} in Jira: {res.status_code} {res.text}")
            return False

    async def delete_issue(self, issue_key: str) -> bool:
        """Delete an issue in Jira."""
        if not issue_key:
            return False
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.delete(
                f"{self.base_url}/api/3/issue/{issue_key}",
                headers=self.headers,
            )
            return res.status_code in (204, 200)



