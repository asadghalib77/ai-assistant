# LiveKit voice mode

Choose **Talk with microphone** on the main screen, or use the microphone
button in **Chat / ask questions**. The button remains visible while typing or
attaching photos. Without LiveKit configuration it explains setup; once configured
it starts a conversation with the selected Ollama model.
Captions, microphone selection, mute, stop, retry and end controls use the
existing UI tokens. Escape interrupts replies unless a menu or dialog is open.
Spoken turns are saved into the existing browser chat, with stable ids and a
Spoken tag. A greeting alone is not saved. Sentiment views retain their behavior.
Earlier photo turns carry a text notice; photos are not sent to the voice worker.

## Configure

Add your LiveKit Cloud project values to `api/.env`. The unified launcher
shares these with the voice worker automatically; a separate `agent/.env` is
optional for speech overrides:

```dotenv
LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR-KEY
LIVEKIT_API_SECRET=YOUR-SECRET
VOICE_AGENT_NAME=my-agent
VOICE_AGENT_TOKEN=YOUR-RANDOM-SHARED-SECRET
```

Generate a shared token locally:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

The token protects `/api/voice/chat`; the launcher shares it with the worker. Voice cannot connect until URL/key/secret are set. Never put secrets in the web environment.

Agent settings (defaults are in `agent/.env.example`):

```dotenv
VOICE_LLM=app
API_URL=http://localhost:8000
API_TIMEOUT_SECONDS=120
VOICE_STT_MODEL=assemblyai/universal-3-5-pro
VOICE_STT_LANGUAGE=en
VOICE_TTS_MODEL=fishaudio/s2.1-pro
VOICE_TTS_VOICE=fa4c9eb3dccc4806b382b40d61c6b10a
VOICE_NOISE_CANCELLATION=true
VOICE_GREETING=Hi! What can I help you with?
```

Keep `VOICE_LLM=app` to use the selected chat model and the same streaming/error
handling as typed chat. Auto selects local vision models; Ollama Cloud models
require explicit selection. Microphone audio uses LiveKit Cloud Inference even
when the reply model is local. `OLLAMA_HOST` in `api/.env` remains the existing
chat server address. Optional `VOICE_INSTRUCTIONS` customizes spoken replies.

Optional API `VOICE_VOICES` is a JSON array of objects with `id`, `name`,
`description`, and `tts_voice`. The default `[]` hides the voice picker. API
settings also include `VOICE_TOKEN_TTL_SECONDS`, `VOICE_CONTEXT_TTL_SECONDS`,
`VOICE_HISTORY_MESSAGES`, `VOICE_MAX_MESSAGES`, and `VOICE_MAX_MESSAGE_CHARS`.
Restart `npm run dev` after environment changes.

## Start

Start everything from one terminal:

```powershell
cd assistant/web
npm run dev
```

This starts the API, Next.js and the voice worker together. Ctrl+C stops their
process trees. The worker starts automatically when LiveKit credentials are set.
Without credentials, the app runs normally and the microphone button explains setup. Put shared LiveKit
settings in `assistant/api/.env`; use `assistant/agent/.env` only for optional
speech settings. Conflicting credentials are reported before startup.

Dependencies must be installed once (`uv sync` in `api/`,
`uv sync --python 3.13` in `agent/`, and `npm install` in `web/`). The launcher
uses installed environments directly and never installs or downloads packages.
Stop previously running web/API instances before using the unified command.
`WEB_PORT` and `API_PORT` optionally change the default ports 3000 and 8000.
For an independently managed API/worker, `npm run dev:web` starts just Next.js.

The sentiment API uses Python 3.12 and the isolated worker uses Python 3.13.
Run Ollama with an already installed model. Model/plugin downloads may exceed
200 MB; check sizes and obtain approval before downloading those resources.
If a plugin requires local assets, prepare them with
`uv run python voice_agent.py download-files` after checking their sizes.
Production worker: `uv run python voice_agent.py start`.
Docker: `docker compose --profile voice up --build` from `assistant/`.

## Session access

