# AI Assistant runtime guide

The application combines Sentiment Studio, Ollama chat and photo understanding, Cloudflare image generation, and an optional LiveKit voice worker. For the project overview and complete first-time installation, start with the [repository README](../README.md).

## Features

Analyze text and photo-derived text with sentiment probabilities and word explanations; process CSV/TXT batches; ask conversational questions with photos; generate downloadable images; and use voice with captions and saved transcripts. History is stored in the browser, with image bytes in IndexedDB.

## Tech stack and architecture

- **Web:** `web/`, Node.js 24+, Next.js 16, React 19, TypeScript 7, Tailwind CSS 4, shadcn/ui.
- **API:** `api/`, Python 3.12, FastAPI, PyTorch 2.2.2, Transformers 4.57.6, uv.
- **Agent:** `agent/`, isolated Python 3.13, LiveKit Agents and Inference, ai-coustics.
- **Models/APIs:** four Hugging Face sentiment classifiers, installed Ollama chat/vision models, optional Ollama Cloud, Cloudflare FLUX.1 Schnell, and LiveKit speech services.

The browser calls `/api/*` on the web origin. Next.js forwards these requests to FastAPI. The voice worker obtains replies from the app API when `VOICE_LLM=app`, keeping the selected chat model consistent with typed chat.

## Setup and installation

The commands in this guide start from the `assistant/` directory.

```powershell
cd api
uv sync --python 3.12
Copy-Item .env.example .env

cd ../web
npm install
npm run dev
```

Copy the environment example only on first setup so you preserve existing configuration. Open http://localhost:3000. The launcher starts both the web server and API; Ctrl+C stops them.

For chat/photos, install and start Ollama, then run `ollama pull gemma3:4b`. For voice, install the worker with `uv sync --python 3.13` from `agent/` and configure LiveKit in `api/.env` before launching. See [agent setup](agent/README.md).

## Configuration

| Setting | Where | Purpose |
|---|---|---|
| `OLLAMA_HOST` | `api/.env` | Ollama address; default `http://localhost:11434` |
| `DEVICE` | `api/.env` | `auto`, `cpu`, `cuda`, or `mps` |
| `ENABLED_MODELS` / `PRELOAD_MODELS` | `api/.env` | JSON arrays controlling sentiment availability/loading |
| `MODEL_SOURCES` | `api/.env` | JSON mapping of model IDs to local checkpoint folders |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `api/.env` | Enable the voice worker and room connections |
| `VOICE_AGENT_TOKEN` | `api/.env` | Shared token for the voice brain endpoint |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | `api/.env` | Enable image generation |
| `API_URL` | Web process environment | API proxy destination for independently managed servers |
| `API_PORT` / `WEB_PORT` | Launcher environment | Override ports 8000 / 3000 |

Restart after configuration changes. The unified launcher supplies its own `API_URL` from `API_PORT`. Optional `agent/.env` can override speech settings; shared credentials must match the API.

## Run components separately

Use separate terminals, starting from `assistant/` in each:

```powershell
cd api
uv run fastapi dev
```

```powershell
cd web
npm run dev:web
```

```powershell
cd agent
uv run python voice_agent.py dev
```

Standalone voice startup needs shared LiveKit credentials in the worker environment or `agent/.env`; the unified launcher normally supplies them automatically.

## Model downloads and offline sentiment

Sentiment checkpoints download from Hugging Face on first use and are cached. Only safetensors weights are loaded. FinBERT uses revision `refs/pr/29`; Twitter RoBERTa uses `refs/pr/43`.

To prepare the sentiment checkpoints in advance:

```powershell
cd api
uv run python -m app.download
$env:HF_HUB_OFFLINE = '1'
uv run fastapi run
```

Offline sentiment requires the necessary cached files. Local Ollama models must also be installed before offline chat; voice and cloud image generation require internet access.

## Docker

From this directory:

```powershell
docker compose up --build
```

Open http://localhost:3000. Models persist in the `models` volume. Voice is optional:

```powershell
docker compose --profile voice up --build
```

For Docker voice, configure `agent/.env` as well as `api/.env` with matching LiveKit credentials and agent token; Compose does not share the API environment with the agent. Set `OLLAMA_HOST` in `api/.env` to an address reachable from the API container. On Docker Desktop, host Ollama is commonly reached through `http://host.docker.internal:11434`.

## Storage and service requirements

Text history and profile settings use browser localStorage; photos and generated conversation images use IndexedDB. Data belongs to that browser profile and is not a shared server database. Clearing browser storage removes it.

Text sentiment needs neither Ollama nor cloud credentials. Chat needs Ollama; photos need a vision-capable model. Voice uses LiveKit Cloud speech processing, and image generation uses Cloudflare. Public deployment needs authentication; production voice session creation requires authenticated user context. See [VOICE.md](VOICE.md) and [IMAGE_GENERATION.md](IMAGE_GENERATION.md) for details.

## Component documentation

- [Web](web/README.md)
- [API](api/README.md)
- [Voice agent](agent/README.md)
