# AI Assistant — Sentiment Studio

A full-stack AI workspace for sentiment analysis, conversations, photo understanding, image generation, and voice conversations. The browser interface connects a Next.js web app to a FastAPI backend and an optional LiveKit voice agent.

## Features

- **Analyze text:** choose a sentiment classifier, view labels and confidence, compare class probabilities, and inspect word-level explanations.
- **Analyze photos:** upload, paste, drag and drop, or capture photos; read text, describe an image, or ask a question, then score the resulting text for sentiment.
- **Chat:** ask questions and follow up with text or photos using an installed Ollama model. Chat replies do not require sentiment scoring.
- **Batch analysis:** import CSV/TXT or paste multiple texts, filter results, and export scores.
- **Model management:** inspect the available sentiment classifiers and load them ahead of time.
- **Image generation:** create and download images through Cloudflare Workers AI.
- **Voice mode:** talk through LiveKit with live captions, interruption, microphone controls, and transcripts saved into chat history.
- **Browser workspace:** recent history, photo storage, profile settings, responsive layout, and light/dark themes.

The app opens with **Analyze text / photos** selected. Conversation input focuses automatically when the chat view opens.

## Tech stack

| Component | Location | Technologies | Default address |
|---|---|---|---|
| Frontend / web | `assistant/web/` | Node.js 24+, Next.js 16, React 19, TypeScript 7, Tailwind CSS 4, shadcn/ui, Radix UI | http://localhost:3000 |
| Backend / API | `assistant/api/` | Python 3.12, FastAPI, uv, Pydantic, PyTorch 2.2.2, Transformers 4.57.6 | http://localhost:8000 |
| Voice agent | `assistant/agent/` | Separate Python 3.13 environment, LiveKit Agents, LiveKit Inference, ai-coustics | Connects to LiveKit rooms |
| Local chat / vision | Ollama | Installed text or vision models | http://localhost:11434 |
| Sentiment inference | API | Hugging Face safetensors checkpoints | Runs on this computer |
| Cloud integrations | API / agent | Optional Ollama Cloud, Cloudflare Workers AI, LiveKit Cloud | Provider services |

### AI models and APIs

| Purpose | Model / provider | Notes |
|---|---|---|
| General sentiment | `distilbert/distilbert-base-uncased-finetuned-sst-2-english` | Default; positive or negative |
| Financial sentiment | `ProsusAI/finbert` | Positive, neutral, negative |
| Social sentiment | `cardiffnlp/twitter-roberta-base-sentiment-latest` | Positive, neutral, negative |
| Multilingual reviews | `nlptown/bert-base-multilingual-uncased-sentiment` | One to five stars |
| Chat and photo understanding | Ollama; for example `gemma3:4b` | Photos require a vision-capable model |
| Image generation | Cloudflare `@cf/black-forest-labs/flux-1-schnell` | Cloud API; no local image-generation model download |
| Voice recognition and synthesis | LiveKit Inference | Defaults: AssemblyAI STT and Fish Audio TTS; configurable in agent settings |

The sentiment models classify text. Photo sentiment scores apply to extracted text, descriptions, or generated answers, rather than directly classifying pixels or facial emotions. Auto model selection uses local Ollama vision models; cloud models require explicit selection.

## Repository layout

```text
ai-assistant/
├── README.md                 # Start here
└── assistant/
    ├── README.md             # Runtime and configuration guide
    ├── web/                  # Frontend
    ├── api/                  # Backend and sentiment inference
    ├── agent/                # Optional voice worker
    ├── scripts/              # Unified launcher and verification tools
    ├── VOICE.md              # Detailed voice configuration
    ├── IMAGE_GENERATION.md   # Detailed image-generation configuration
    └── docker-compose.yml
```

Use the component environments under `assistant/` to run the app. Installing the repository-root Python project is not required for this setup.

## Setup and installation

### 1. Prerequisites

Install Git, Node.js 24 or newer, and uv. The API needs Python 3.12; voice uses a separate Python 3.13 environment. Ollama is needed for chat and photo understanding. LiveKit and Cloudflare accounts are optional, depending on the features you use.