This app currently has no login system. Local development permits sessions
through the loopback API. With `ENVIRONMENT=production`, session creation
returns 401 until trusted login middleware sets `request.state.user`. Protect
the web app with login before exposing it publicly: Next.js reaches the API
over loopback, so the development peer check is not browser authentication.
Set the agent token for any publicly reachable API. HTTPS or localhost is
required for microphone access.

Room model/history context is stored in one API process. Multiple API workers
need sticky routing or a shared store.

## Verify

```powershell
cd assistant/api
uv run python -m pytest
uv run ruff check .
uv run ruff format --check .
```

```powershell
cd assistant/agent
uv run python -m pytest
uv run ruff check .
uv run ruff format --check .
```

```powershell
cd assistant/web
npm run typecheck
npm run build
```

From the repository root, check configuration consistency:

```powershell
python .codex/skills/livekit-voice-mode/scripts/doctor_voice.py --project assistant
```

`scripts/voice-testing/` provides a local WebRTC harness using the real worker
and LiveKit server, with fake speech recognition and tones instead of cloud
speech. No AI model downloads are required. Start a local LiveKit server with
`livekit-server --dev --bind 127.0.0.1`, then run the model fixture:

```powershell
cd assistant/api
uv run python -m uvicorn --app-dir ../scripts/voice-testing fake_ollama:app --port 11435
```

Start a separate test API with `PRELOAD_MODELS=[]`,
`OLLAMA_HOST=http://127.0.0.1:11435`, `LIVEKIT_URL=ws://127.0.0.1:7880`,
`LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret`. Give the harness the
same LiveKit settings and agent token, plus `VOICE_NOISE_CANCELLATION=false`:

```powershell
cd assistant/agent
uv run python ../scripts/voice-testing/voice_e2e_agent.py start
```

Run browser tests from `web/`, with the web app pointing to the test API:

```powershell
$env:BASE_URL="http://localhost:3000"
$env:CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"
node ../scripts/voice-testing/voice_e2e.cjs all
```

With the test API/model fixture and web app running, availability, retry,
typed-history continuity and responsive error layouts can also be checked
without an agent:

```powershell
node ../scripts/voice-testing/voice_ui_e2e.cjs
```

Screenshots go to `web/voice-e2e-out`. Real microphone quality and LiveKit Cloud
speech require your own credentials and a real-device check.


## Implementation file inventory

Changed files:

- `.gitignore`
- `README.md`
- `api/.env.example`
- `api/app/factory.py`
- `api/app/photo_service.py`
- `api/pyproject.toml`
- `api/uv.lock`
- `docker-compose.yml`
- `web/components/studio/photo-chat-view.tsx`
- `web/hooks/use-photo-chat.ts`
- `web/lib/types.ts`
- `web/package-lock.json`
- `web/package.json`

Created files:

- `VOICE.md`
- `agent/.dockerignore`
- `agent/.env.example`
- `agent/.gitignore`
- `agent/.python-version`
- `agent/Dockerfile`
- `agent/README.md`
- `agent/app_llm.py`
- `agent/pyproject.toml`
- `agent/settings.py`
- `agent/tests/conftest.py`
- `agent/tests/test_app_llm.py`
- `agent/tests/test_voice_agent.py`
- `agent/uv.lock`
- `agent/voice_agent.py`
- `api/app/voice/__init__.py`
- `api/app/voice/brain.py`
- `api/app/voice/routes.py`
- `api/app/voice/schemas.py`
- `api/app/voice/service.py`
- `api/app/voice/settings.py`
- `api/app/voice_brain.py`
- `api/tests/test_voice.py`
- `api/tests/test_voice_adapter.py`
- `scripts/voice-testing/fake_ollama.py`
- `scripts/voice-testing/voice_e2e.cjs`
- `scripts/voice-testing/voice_e2e_agent.py`
- `scripts/voice-testing/voice_ui_e2e.cjs`
- `web/components/ui/dropdown-menu.tsx`
- `web/components/voice/level-bars.tsx`
- `web/components/voice/voice-bar.tsx`
- `web/components/voice/voice-chrome.tsx`
- `web/components/voice/voice-session.tsx`
- `web/components/voice/voice.css`
- `web/hooks/use-voice-config.ts`
- `web/lib/voice.ts`

Unified development launcher: `scripts/dev.mjs`; launcher tests: `scripts/dev.test.mjs`.
