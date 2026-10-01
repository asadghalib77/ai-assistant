# AGENTS.md

## Project

Full-Stack Agentic AI Assistant with:

- Chat
- Voice using LiveKit
- Image attachments / image understanding
- Agent + API + Web architecture
- Modular Agent Skills

## Stack

- **Frontend:** Node.js 24, Next.js 16, React 19, TypeScript, shadcn/ui — `frontend/` — port `3000`
- **Backend:** Python 3.12, FastAPI, uv, Ruff, pytest — `backend/` — port `8000`
- **Local AI:** Ollama — `localhost:11434`
- **Cloud AI:** provider integrations as required
- **Voice:** LiveKit

## Commands

### Frontend

```bash
cd frontend
npm install
npm run dev
npm install <package-name>