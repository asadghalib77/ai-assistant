"""Host integration: shared chat stream, model policy and session access."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from ollama import ChatResponse, ResponseError

from app.core.config import Settings
from app.factory import create_app
from app.photo_schemas import PhotoModel
from app.voice import VoiceSettings
from tests.test_voice import ENABLED, parse_sse

LOCAL = PhotoModel(id="vision", vision=True, cloud=False)
TEXT = PhotoModel(id="text", vision=False, cloud=False)
CLOUD = PhotoModel(id="cloud", vision=True, cloud=True)


@pytest.fixture
def voice_client(monkeypatch):
    app = create_app(
        Settings(_env_file=None, preload_models=[]),
        voice_settings=VoiceSettings(_env_file=None, **ENABLED),
    )
    monkeypatch.setattr(
        app.state.photo_service, "models", AsyncMock(return_value=[CLOUD, LOCAL, TEXT])
    )

    async def stream(**kwargs):
        async def chunks():
            yield ChatResponse(message={"role": "assistant", "content": "Hello."}, done=False)
            yield ChatResponse(message={"role": "assistant", "content": ""}, done=True)

        return chunks()

    fake = AsyncMock(side_effect=stream)
    monkeypatch.setattr(app.state.photo_service.client, "chat", fake)
    with TestClient(app) as client:
        yield client, fake


def call_voice(client, **selection):
    room = client.post(
        "/api/voice/session",
        json={**selection, "history": [{"role": "user", "content": "Earlier typed question"}]},
    ).json()["room_name"]
    response = client.post(
        "/api/voice/chat",
        json={
            "room": room,
            "messages": [
                {"role": "system", "content": "Speak briefly."},
                {"role": "user", "content": "Hi"},
            ],
            "temperature": 0.3,
        },
    )
    assert response.status_code == 200
    return parse_sse(response.text)


@pytest.mark.parametrize("model", ["text", "cloud", None])
def test_voice_uses_chat_model_and_preserves_instructions(voice_client, model):
    client, fake = voice_client
    events = call_voice(client, provider="ollama", model=model)
    args = fake.call_args.kwargs
    assert args["model"] == (model or "vision")
    assert args["messages"][0] == {"role": "system", "content": "Speak briefly."}
    assert "Earlier typed question" in str(args["messages"])
    assert args["options"]["temperature"] == 0.3
    assert events[0][1]["local"] == (model != "cloud")
    assert events[-1] == ("done", {})
    assert "".join(data["delta"] for name, data in events if name == "message") == "Hello."


@pytest.mark.parametrize(
    "selection", [{"model": "missing"}, {"provider": "openai", "model": "cloud"}]
)
def test_bad_selection_does_not_fall_back_to_cloud(voice_client, selection):
    client, fake = voice_client
    events = call_voice(client, **selection)
    assert events[-1][0] == "error"
    fake.assert_not_called()


def test_auto_does_not_select_cloud_only(voice_client, monkeypatch):
    client, fake = voice_client
    monkeypatch.setattr(client.app.state.photo_service, "models", AsyncMock(return_value=[CLOUD]))
    assert call_voice(client)[-1][0] == "error"
    fake.assert_not_called()


def test_ollama_discovery_failure_is_visible(voice_client, monkeypatch):
    client, fake = voice_client
    monkeypatch.setattr(
        client.app.state.photo_service, "models", AsyncMock(side_effect=ConnectionError)
    )
    assert "Can't reach Ollama" in call_voice(client)[-1][1]["message"]
    fake.assert_not_called()


@pytest.mark.parametrize("failure", [ResponseError("gone", 404), ConnectionError()])
def test_ollama_stream_failure_is_visible(voice_client, failure):
    client, fake = voice_client
    fake.side_effect = failure
    assert call_voice(client)[-1][0] == "error"


def test_empty_reply_is_visible(voice_client):
    client, fake = voice_client

    async def empty(**kwargs):
        async def chunks():
            yield ChatResponse(message={"role": "assistant", "content": ""}, done=True)

        return chunks()

    fake.side_effect = empty
    assert "no answer" in call_voice(client)[-1][1]["message"]


def test_production_requires_login(voice_client):
    client, _ = voice_client
    client.app.state.settings.environment = "production"
    assert client.post("/api/voice/session", json={}).status_code == 401


def test_production_allows_authenticated_session():
    app = create_app(
        Settings(_env_file=None, preload_models=[], environment="production"),
        voice_settings=VoiceSettings(_env_file=None, **ENABLED),
    )

    @app.middleware("http")
    async def login(request, call_next):
        request.state.user = SimpleNamespace(id="test-user")
        return await call_next(request)

    with TestClient(app) as client:
        assert client.post("/api/voice/session", json={}).status_code == 201


def test_development_rejects_remote_anonymous_session():
    app = create_app(
        Settings(_env_file=None, preload_models=[]),
        voice_settings=VoiceSettings(_env_file=None, **ENABLED),
    )
    with TestClient(app, client=("192.0.2.1", 54321)) as client:
        assert client.post("/api/voice/session", json={}).status_code == 401
