"""Photo chat contracts, separate from the sentiment prediction API."""

from typing import Literal, Self

from pydantic import BaseModel, Field, PrivateAttr, model_validator

from app.images import ImageError, ImageMediaType, decode_image
from app.schemas import PredictResponse


class ImageInput(BaseModel):
    media_type: ImageMediaType
    data: str = Field(min_length=8, repr=False)
    _bytes: bytes = PrivateAttr(default=b"")

    @model_validator(mode="after")
    def decode(self) -> Self:
        try:
            raw, real_type = decode_image(self.data)
        except ImageError as exc:
            raise ValueError(str(exc)) from exc
        self.media_type, self._bytes, self.data = real_type, raw, ""
        return self

    @property
    def raw(self) -> bytes:
        return self._bytes

    @property
    def size(self) -> int:
        return len(self._bytes)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(default="", max_length=20_000)
    images: list[ImageInput] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def check_turn(self) -> Self:
        if self.images and self.role != "user":
            raise ValueError("Only user messages may include photos")
        if not self.content.strip() and not self.images:
            raise ValueError("A message needs text or a photo")
        return self


class PhotoChatRequest(BaseModel):
    model: str | None = Field(default=None, min_length=1, max_length=200)
    messages: list[ChatMessage] = Field(min_length=1, max_length=100)

    @model_validator(mode="before")
    @classmethod
    def count_images(cls, value: object) -> object:
        if isinstance(value, dict) and isinstance(value.get("messages"), list):
            count = sum(
                len(m["images"])
                for m in value["messages"]
                if isinstance(m, dict) and isinstance(m.get("images"), list)
            )
            if count > 100:
                raise ValueError("Up to 100 photos may be decoded in one request")
        return value

    @model_validator(mode="after")
    def last_turn(self) -> Self:
        if self.messages[-1].role != "user":
            raise ValueError("The last message must be from the user")
        return self


class PhotoModel(BaseModel):
    id: str
    vision: bool
    cloud: bool


class ImageLimits(BaseModel):
    per_message: int
    per_request: int
    max_bytes: int


class PhotoModelsResponse(BaseModel):
    models: list[PhotoModel]
    default_vision: str | None
    image_limits: ImageLimits


PhotoTask = Literal["extract_text", "describe", "question"]


class PhotoContextTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20_000)


class PhotoPredictRequest(BaseModel):
    images: list[ImageInput] = Field(min_length=1, max_length=10)
    text: str = Field(default="", max_length=100_000)
    model: str | None = Field(default=None, max_length=200)
    photo_model: str | None = Field(default=None, max_length=200)
    task: PhotoTask = "extract_text"
    context: list[PhotoContextTurn] = Field(default_factory=list, max_length=20)
    explain: bool = True

    @model_validator(mode="after")
    def require_question(self) -> Self:
        if self.task == "question" and not self.text.strip():
            raise ValueError("Enter a question about the photo")
        return self


class PhotoPredictResponse(PredictResponse):
    analyzed_text: str
    photo_text: str
    photo_model: str
    photo_task: PhotoTask
    photo_latency_ms: float
