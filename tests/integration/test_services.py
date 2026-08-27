"""
Integration test suite — microservices staging
[DEV TEAM OWNS] Add test functions here.

Run (from repo root):
  pytest tests/integration/ --base-url=https://your-staging-url -v --tb=short \
         --junit-xml=reports/integration-staging.xml

Requires:
  pip install pytest requests pytest-html
"""

import os
import pytest
import requests

BASE_URL = os.getenv("BASE_URL", "http://localhost:8080")


@pytest.fixture(scope="session")
def base():
    return BASE_URL.rstrip("/")


# ── Health endpoints (basic connectivity — DevOps wired these) ─────────────

class TestHealth:
    def test_gateway_health(self, base):
        r = requests.get(f"{base}/health", timeout=10)
        assert r.status_code == 200

    def test_bookings_health(self, base):
        r = requests.get(f"{base}/api/bookings/health", timeout=10)
        assert r.status_code == 200

    def test_users_health(self, base):
        r = requests.get(f"{base}/api/users/health", timeout=10)
        assert r.status_code == 200

    def test_search_health(self, base):
        r = requests.get(f"{base}/api/search/health", timeout=10)
        assert r.status_code == 200


# ── Bookings service ────────────────────────────────────────────────────────
# TODO (dev team): implement these stubs

class TestBookings:
    def test_list_returns_bookings_key(self, base):
        r = requests.get(f"{base}/api/bookings", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "bookings" in data, "Response must contain 'bookings' key"

    @pytest.mark.skip(reason="TODO: implement booking creation flow")
    def test_create_booking(self, base):
        payload = {
            "user_id": "test-user-001",
            "item_id": "test-item-001",
            "date": "2025-12-01",
        }
        r = requests.post(f"{base}/api/bookings", json=payload, timeout=10)
        assert r.status_code in (200, 201)
        data = r.json()
        assert "id" in data

    @pytest.mark.skip(reason="TODO: implement booking retrieval")
    def test_get_booking_by_id(self, base):
        booking_id = "known-test-id"  # replace with a seeded fixture
        r = requests.get(f"{base}/api/bookings/{booking_id}", timeout=10)
        assert r.status_code == 200


# ── Search service ──────────────────────────────────────────────────────────

class TestSearch:
    def test_search_returns_results(self, base):
        r = requests.get(f"{base}/api/search?q=test", timeout=10)
        assert r.status_code == 200

    @pytest.mark.skip(reason="TODO: assert search response shape")
    def test_search_response_shape(self, base):
        r = requests.get(f"{base}/api/search?q=hotel", timeout=10)
        data = r.json()
        assert "results" in data
        assert isinstance(data["results"], list)

    @pytest.mark.skip(reason="TODO: assert empty query behaviour")
    def test_search_empty_query(self, base):
        r = requests.get(f"{base}/api/search?q=", timeout=10)
        assert r.status_code in (200, 400)


# ── User service ────────────────────────────────────────────────────────────

class TestUsers:
    @pytest.mark.skip(reason="TODO: requires auth token fixture")
    def test_get_current_user(self, base):
        headers = {"Authorization": "Bearer <token>"}
        r = requests.get(f"{base}/api/users/me", headers=headers, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "id" in data and "email" in data

    @pytest.mark.skip(reason="TODO: implement registration flow")
    def test_register_user(self, base):
        payload = {
            "email": "integration-test@example.com",
            "password": "Test1234!",
        }
        r = requests.post(f"{base}/api/users/register", json=payload, timeout=10)
        assert r.status_code in (200, 201)


# ── Cross-service flows ─────────────────────────────────────────────────────

class TestCrossService:
    @pytest.mark.skip(reason="TODO: implement search-to-book flow")
    def test_search_then_book(self, base):
        """User searches for an item, then books it."""
        search_r = requests.get(f"{base}/api/search?q=hotel", timeout=10)
        assert search_r.status_code == 200
        item_id = search_r.json()["results"][0]["id"]

        booking_r = requests.post(
            f"{base}/api/bookings",
            json={"item_id": item_id, "user_id": "test-user-001", "date": "2025-12-01"},
            timeout=10,
        )
        assert booking_r.status_code in (200, 201)