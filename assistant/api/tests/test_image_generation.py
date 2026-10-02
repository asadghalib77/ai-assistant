"""Cloudflare contract checks without network calls or model downloads."""

import base64

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.deps import get_app_settings
from app.routes import generate


def make_client(configured=True):
    app = FastAPI()
    settings = Settings(
        _env_file=None,
        preload_models=[],
        cloudflare_account_id="a" * 32 if configured else "",
        cloudflare_api_token="test-token" if configured else "",
    )
    app.dependency_overrides[get_app_settings] = lambda: settings
    app.include_router(generate.router, prefix="/api")
    return TestClient(app)


def mock_provider(monkeypatch, handler):
    client_type = httpx.AsyncClient
    monkeypatch.setattr(
        generate.httpx,
        "AsyncClient",
        lambda **kwargs: client_type(transport=httpx.MockTransport(handler), **kwargs),
    )


def test_generation_contract(monkeypatch):
    image = base64.b64encode(b"\xff\xd8\xfftest-image").decode()

    def handler(request):
        assert request.headers["Authorization"] == "Bearer test-token"
        assert str(request.url).endswith("/ai/run/" + generate.MODEL)
        assert b'"steps":4' in request.content
        return httpx.Response(200, json={"success": True, "result": {"image": image}})

    mock_provider(monkeypatch, handler)
    with make_client() as client:
        config = client.get("/api/images/config").json()
        assert config["configured"] is True
        assert "test-token" not in str(config)
        response = client.post("/api/images/generate", json={"prompt": " A lake "})
        assert response.status_code == 200
        assert response.json()["image"] == "data:image/jpeg;base64," + image
        assert response.json()["prompt"] == "A lake"
        assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(("status", "expected"), [(401, 503), (403, 503), (429, 429), (500, 502)])
def test_provider_errors(monkeypatch, status, expected):
    mock_provider(monkeypatch, lambda request: httpx.Response(status))
    with make_client() as client:
        response = client.post("/api/images/generate", json={"prompt": "A lake"})
        assert response.status_code == expected
        assert "test-token" not in response.text


@pytest.mark.parametrize("payload", [{}, [], {"result": {"image": "invalid"}}])
def test_invalid_provider_response(monkeypatch, payload):
    mock_provider(monkeypatch, lambda request: httpx.Response(200, json=payload))
    with make_client() as client:
        assert client.post("/api/images/generate", json={"prompt": "lake"}).status_code == 502


def test_configuration_and_validation():
    with make_client(False) as client:
        assert client.get("/api/images/config").json()["configured"] is False
        assert client.post("/api/images/generate", json={"prompt": "lake"}).status_code == 503
        for prompt in ("", "  ", "a" * 2049):
            assert client.post("/api/images/generate", json={"prompt": prompt}).status_code == 422


def test_provider_timeout(monkeypatch):
    def handler(request):
        raise httpx.ReadTimeout("timeout", request=request)

    mock_provider(monkeypatch, handler)
    with make_client() as client:
        assert client.post("/api/images/generate", json={"prompt": "lake"}).status_code == 504


def test_response_size_limit(monkeypatch):
    monkeypatch.setattr(generate, "MAX_RESPONSE_BYTES", 8)
    mock_provider(monkeypatch, lambda request: httpx.Response(200, content=b"x" * 9))
    with make_client() as client:
        assert client.post("/api/images/generate", json={"prompt": "lake"}).status_code == 502
