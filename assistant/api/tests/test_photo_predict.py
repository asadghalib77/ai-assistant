from unittest.mock import AsyncMock

import pytest
from ollama import ChatResponse, ResponseError

from tests.test_photo_chat import CLOUD, IMAGE, LOCAL, PNG, TEXT


def configure(client, monkeypatch, answer="The product is wonderful.", models=None, reason="stop"):
    svc = client.app.state.photo_service
    monkeypatch.setattr(svc, "models", AsyncMock(return_value=models or [CLOUD, LOCAL, TEXT]))
    fake = AsyncMock(
        return_value=ChatResponse(
            message={"role": "assistant", "content": answer}, done=True, done_reason=reason
        )
    )
    monkeypatch.setattr(svc.client, "chat", fake)
    return fake


@pytest.mark.parametrize("task", ["extract_text", "describe", "question"])
def test_photo_is_scored_by_existing_sentiment_classifier(client, monkeypatch, task):
    fake = configure(client, monkeypatch)
    response = client.post(
        "/api/predict/photos", json={"images": [IMAGE], "task": task, "text": "Extra context"}
    )
    assert response.status_code == 200
    body = response.json()
    expected = (
        "The product is wonderful."
        if task == "question"
        else "Extra context\n\nThe product is wonderful."
    )
    assert body["analyzed_text"] == expected
    assert body["photo_text"] == "The product is wonderful."
    assert body["photo_model"] == LOCAL.id
    assert body["photo_task"] == task
    assert body["photo_latency_ms"] >= 0
    ordinary = client.post("/api/predict", json={"text": expected}).json()
    for key in ("label", "probs", "attributions", "model", "tokens"):
        assert body[key] == ordinary[key]
    assert fake.call_args.kwargs["messages"][-1]["images"] == [PNG]
    assert fake.call_args.kwargs["stream"] is False


def test_question_uses_followup_context(client, monkeypatch):
    fake = configure(client, monkeypatch)
    context = [
        {"role": "user", "content": "What is shown?"},
        {"role": "assistant", "content": "A product."},
    ]
    response = client.post(
        "/api/predict/photos",
        json={
            "images": [IMAGE],
            "task": "question",
            "text": "Is it damaged?",
            "context": context,
            "photo_model": CLOUD.id,
        },
    )
    assert response.status_code == 200
    assert fake.call_args.kwargs["model"] == CLOUD.id
    assert fake.call_args.kwargs["messages"][1:3] == context
    assert "Is it damaged?" not in response.json()["analyzed_text"]


@pytest.mark.parametrize(
    "payload",
    [
        {"images": []},
        {"images": [IMAGE], "task": "question", "text": " "},
        {"images": [IMAGE], "task": "unknown"},
        {"images": [{"media_type": "image/png", "data": "/etc/passwd"}]},
    ],
)
def test_invalid_photo_request(client, payload):
    assert client.post("/api/predict/photos", json=payload).status_code == 422


def test_no_text_is_actionable(client, monkeypatch):
    configure(client, monkeypatch, answer="[NO_TEXT]")
    response = client.post("/api/predict/photos", json={"images": [IMAGE]})
    assert response.status_code == 422
    assert "Describe photo" in response.json()["detail"]


@pytest.mark.parametrize("model", [None, TEXT.id, "missing"])
def test_local_preference_and_vision_routing(client, monkeypatch, model):
    fake = configure(client, monkeypatch, models=[CLOUD, TEXT])
    response = client.post("/api/predict/photos", json={"images": [IMAGE], "photo_model": model})
    assert response.status_code in (422, 404)
    fake.assert_not_called()


def test_unknown_sentiment_model_rejected_before_photo_sent(client, monkeypatch):
    fake = configure(client, monkeypatch)
    response = client.post("/api/predict/photos", json={"images": [IMAGE], "model": "missing"})
    assert response.status_code == 404
    fake.assert_not_called()


def test_photo_count_limit(client):
    assert client.post("/api/predict/photos", json={"images": [IMAGE] * 6}).status_code == 422


def test_photo_body_size_limit(client):
    assert (
        client.post(
            "/api/predict/photos", content="{}", headers={"Content-Length": str(1024**3)}
        ).status_code
        == 413
    )


def test_combined_text_limit(client, monkeypatch):
    configure(client, monkeypatch, answer="a" * 5000)
    response = client.post("/api/predict/photos", json={"images": [IMAGE], "text": "Extra"})
    assert response.status_code == 422
    assert "character limit" in response.json()["detail"]


@pytest.mark.parametrize(("answer", "reason"), [("", "stop"), ("partial", "length")])
def test_empty_and_incomplete_replies_are_not_scored(client, monkeypatch, answer, reason):
    configure(client, monkeypatch, answer=answer, reason=reason)
    assert client.post("/api/predict/photos", json={"images": [IMAGE]}).status_code == 503


def test_signin_error(client, monkeypatch):
    fake = configure(client, monkeypatch)
    fake.side_effect = ResponseError("secret", 401)
    response = client.post("/api/predict/photos", json={"images": [IMAGE], "photo_model": CLOUD.id})
    assert response.status_code == 503
    assert "signin" in response.json()["detail"]
    assert "secret" not in response.json()["detail"]


def test_sentiment_model_can_be_selected_for_photo(client, monkeypatch):
    configure(client, monkeypatch)
    model = "nlptown/bert-base-multilingual-uncased-sentiment"
    response = client.post(
        "/api/predict/photos", json={"images": [IMAGE], "model": model, "explain": False}
    ).json()
    assert response["model"] == model
    assert len(response["probs"]) == 5
    assert response["attributions"] is None
