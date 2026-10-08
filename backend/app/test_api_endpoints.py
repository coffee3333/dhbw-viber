import sys
import requests

BASE_URL = "http://localhost:8000/api/v1"


def test_api_endpoints():
    print("\n==================== RUNNING LIVE HTTP API TEST SUITE ====================")
    session = requests.Session()

    # 0. Test unauthenticated auth status
    print("--> 0. Testing GET /auth/status (unauthenticated)...")
    r = session.get(f"{BASE_URL}/auth/status")
    assert r.status_code == 200
    assert r.json()["auth_required"] is True
    assert r.json()["authenticated"] is False
    print("  ✓ Unauthenticated /auth/status correctly returned auth_required=True, authenticated=False")

    # 1. Login with admin credentials
    print("--> 1. Testing POST /auth/login...")
    r = session.post(
        f"{BASE_URL}/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json()["token"]
    session.headers.update({"Authorization": f"Bearer {token}"})
    print(f"  ✓ Logged in successfully as {r.json()['user']['display_name']}")

    # 2. Test authenticated status
    print("--> 2. Testing GET /auth/status (authenticated)...")
    r = session.get(f"{BASE_URL}/auth/status")
    assert r.status_code == 200
    assert r.json()["authenticated"] is True
    print("  ✓ Authenticated /auth/status returned authenticated=True")

    # 3. Test google status endpoint
    print("--> 3. Testing GET /google/status...")
    r = session.get(f"{BASE_URL}/google/status")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    status_data = r.json()
    assert "connected" in status_data
    assert "auto_sync_tasks" in status_data
    print(f"  ✓ GET /google/status returned 200: connected={status_data['connected']}")

    # 4. Test list action items
    print("--> 4. Testing GET /google/action-items...")
    r = session.get(f"{BASE_URL}/google/action-items")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    items = r.json()
    assert isinstance(items, list)
    print(f"  ✓ GET /google/action-items returned 200 with {len(items)} items")

    # 5. Test create action item
    print("--> 5. Testing POST /google/action-items (Create custom homework)...")
    payload = {
        "task": "Test Homework: Solve Differential Equations Exercise 4",
        "priority": "High",
        "due_date": "2026-10-22T00:00:00.000Z",
        "deadline": "2026-10-22",
        "subject_name": "Mathematik II",
    }
    r = session.post(f"{BASE_URL}/google/action-items", json=payload)
    assert r.status_code in (200, 201), f"Expected 200/201, got {r.status_code}: {r.text}"
    created = r.json()
    assert "id" in created
    assert created["task"] == payload["task"]
    assert created["priority"] == "High"
    assert created["due_date"] is not None
    created_id = created["id"]
    print(f"  ✓ POST /google/action-items created task id={created_id} with due_date={created['due_date']}")

    # 6. Test toggle action item to True
    print(f"--> 6. Testing POST /google/action-items/{created_id}/toggle (to completed)...")
    r = session.post(f"{BASE_URL}/google/action-items/{created_id}/toggle")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    toggle_data = r.json()
    assert toggle_data["completed"] is True
    print(f"  ✓ Task {created_id} marked as completed=True")

    # 7. Test toggle action item back to False
    print(f"--> 7. Testing POST /google/action-items/{created_id}/toggle (back to active)...")
    r = session.post(f"{BASE_URL}/google/action-items/{created_id}/toggle")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    toggle_data = r.json()
    assert toggle_data["completed"] is False
    print(f"  ✓ Task {created_id} marked as completed=False")

    # 8. Test delete action item
    print(f"--> 8. Testing DELETE /google/action-items/{created_id}...")
    r = session.delete(f"{BASE_URL}/google/action-items/{created_id}")
    assert r.status_code in (200, 204), f"Expected 200/204, got {r.status_code}: {r.text}"
    print(f"  ✓ Task {created_id} successfully deleted")

    # Verify deleted
    r = session.get(f"{BASE_URL}/google/action-items")
    assert not any(item["id"] == created_id for item in r.json())
    print(f"  ✓ Verified task {created_id} is no longer in action-items list")

    print("\n==================== ALL LIVE HTTP API TESTS PASSED! ====================\n")


if __name__ == "__main__":
    try:
        test_api_endpoints()
    except Exception as e:
        print(f"\n❌ API TEST FAILED: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
