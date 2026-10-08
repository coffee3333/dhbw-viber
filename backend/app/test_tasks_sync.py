import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from app.core.database import SessionLocal
from app.models.db import ActionItemDB, MeetingDB, SubjectDB, LectureDB
from app.models.jira_automation import (
    AutomationProjectDB,
    AutomationSprintDB,
    AutomationTaskDB,
)
from app.services.google.tasks_sync import (
    parse_due_date_to_rfc3339,
    sync_action_items_to_google_tasks,
    sync_jira_tasks_to_google_tasks,
    update_google_task_status,
    pull_google_tasks_status,
)


def test_rfc3339_date_parser():
    print("--> Testing parse_due_date_to_rfc3339...")
    
    # 1. ISO date YYYY-MM-DD
    res = parse_due_date_to_rfc3339("2026-11-20")
    assert res == "2026-11-20T00:00:00.000Z", f"Expected '2026-11-20T00:00:00.000Z', got {res}"
    print("  ✓ YYYY-MM-DD format parsed correctly")

    # 2. European date DD.MM.YYYY
    res = parse_due_date_to_rfc3339("25.12.2026")
    assert res == "2026-12-25T00:00:00.000Z", f"Expected '2026-12-25T00:00:00.000Z', got {res}"
    print("  ✓ DD.MM.YYYY format parsed correctly")

    # 3. Relative "tomorrow"
    now_utc = datetime.now(timezone.utc)
    expected_tomorrow = (now_utc + timedelta(days=1)).strftime("%Y-%m-%d")
    res = parse_due_date_to_rfc3339("Due tomorrow by 18:00")
    assert res is not None and res.startswith(expected_tomorrow), f"Expected prefix {expected_tomorrow}, got {res}"
    assert res.endswith("T00:00:00.000Z"), f"Expected trailing 'T00:00:00.000Z', got {res}"
    print("  ✓ 'tomorrow' parsed correctly to UTC midnight RFC 3339")

    # 4. Relative "in 3 days"
    expected_3days = (now_utc + timedelta(days=3)).strftime("%Y-%m-%d")
    res = parse_due_date_to_rfc3339("finish in 3 days")
    assert res is not None and res.startswith(expected_3days), f"Expected prefix {expected_3days}, got {res}"
    print("  ✓ 'in 3 days' parsed correctly")

    # 5. Fallback datetime
    fallback = datetime(2026, 10, 30, 14, 0, 0, tzinfo=timezone.utc)
    res = parse_due_date_to_rfc3339(None, fallback_dt=fallback)
    assert res == "2026-10-30T00:00:00.000Z", f"Expected '2026-10-30T00:00:00.000Z', got {res}"
    print("  ✓ Fallback datetime parsed correctly")

    # 6. Unparseable text with no fallback
    res = parse_due_date_to_rfc3339("sometime later maybe")
    assert res is None, f"Expected None for unparseable deadline, got {res}"
    print("  ✓ Unparseable string returns None safely")


def test_database_schema_fields():
    print("--> Testing DB schema support for action_items and automation_tasks...")
    from uuid import uuid4
    db = SessionLocal()
    try:
        meeting = MeetingDB(
            id=f"meet_schema_{uuid4().hex[:8]}",
            title="Schema Test Meeting",
        )
        db.add(meeting)
        db.commit()

        # Check action_items columns
        test_item = ActionItemDB(
            meeting_id=meeting.id,
            task="Test DB Schema Task",
            priority="High",
            due_date=datetime(2026, 10, 15, 0, 0, 0),
            completed=False,
            google_task_id="gtask_schema_test_123",
        )
        db.add(test_item)
        db.commit()
        db.refresh(test_item)

        assert test_item.id is not None
        assert test_item.due_date == datetime(2026, 10, 15, 0, 0, 0)
        assert test_item.google_task_id == "gtask_schema_test_123"
        print("  ✓ ActionItemDB due_date and google_task_id persisted successfully")

        # Clean up
        db.delete(test_item)
        db.delete(meeting)
        db.commit()
    finally:
        db.close()


def test_google_tasks_sync_with_mock():
    print("--> Testing Google Tasks API interaction with mock service...")
    
    mock_service = MagicMock()
    mock_tasks = MagicMock()
    mock_lists = MagicMock()
    
    mock_service.tasks.return_value = mock_tasks
    mock_service.tasklists.return_value = mock_lists

    # Mock list of task lists
    mock_lists.list.return_value.execute.return_value = {
        "items": [{"id": "list_123", "title": "DHBW Homework & Tasks"}]
    }

    # Mock insert task
    mock_tasks.insert.return_value.execute.return_value = {
        "id": "new_google_task_999",
        "title": "Study Test Task",
        "status": "needsAction",
        "due": "2026-10-15T00:00:00.000Z",
    }

    db = SessionLocal()
    try:
        from uuid import uuid4
        m = MeetingDB(
            id=f"meet_mock_{uuid4().hex[:8]}",
            title="Software Engineering Lecture 5",
        )
        db.add(m)
        db.commit()

        ai = ActionItemDB(
            meeting_id=m.id,
            task="Implement Singleton Pattern unit tests",
            priority="High",
            deadline="2026-10-15",
            completed=False,
        )
        db.add(ai)
        db.commit()

        # Patch credentials and google build
        with patch("app.services.google.tasks_sync.get_valid_google_credentials", return_value=MagicMock()), \
             patch("app.services.google.tasks_sync.build", return_value=mock_service):
            result = sync_action_items_to_google_tasks(db, m)
            
            assert result["created_count"] == 1, f"Expected 1 created task, got {result}"
            db.refresh(ai)
            assert ai.google_task_id == "new_google_task_999", f"Expected gtask id saved, got {ai.google_task_id}"

            # Verify that insert was called with valid RFC 3339 due date
            mock_tasks.insert.assert_called_once()
            call_kwargs = mock_tasks.insert.call_args[1]
            body = call_kwargs.get("body", {})
            assert body.get("due") == "2026-10-15T00:00:00.000Z", f"Expected RFC 3339 due date, got {body.get('due')}"
            print("  ✓ sync_action_items_to_google_tasks generated correct RFC 3339 due date & attached to task")

        # Clean up
        db.delete(ai)
        db.delete(m)
        db.commit()
    finally:
        db.close()


