"""Text-to-image through Cloudflare Workers AI; credentials never leave the API."""

import base64
import binascii
import json

import httpx
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from app.deps import SettingsDep

router = APIRouter(tags=["image generation"])
MODEL = "@cf/black-forest-labs/flux-1-schnell"
MAX_RESPONSE_BYTES = 16 * 1024 * 1024


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2048)


@router.get("/images/config")
def image_config(settings: SettingsDep) -> dict:
    return {
        "configured": bool(
            settings.cloudflare_account_id and settings.cloudflare_api_token.get_secret_value()
        ),
        "model": MODEL,
    }


@router.post("/images/generate")
async def generate_image(body: GenerateRequest, settings: SettingsDep, response: Response) -> dict:
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(422, "Describe the image you want to generate.")
    token = settings.cloudflare_api_token.get_secret_value()
    account = settings.cloudflare_account_id
    if not account or not token:
        raise HTTPException(503, "Image generation needs Cloudflare credentials in api/.env.")
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{MODEL}"
    try:
        async with (
            httpx.AsyncClient(timeout=120) as client,
            client.stream(
                "POST",
                url,
                headers={"Authorization": f"Bearer {token}"},
                json={"prompt": prompt, "steps": 4},
            ) as upstream,
        ):
            if upstream.status_code in (401, 403):
                raise HTTPException(
                    503, "Cloudflare token needs Workers AI access for this account."
                )
            if upstream.status_code == 429:
                raise HTTPException(
                    429, "Cloudflare's usage or rate limit was reached. Try again later."
                )
            if not upstream.is_success:
                raise HTTPException(
                    502, "Cloudflare could not generate this image. Try again later."
                )
            chunks = bytearray()
            async for chunk in upstream.aiter_bytes():
                chunks.extend(chunk)
                if len(chunks) > MAX_RESPONSE_BYTES:
                    raise HTTPException(502, "Cloudflare returned an image that is too large.")
        payload = json.loads(chunks)
        if not isinstance(payload, dict) or payload.get("success") is False:
            raise ValueError("Provider rejected generation")
        image = payload["result"]["image"]
        raw = base64.b64decode(image, validate=True)
        if raw.startswith(b"\xff\xd8\xff"):
            media_type = "image/jpeg"
        elif raw.startswith(b"\x89PNG\r\n\x1a\n"):
            media_type = "image/png"
        else:
            raise ValueError("Unsupported image")
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "Image generation timed out. Please try again.") from exc
    except httpx.RequestError as exc:
        raise HTTPException(502, "Cannot reach Cloudflare. Please try again.") from exc
    except (KeyError, TypeError, ValueError, binascii.Error) as exc:
        raise HTTPException(502, "Cloudflare returned an invalid image response.") from exc
    response.headers["Cache-Control"] = "no-store"
    return {"image": f"data:{media_type};base64,{image}", "model": MODEL, "prompt": prompt}
