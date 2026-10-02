# AI Assistant web frontend

The browser interface for text sentiment, batch analysis, model inspection, photo chat, image generation, and voice conversations.

## Features

- Analyze text/photos with probabilities and word explanations.
- Chat with photo attachments and automatically focused conversation input.
- Import/export batch data and reopen recent analyses.
- Generate and download images; start voice sessions with captions and controls.
- Responsive layout, light/dark themes, profile settings, and browser history storage.

## Tech stack

Node.js 24+, Next.js 16, React 19, TypeScript 7, Tailwind CSS 4, shadcn/ui, Radix UI, and LiveKit React/client libraries. AI requests go through the FastAPI backend; provider credentials belong to the backend.

## Setup and installation

First install the API dependencies as described in the [root setup guide](../../README.md). Then, from the repository root:

```powershell
cd assistant/web
npm install
npm run dev
```

Open http://localhost:3000. `npm run dev` starts the API and frontend together, plus the voice worker when LiveKit is configured. Keep the terminal open; Ctrl+C stops the processes. The launcher expects `api/.venv`, and `agent/.venv` when voice is enabled.

To run only the frontend with an independently started API:

```powershell
npm run dev:web
```

The browser calls `/api/*`; Next.js proxies to `API_URL`, defaulting to `http://localhost:8000`. Set `API_URL` before starting/building when using a different API address.

## Build and verification

```powershell
npm run typecheck
npm run build
npm start
```

`npm start` runs the built web server on port 3000; it does not launch the API or voice agent. Run those separately. The project also configures Next.js standalone output for container packaging.

## Source layout

| Directory | Purpose |
|---|---|
| `app/` | Page entry point, layout, themes, and global styles |
| `components/studio/` | Analyze, chat, batch, models, history, profile, and generation views |
| `components/photos/` | Attachment tray, gallery, viewer, and drop handling |
| `components/voice/` | Voice session, dictation, controls, and connection states |
| `components/ui/` | Shared UI components |
| `hooks/` | Models, attachments, chat, history, and voice configuration |
| `lib/` | API requests, types, browser storage, images, and configuration |

## AI feature requirements

Text sentiment uses the API's Hugging Face models. Chat uses Ollama; photos need a vision-capable model. Voice requires LiveKit and the Python agent. Image generation requires Cloudflare credentials in `api/.env`. See [runtime configuration](../README.md) for setup.
