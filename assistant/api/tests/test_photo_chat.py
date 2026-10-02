import asyncio
import base64
import json
from unittest.mock import AsyncMock

import pytest
from ollama import ChatResponse, ListResponse, ResponseError, ShowResponse
from pydantic import ValidationError

from app.core.body_limit import BodySizeLimit
from app.images import ImageError, decode_image
from app.photo_schemas import ChatMessage, ImageInput, PhotoChatRequest, PhotoModel
from app.photo_service import to_ollama_messages

PNG = b"\x89PNG\r\n\x1a\n" + b"sample"
IMAGE = {"media_type": "image/jpeg", "data": base64.b64encode(PNG).decode()}
LOCAL = PhotoModel(id="local-vision", vision=True, cloud=False)
CLOUD = PhotoModel(id="gemma4:31b-cloud", vision=True, cloud=True)
TEXT = PhotoModel(id="gemma3:1b", vision=False, cloud=False)


def turn(images=None, content="Describe this photo"):
    return {"role": "user", "content": content, "images": images or []}


def configure(client, monkeypatch, models=None):
    svc = client.app.state.photo_service
    monkeypatch.setattr(svc, "models", AsyncMock(return_value=models or [CLOUD, LOCAL, TEXT]))

    async def stream(**_kwargs):
        async def chunks():
            yield ChatResponse(message={"role": "assistant", "content": "A photo."}, done=False)
            yield ChatResponse(message={"role": "assistant", "content": ""}, done=True)

        return chunks()

    fake = AsyncMock(side_effect=stream)
    monkeypatch.setattr(svc.client, "chat", fake)
    return fake


@pytest.mark.parametrize("data", ["/etc/passwd", "C:/Windows/win.ini", "!!!bad!!!"])
def test_rejects_paths_and_bad_base64(data):
    with pytest.raises(ImageError):
        decode_image(data)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (PNG, "image/png"),
        (b"\xff\xd8\xfftest", "image/jpeg"),
        (b"GIF89atest", "image/gif"),
        (b"RIFF1234WEBPtest", "image/webp"),
    ],
)
def test_sniffs_actual_bytes(raw, expected):
    image = ImageInput(media_type="image/jpeg", data=base64.b64encode(raw).decode())
    assert image.media_type == expected
    assert image.raw == raw
    assert image.data == ""


def test_data_url():
    assert decode_image("data:image/jpeg;base64," + IMAGE["data"]) == (PNG, "image/png")


def test_ollama_receives_bytes_not_paths():
    messages = to_ollama_messages([ChatMessage.model_validate(turn([IMAGE]))])
    assert messages[0]["images"] == [PNG]
    assert isinstance(messages[0]["images"][0], bytes)


def test_images_counted_before_decoding():
    with pytest.raises(ValidationError, match="Up to 100"):
        PhotoChatRequest.model_validate({"messages": [turn([{}] * 101)]})


@pytest.mark.parametrize(
    "payload",
    [
        {"messages": [{"role": "assistant", "content": "test", "images": [IMAGE]}]},
        {"messages": [turn(content="")]},
        {"messages": [{"role": "assistant", "content": "test"}]},
    ],
)
def test_invalid_turns(client, payload):
    assert client.post("/api/chat", json=payload).status_code == 422


def test_model_discovery_local_default(client, monkeypatch):
    configure(client, monkeypatch)
    result = client.get("/api/photo-models").json()
    assert result["default_vision"] == LOCAL.id
    assert result["image_limits"]["per_message"] == 5
    assert result["models"][0]["cloud"] is True


def test_auto_never_falls_back_to_cloud(client, monkeypatch):
    fake = configure(client, monkeypatch, [CLOUD, TEXT])
    response = client.post("/api/chat", json={"messages": [turn([IMAGE])]})
    assert response.status_code == 422
    assert "No local vision" in response.json()["detail"]
    fake.assert_not_called()


@pytest.mark.parametrize("model", [None, CLOUD.id])
def test_stream_with_images(client, monkeypatch, model):
    fake = configure(client, monkeypatch)
    response = client.post("/api/chat", json={"model": model, "messages": [turn([IMAGE], "")]})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = [json.loads(e[6:]) for e in response.text.strip().split("\n\n")]
    assert [e["type"] for e in events] == ["model", "token", "done"]
    assert fake.call_args.kwargs["model"] == (model or LOCAL.id)
    assert fake.call_args.kwargs["messages"][0]["images"] == [PNG]


def test_text_only_model_rejected_before_inference(client, monkeypatch):
    fake = configure(client, monkeypatch)
    response = client.post("/api/chat", json={"model": TEXT.id, "messages": [turn([IMAGE])]})
    assert response.status_code == 422
    assert "can't see images" in response.json()["detail"]
    fake.assert_not_called()


