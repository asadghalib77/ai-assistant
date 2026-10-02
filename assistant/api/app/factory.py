"""Application factory (tests build apps with their own settings)."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.core.body_limit import BodySizeLimit
from app.core.config import Settings, get_settings
from app.ml.registry import ModelRegistry
from app.photo_service import PhotoService
from app.routes import generate, health, models, photos, predict
from app.voice import VoiceSettings, mount_voice
from app.voice_brain import chat_brain

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")


def create_app(
    settings: Settings | None = None,
    registry: ModelRegistry | None = None,
    voice_settings: VoiceSettings | None = None,
) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if settings.torch_threads:
            torch.set_num_threads(settings.torch_threads)
        if settings.preload_models:
            app.state.registry.preload(settings.preload_models)
        try:
            yield
        finally:
            await app.state.photo_service.close()

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        description="Sentiment analysis with PyTorch and Hugging Face Transformers.",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.state.settings = settings
    app.state.registry = registry or ModelRegistry(settings)
    app.state.photo_service = PhotoService(settings)
    app.add_middleware(
        BodySizeLimit,
        max_bytes=settings.max_images_per_request * settings.max_image_bytes * 4 // 3 + 8 * 1024**2,
        paths=("/api/chat", "/api/predict/photos"),
    )

    app.add_middleware(
        BodySizeLimit,
        max_bytes=16 * 1024,
        paths=("/api/images/generate",),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    for router in (health.router, models.router, predict.router, photos.router, generate.router):
        app.include_router(router, prefix="/api")
    mount_voice(app, brain=chat_brain, settings=voice_settings)
    return app
