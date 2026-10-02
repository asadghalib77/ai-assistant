import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.deps import RegistryDep, SettingsDep
from app.photo_schemas import (
    ImageLimits,
    PhotoChatRequest,
    PhotoModelsResponse,
    PhotoPredictRequest,
    PhotoPredictResponse,
)
from app.photo_service import PhotoService
from app.routes.predict import predict
from app.schemas import PredictRequest

router = APIRouter(tags=["photo chat"])


def service(request: Request) -> PhotoService:
    return request.app.state.photo_service


async def select_photo_model(request: Request, model: str | None):
    try:
        available = await service(request).models()
    except Exception as exc:
        raise HTTPException(
            503, "Can't reach Ollama. Start Ollama and refresh the model list."
        ) from exc
    if model:
        chosen = next((m for m in available if m.id == model), None)
        if chosen is None:
            raise HTTPException(404, "This photo model isn't installed. Refresh the model list.")
    else:
        chosen = next((m for m in available if m.vision and not m.cloud), None)
        if chosen is None:
            raise HTTPException(
                422,
                "No local vision model is available. Run ollama pull gemma3:4b, "
                "or explicitly choose an Ollama Cloud vision model.",
            )
    if not chosen.vision:
        raise HTTPException(422, f"{chosen.id} can't see images. Switch to a vision model.")
    return chosen


@router.post("/predict/photos", response_model=PhotoPredictResponse)
async def predict_photos(
    payload: PhotoPredictRequest, request: Request, settings: SettingsDep, registry: RegistryDep
) -> PhotoPredictResponse:
    photo_limit = min(settings.max_images_per_message, settings.max_images_per_request)
    if len(payload.images) > photo_limit:
        raise HTTPException(
            422,
            f"Up to {photo_limit} photos per analysis",
        )
    if any(image.size > settings.max_image_bytes for image in payload.images):
        raise HTTPException(422, "A photo exceeds the configured image size limit")
    if len(payload.text) > settings.max_text_chars:
        raise HTTPException(422, "The text exceeds the configured character limit")
    if payload.model is not None and payload.model not in registry.settings.enabled_models:
        raise HTTPException(404, "This sentiment model is not enabled")
    chosen = await select_photo_model(request, payload.photo_model)
    started = time.perf_counter()
    try:
        photo_text = await service(request).analyze_photo(chosen.id, payload)
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    if payload.task == "extract_text" and photo_text.upper() == "[NO_TEXT]":
        raise HTTPException(
            422,
            "No readable text was found. Choose Describe photo to analyze a description instead.",
        )
    # Questions are instructions, not part of the text whose sentiment is scored.
    text = (
        photo_text
        if payload.task == "question"
        else "\n\n".join(part for part in (payload.text.strip(), photo_text) if part)
    )
    if len(text) > settings.max_text_chars:
        raise HTTPException(
            422,
            "The photo text exceeds the character limit. "
            "Use fewer photos or a smaller text region.",
        )
    photo_latency = round((time.perf_counter() - started) * 1000, 1)
    result = await run_in_threadpool(
        predict,
        PredictRequest(text=text, model=payload.model, explain=payload.explain),
        registry,
        settings,
    )
    return PhotoPredictResponse(
        **result.model_dump(),
        analyzed_text=text,
        photo_text=photo_text,
        photo_model=chosen.id,
        photo_task=payload.task,
        photo_latency_ms=photo_latency,
    )


@router.get("/photo-models", response_model=PhotoModelsResponse)
async def models(request: Request, settings: SettingsDep) -> PhotoModelsResponse:
    try:
        available = await service(request).models()
    except Exception as exc:
        raise HTTPException(
            503, "Can't reach Ollama. Start Ollama and refresh the model list."
        ) from exc
    return PhotoModelsResponse(
        models=available,
        default_vision=next((m.id for m in available if m.vision and not m.cloud), None),
        image_limits=ImageLimits(
            per_message=settings.max_images_per_message,
            per_request=settings.max_images_per_request,
            max_bytes=settings.max_image_bytes,
        ),
    )


@router.post("/chat")
async def chat(
    payload: PhotoChatRequest, request: Request, settings: SettingsDep
) -> StreamingResponse:
    total = 0
    for message in payload.messages:
        total += len(message.images)
        if len(message.images) > settings.max_images_per_message:
            raise HTTPException(422, f"Up to {settings.max_images_per_message} photos per message")
        if any(i.size > settings.max_image_bytes for i in message.images):
            raise HTTPException(
                422, f"A photo exceeds the {settings.max_image_bytes // 1024**2} MB limit"
            )
    if total > settings.max_images_per_request:
        raise HTTPException(
            422, f"Up to {settings.max_images_per_request} photos per conversation request"
        )
    try:
        available = await service(request).models()
    except Exception as exc:
        raise HTTPException(
            503, "Can't reach Ollama. Start Ollama and refresh the model list."
        ) from exc
    if payload.model:
        chosen = next((m for m in available if m.id == payload.model), None)
        if chosen is None:
            raise HTTPException(404, "This model isn't installed. Refresh the model list.")
    else:
        chosen = next((m for m in available if m.vision and not m.cloud), None)
        if chosen is None:
            raise HTTPException(
                422,
                "No local vision model is available. Run ollama pull gemma3:4b, "
                "or explicitly choose an Ollama Cloud vision model.",
            )
    if total and not chosen.vision:
        raise HTTPException(422, f"{chosen.id} can't see images. Switch to a vision model.")
    return StreamingResponse(
        service(request).stream(chosen.id, payload.messages),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