def test_status_toggle_and_pull():
    print("--> Testing update_google_task_status and pull_google_tasks_status...")
    mock_service = MagicMock()
    mock_tasks = MagicMock()
    mock_lists = MagicMock()
    mock_service.tasks.return_value = mock_tasks
    mock_service.tasklists.return_value = mock_lists
    mock_lists.list.return_value.execute.return_value = {
        "items": [{"id": "list_123", "title": "DHBW Homework & Tasks"}]
    }

    from uuid import uuid4
    db = SessionLocal()
    try:
        meeting = MeetingDB(
            id=f"meet_toggle_{uuid4().hex[:8]}",
            title="Toggle Test Meeting",
        )
        db.add(meeting)
        db.commit()

        ai = ActionItemDB(
            meeting_id=meeting.id,
            task="Toggle status verification",
            completed=False,
            google_task_id="gtask_toggle_777",
        )
        db.add(ai)
        db.commit()

        with patch("app.services.google.tasks_sync.get_valid_google_credentials", return_value=MagicMock()), \
             patch("app.services.google.tasks_sync.build", return_value=mock_service):
            # Test 1: update remote status when toggled to True
            mock_tasks.patch.return_value.execute.return_value = {"status": "completed"}
            update_google_task_status(db, ai.google_task_id, True)

            mock_tasks.patch.assert_called_once()
            patch_body = mock_tasks.patch.call_args[1].get("body", {})
            assert patch_body.get("status") == "completed", f"Expected 'completed', got {patch_body}"
            print("  ✓ update_google_task_status patched remote task to completed")

            # Test 2: pull tasks status from remote
            mock_tasks.list.return_value.execute.return_value = {
                "items": [
                    {"id": "gtask_toggle_777", "title": "Toggle status verification", "status": "completed"}
                ]
            }
            pull_result = pull_google_tasks_status(db)
            db.refresh(ai)
            assert ai.completed is True, "Expected action item completed flag updated to True by pull"
            assert pull_result["updated_count"] >= 1
            print("  ✓ pull_google_tasks_status pulled completed state into DB")

        db.delete(ai)
        db.delete(meeting)
        db.commit()
    finally:
        db.close()


def test_sync_jira_tasks_with_mock():
    print("--> Testing sync_jira_tasks_to_google_tasks with mock...")
    mock_service = MagicMock()
    mock_tasks = MagicMock()
    mock_lists = MagicMock()
    mock_service.tasks.return_value = mock_tasks
    mock_service.tasklists.return_value = mock_lists
    mock_lists.list.return_value.execute.return_value = {
        "items": [{"id": "jira_list_456", "title": "Jira Automation Tasks"}]
    }
    mock_tasks.insert.return_value.execute.return_value = {
        "id": "gtask_jira_999",
        "title": "[PROJ-101] Fix DB connection leak",
        "due": "2026-10-18T00:00:00.000Z",
    }

    db = SessionLocal()
    try:
        from uuid import uuid4
        proj = AutomationProjectDB(
            id=f"proj_{uuid4().hex[:8]}",
            name="Cloud Sync Engine",
            jira_project_key="CSE",
        )
        db.add(proj)
        db.commit()

        sprint = AutomationSprintDB(
            id=f"sprint_{uuid4().hex[:8]}",
            project_id=proj.id,
            name="Sprint 1",
            start_date=datetime(2026, 10, 10, 0, 0, 0),
            end_date=datetime(2026, 10, 24, 0, 0, 0),
        )
        db.add(sprint)
        db.commit()

        task = AutomationTaskDB(
            id=f"task_{uuid4().hex[:8]}",
            sprint_id=sprint.id,
            jira_issue_key="CSE-101",
            title="Implement Google Tasks sync pipeline",
            due_date=datetime(2026, 10, 18, 0, 0, 0),
            current_status="In Progress",
        )
        db.add(task)
        db.commit()

        with patch("app.services.google.tasks_sync.get_valid_google_credentials", return_value=MagicMock()), \
             patch("app.services.google.tasks_sync.build", return_value=mock_service):
            result = sync_jira_tasks_to_google_tasks(db, proj.id)
            assert result["created_count"] == 1
            db.refresh(task)
            assert task.google_task_id == "gtask_jira_999"

            mock_tasks.insert.assert_called_once()
            body = mock_tasks.insert.call_args[1].get("body", {})
            assert body.get("due") == "2026-10-18T00:00:00.000Z", f"Expected RFC 3339 due date for Jira task, got {body.get('due')}"
            print("  ✓ sync_jira_tasks_to_google_tasks created Google Task with scheduled due date")

        db.delete(task)
        db.delete(sprint)
        db.delete(proj)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    print("\n==================== RUNNING TASKS SYNC TEST SUITE ====================")
    try:
        test_rfc3339_date_parser()
        test_database_schema_fields()
        test_google_tasks_sync_with_mock()
        test_status_toggle_and_pull()
        test_sync_jira_tasks_with_mock()
        print("\n==================== ALL UNIT & ENGINE TESTS PASSED! ====================\n")
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
