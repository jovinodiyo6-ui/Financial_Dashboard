import importlib.util
import io
import os
from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def backend_module(tmp_path_factory):
    db_file = tmp_path_factory.mktemp("db") / "test_api.sqlite"
    os.environ["FLASK_ENV"] = "development"
    os.environ["JWT_SECRET_KEY"] = "test-secret-key-with-32-plus-bytes-123456"
    os.environ["DATABASE_URL"] = f"sqlite:///{db_file.as_posix()}"

    module_path = Path(__file__).resolve().parents[1] / "Financial dashboard back end.py"
    spec = importlib.util.spec_from_file_location("backend_app", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def client(backend_module):
    app = backend_module.app
    db = backend_module.db

    with app.app_context():
        db.drop_all()
        db.create_all()

    return app.test_client()


def register_and_login(client, email="owner@example.com", password="secret123"):
    register_response = client.post(
        "/register",
        json={"org": "Acme", "email": email, "password": password},
    )
    assert register_response.status_code == 200

    login_response = client.post(
        "/login",
        json={"email": email, "password": password},
    )
    assert login_response.status_code == 200

    payload = login_response.get_json()
    assert "token" in payload
    return payload["token"]


def test_register_and_login_success(client):
    token = register_and_login(client)
    assert token


def test_register_duplicate_email_conflict(client):
    register_and_login(client)

    duplicate_response = client.post(
        "/register",
        json={"org": "Acme", "email": "owner@example.com", "password": "secret123"},
    )

    assert duplicate_response.status_code == 409
    assert duplicate_response.get_json()["error"] == "email already exists"


def test_analytics_requires_auth(client):
    response = client.get("/analytics")
    assert response.status_code == 401


def test_analyze_success_increments_usage(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    csv_bytes = io.BytesIO(b"type,amount\nrevenue,100\nexpense,40\n")
    response = client.post(
        "/analyze",
        headers=headers,
        data={"file": (csv_bytes, "sample.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["revenue"] == 100.0
    assert payload["expenses"] == 40.0

    analytics = client.get("/analytics", headers=headers)
    assert analytics.status_code == 200
    analytics_payload = analytics.get_json()
    assert analytics_payload["usage"] == 1
    assert analytics_payload["reports"] == 1


def test_analyze_invalid_csv_rejected(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    csv_bytes = io.BytesIO(b"category,value\nrevenue,100\n")
    response = client.post(
        "/analyze",
        headers=headers,
        data={"file": (csv_bytes, "bad.csv")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    assert "invalid csv" in response.get_json()["error"]