def test_text_only_chat_allowed(client, monkeypatch):
    fake = configure(client, monkeypatch)
    response = client.post("/api/chat", json={"model": TEXT.id, "messages": [turn()]})
    assert response.status_code == 200
    assert fake.call_args.kwargs["messages"][0]["images"] == []


def test_unknown_model(client, monkeypatch):
    configure(client, monkeypatch)
    assert (
        client.post("/api/chat", json={"model": "missing", "messages": [turn()]}).status_code == 404
    )


def test_per_message_limit(client):
    response = client.post("/api/chat", json={"messages": [turn([IMAGE] * 6)]})
    assert response.status_code == 422
    assert "5 photos per message" in response.json()["detail"]


def test_per_request_limit(client):
    response = client.post("/api/chat", json={"messages": [turn([IMAGE] * 5)] * 5})
    assert response.status_code == 422
    assert "20 photos" in response.json()["detail"]


def test_byte_limit(client):
    client.app.state.settings.max_image_bytes = 10
    response = client.post("/api/chat", json={"messages": [turn([IMAGE])]})
    assert response.status_code == 422
    assert "exceeds" in response.json()["detail"]


def test_body_size_limit(client):
    response = client.post("/api/chat", content="{}", headers={"Content-Length": str(1024**3)})
    assert response.status_code == 413


def test_chunked_body_size_limit():
    received = []
    pieces = iter([b"12345", b"67890"])

    async def receive():
        return {"type": "http.request", "body": next(pieces), "more_body": True}

    async def send(message):
        received.append(message)

    async def app(_scope, recv, _send):
        await recv()
        assert (await recv())["type"] == "http.disconnect"

    asyncio.run(
        BodySizeLimit(app, 8, ("/api/chat",))(
            {"type": "http", "path": "/api/chat", "headers": []},
            receive,
            send,
        )
    )
    assert received[0]["status"] == 413


@pytest.mark.parametrize(
    ("status", "word"),
    [
        (401, "sign-in"),
        (403, "sign-in"),
        (404, "installed"),
        (429, "usage limit"),
        (500, "could not answer"),
    ],
)
def test_provider_errors_are_visible(client, monkeypatch, status, word):
    configure(client, monkeypatch)
    monkeypatch.setattr(
        client.app.state.photo_service.client,
        "chat",
        AsyncMock(side_effect=ResponseError("private", status)),
    )
    response = client.post("/api/chat", json={"model": CLOUD.id, "messages": [turn([IMAGE])]})
    assert '"type": "error"' in response.text
    assert word in response.text
    assert "private" not in response.text


def test_ollama_offline(client, monkeypatch):
    monkeypatch.setattr(
        client.app.state.photo_service, "models", AsyncMock(side_effect=ConnectionError())
    )
    assert client.get("/api/photo-models").status_code == 503
    assert client.post("/api/chat", json={"messages": [turn()]}).status_code == 503


def test_discovery_uses_capabilities_and_digest_cache(client, monkeypatch):
    svc = client.app.state.photo_service
    listing = ListResponse(
        models=[
            {"model": "gemma4:31b-cloud", "digest": "one"},
            {"model": "gemma3:1b", "digest": "two"},
        ]
    )
    monkeypatch.setattr(svc.client, "list", AsyncMock(return_value=listing))
    show = AsyncMock(
        side_effect=[
            ShowResponse(model_info={}, capabilities=["vision"], details={"format": ""}),
            ShowResponse(model_info={}, capabilities=["completion"], details={"format": "gguf"}),
        ]
    )
    monkeypatch.setattr(svc.client, "show", show)
    response = client.get("/api/photo-models").json()
    assert response["default_vision"] is None
    assert response["models"] == [TEXT.model_dump(), CLOUD.model_dump()]
    client.get("/api/photo-models")
    assert show.call_count == 2
    listing.models[1].digest = "changed"
    show.side_effect = [
        ShowResponse(model_info={}, capabilities=["vision"], details={"format": "gguf"})
    ]
    assert client.get("/api/photo-models").json()["default_vision"] == TEXT.id
    assert show.call_count == 3


def test_cloud_alias_is_not_a_local_default(client, monkeypatch):
    svc = client.app.state.photo_service
    monkeypatch.setattr(
        svc.client, "list", AsyncMock(return_value=ListResponse(models=[{"model": "alias"}]))
    )
    monkeypatch.setattr(
        svc.client,
        "show",
        AsyncMock(
            return_value=ShowResponse(
                model_info={}, capabilities=["vision"], details={"format": ""}
            )
        ),
    )
    response = client.get("/api/photo-models").json()
    assert response["default_vision"] is None
    assert response["models"][0]["cloud"] is True
