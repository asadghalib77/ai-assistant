"""Adapt the existing Ollama chat pipeline to LiveKit's brain contract."""

import json
from collections.abc import AsyncIterator

from fastapi import Request

from app.voice import BrainRequest


async def chat_brain(request: Request, req: BrainRequest) -> AsyncIterator[tuple[str, dict]]:
    service = request.app.state.photo_service
    if req.provider not in (None, "ollama"):
        yield "error", {"message": "This app supports Ollama chat models."}
        return
    try:
        models = await service.models()
    except Exception:
        yield "error", {"message": "Can't reach Ollama. Start Ollama and try again."}
        return
    chosen = next(
        (m for m in models if m.id == req.model)
        if req.model
        else (m for m in models if m.vision and not m.cloud),
        None,
    )
    if chosen is None:
        yield (
            "error",
            {"message": "The selected chat model is unavailable. Refresh the model list."},
        )
        return
    yield (
        "meta",
        {
            "provider": "ollama",
            "provider_label": "Ollama",
            "model": chosen.id,
            "local": not chosen.cloud,
            "fallback": False,
            "notice": None,
        },
    )
    # Shared streaming/error handling, with the agent's system instructions preserved.
    async for raw in service.stream_messages(chosen.id, req.messages, temperature=req.temperature):
        data = json.loads(raw.removeprefix("data: ").strip())
        if data["type"] == "token":
            yield "delta", {"delta": data["content"]}
        elif data["type"] == "error":
            yield "error", {"message": data["message"]}
        elif data["type"] == "done":
            yield "done", {}
