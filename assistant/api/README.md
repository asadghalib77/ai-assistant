# AI Assistant backend API

FastAPI backend serving sentiment inference, Ollama chat and photo understanding, Cloudflare image generation, and LiveKit room/session endpoints.

## Features

- Single and batch sentiment predictions, model metadata, and explicit model loading.
- Class probabilities and integrated-gradients word explanations.
- Photo validation, model capability discovery, photo-to-text sentiment, and streamed chat.
- Server-side image-generation requests and provider error handling.
- LiveKit session tokens and a streamed brain endpoint for the voice worker.

## Tech stack and AI models

Python 3.12, uv, FastAPI, Pydantic Settings, HTTPX, PyTorch 2.2.2, torchvision 0.17.2, NumPy 1.26.4, Transformers 4.57.6, Ollama SDK, LiveKit API, Ruff, and pytest.

| Model | Purpose | Output |
|---|---|---|
| DistilBERT SST-2 | General text; default | Negative / positive |
| FinBERT | Financial text | Negative / neutral / positive |
| Twitter RoBERTa | Social posts | Negative / neutral / positive |
| Multilingual BERT | Product reviews | One to five stars |

Model IDs are listed in the [root README](../../README.md). Checkpoints load from safetensors only. Ollama supplies conversational and vision models; Cloudflare supplies `@cf/black-forest-labs/flux-1-schnell`. LiveKit supplies room access for the separate voice agent.

## Setup and installation

Install uv and use Python 3.12. From the repository root:

```powershell
cd assistant/api
uv sync --python 3.12
Copy-Item .env.example .env
```

Copy the example only if `.env` does not already exist. Edit `.env` for optional providers. Text sentiment works with the default settings. The API uses its own `.venv`; Python 3.13 is reserved for the voice agent.

Normally start the entire app through `npm run dev` in `../web`. To start the API alone:

```powershell
uv run fastapi dev
```

The API is available at http://localhost:8000, with interactive development documentation at http://localhost:8000/docs and a health endpoint at http://localhost:8000/api/health.

## Configuration

See [.env.example](.env.example) for the complete example. Key settings include `DEVICE`, `DEFAULT_MODEL`, `ENABLED_MODELS`, `PRELOAD_MODELS`, `MODEL_SOURCES`, `OLLAMA_HOST`, text/batch/image limits, LiveKit credentials, and Cloudflare credentials. Lists and mappings use JSON syntax. Never expose provider secrets to the browser.

Sentiment models download on first use; the default preloads in the background. To download configured sentiment models ahead of time:

```powershell
uv run python -m app.download
```

For chat/photos, start Ollama and install a model such as `gemma3:4b`. Photo sentiment scores the text produced from the photo, not the image pixels directly.

## API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Health and model readiness |
| `GET /api/models` | Sentiment model catalog and limits |
| `POST /api/models/load` | Load a sentiment checkpoint |
| `POST /api/predict` | Analyze one text |
| `POST /api/predict/batch` | Analyze multiple texts |
| `GET /api/photo-models` | Ollama model/capability discovery |
| `POST /api/predict/photos` | Prepare photo text and score sentiment |
| `POST /api/chat` | Stream conversational replies |
| `GET /api/images/config` | Image-generation availability |
| `POST /api/images/generate` | Generate an image from a prompt |

Consult `/docs` for request/response schemas and voice endpoints. See [voice setup](../VOICE.md) and [image-generation setup](../IMAGE_GENERATION.md) for provider-specific configuration.

## Tests and quality checks

```powershell
uv run python -m pytest
uv run ruff check .
uv run ruff format --check .
```

Sentiment tests create tiny real checkpoints rather than downloading production models. Provider integrations have mocked tests; passing these does not verify live provider credentials or service availability.

## Source layout

`app/main.py` is the entry point; `factory.py` builds the application. `core/` holds settings and request limits, `ml/` holds model inference and explanations, `routes/` holds HTTP endpoints, `photo_service.py` integrates Ollama, and `voice/` plus `voice_brain.py` provide voice sessions and the app reply adapter.