Initial dependency installation and first-time model downloads need internet access. Sentiment checkpoints are several hundred MB each; local Ollama models may require several GB of disk space.

### 2. Clone the repository

```powershell
 git clone https://github.com/asadghalib77/ai-assistant.git
 cd ai-assistant
```

If you already have the project, open a terminal in its repository folder and skip cloning.

### 3. Install dependencies

Run these commands from the repository root:

```powershell
cd assistant/api
uv sync --python 3.12

cd ../web
npm install
```

For voice mode, also install the optional worker:

```powershell
cd ../agent
uv sync --python 3.13
```

Each Python component has its own `.venv`. Do not reuse the root virtual environment for the API or agent.

### 4. Configure the backend

From the repository root, create the local configuration file once:

```powershell
Copy-Item assistant/api/.env.example assistant/api/.env
```

Edit `assistant/api/.env` as needed. Default settings are sufficient for text sentiment analysis. Keep credentials in local `.env` files; never put them in frontend code or commit them.

### 5. Set up local chat and photos (optional)

Install and start Ollama, then download a vision model:

```powershell
ollama pull gemma3:4b
```

If Ollama is not already running, run `ollama serve` in a separate terminal. The API connects to `http://localhost:11434` by default. Select an installed model in **Chat / ask questions**; photos require a model marked **Sees images**. Text sentiment analysis works without Ollama.

### 6. Start the app

From the repository root:

```powershell
cd assistant/web
npm run dev
```

Open **http://localhost:3000**. This command starts the API on port 8000 and the web app on port 3000. It also starts the voice worker when LiveKit credentials are configured. Keep the terminal open; press **Ctrl+C** to stop the services.

The default sentiment model loads in the background and downloads on first use. Other classifiers download when first selected or loaded. Wait for model readiness before analyzing text.

### 7. Enable cloud features (optional)

For voice, install the agent dependencies and add `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` to `assistant/api/.env`. Set a shared `VOICE_AGENT_TOKEN` as described in the [voice guide](assistant/VOICE.md). The launcher shares the credentials with the agent.

For image generation, add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` to the same file. See the [image-generation guide](assistant/IMAGE_GENERATION.md) for token permissions.

Restart the app after changing environment variables. Voice audio is processed through LiveKit Cloud even when the reply model runs locally. Cloud image generation sends your prompt to Cloudflare. Explicit Ollama Cloud selections send chat content and photos to that provider.

## Verification

From the repository root:

```powershell
cd assistant/api
uv run python -m pytest
uv run ruff check .

cd ../agent
uv run python -m pytest
uv run ruff check .

cd ../web
npm run typecheck
npm run build

cd ../..
node --test assistant/scripts/dev.test.mjs
```

Skip agent checks if you have not installed the optional worker. The API test suite uses small test checkpoints rather than downloading the full sentiment models.

## Troubleshooting

| Problem | What to check |
|---|---|
| Dependencies are missing | Run `uv sync --python 3.12` in `assistant/api`, `npm install` in `assistant/web`, and the optional agent sync above. |
| Port 3000 or 8000 is occupied | Stop the previous app instance before running `npm run dev`. |
| Ollama is unavailable / model list is empty | Start Ollama, install a model, and refresh the model list. |
| A photo cannot be sent | Select a vision-capable model; check the attachment error for file limits. |
| Sentiment model is loading | Allow the first download to finish; check the API terminal for errors. |
| Voice is unavailable | Check LiveKit credentials, agent dependencies, and microphone permission; use localhost or HTTPS. |
| Image generation is unavailable | Check the Cloudflare account ID and token permissions in the API configuration. |

## Further documentation

- [Application configuration and runtime](assistant/README.md)
- [Frontend setup](assistant/web/README.md)
- [Backend setup and API](assistant/api/README.md)
- [Voice agent setup](assistant/agent/README.md)
- [Voice mode details](assistant/VOICE.md)
- [Image generation details](assistant/IMAGE_GENERATION.md)
