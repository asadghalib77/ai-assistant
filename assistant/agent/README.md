# AI Assistant LiveKit voice agent

An optional speech worker that joins LiveKit rooms and lets users talk to the assistant. With `VOICE_LLM=app`, replies come from the existing FastAPI chat backend and use the model selected in the browser.

## Features

- Speech recognition, spoken replies, turn detection, and interruptions.
- ai-coustics microphone noise cancellation.
- Browser-selected voice and chat model, with app history passed as context.
- Streaming replies from the API, with transcripts saved by the web interface.

## Tech stack and AI services

An isolated Python 3.13 environment, uv, LiveKit Agents, LiveKit Inference, ai-coustics, HTTPX, Pydantic Settings, pytest, and Ruff. The sentiment API runs separately on Python 3.12.

Default speech settings use AssemblyAI `assemblyai/universal-3-5-pro` for STT and Fish Audio `fishaudio/s2.1-pro` for TTS. `VOICE_LLM=app` routes reply generation through the API to Ollama. Speech audio uses LiveKit Cloud even if the Ollama model is local.

## Setup and installation

From the repository root:

```powershell
cd assistant/agent
uv sync --python 3.13
```

Configure these shared values in `assistant/api/.env`:

```dotenv
LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR-KEY
LIVEKIT_API_SECRET=YOUR-SECRET
VOICE_AGENT_NAME=my-agent
VOICE_AGENT_TOKEN=YOUR-RANDOM-SHARED-SECRET
```

Replace placeholders with your project values. The unified launcher supplies these settings to the worker. Keep `VOICE_LLM=app` to use the browser-selected chat model. Start Ollama with an installed chat model, and install the API/web dependencies from the [root setup guide](../../README.md).

Start the app from the repository root:

```powershell
cd assistant/web
npm run dev
```

The worker starts automatically when LiveKit URL, key, and secret are configured. Open http://localhost:3000, choose **Chat / ask questions**, and use the voice button. Allow microphone access. Ctrl+C in the launcher terminal stops all app services.

## Optional speech overrides

Create `agent/.env` from [.env.example](.env.example) only if you need overrides. Shared LiveKit credentials, agent name, and token must match the API. Settings include `VOICE_STT_MODEL`, `VOICE_STT_LANGUAGE`, `VOICE_TTS_MODEL`, `VOICE_TTS_VOICE`, `VOICE_NOISE_CANCELLATION`, and `VOICE_GREETING`.

## Standalone execution

For standalone runs, configure `agent/.env` or process environment with the matching shared credentials and token. Ensure the API is already running and `API_URL` points to it.

From `assistant/agent`:

```powershell
uv run python voice_agent.py dev
```

For production worker execution:

```powershell
uv run python voice_agent.py start
```

If required by the plugins, prepare local assets with `uv run python voice_agent.py download-files`. Check download sizes before downloading large resources. See the [voice guide](../VOICE.md) for authentication, session access, and verification details.

## Tests and source layout

```powershell
uv run python -m pytest
uv run ruff check .
uv run ruff format --check .
```

- `voice_agent.py`: room entry point, speech pipeline, interruption, and session configuration.
- `app_llm.py`: adapter that streams replies from the FastAPI voice brain endpoint.
- `settings.py`: environment settings and defaults.
- `tests/`: worker and adapter tests.

If the worker does not join, check its terminal output, LiveKit credentials, matching agent name/token, and API connectivity. Microphone access requires localhost or HTTPS.
