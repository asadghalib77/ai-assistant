# LiveKit voice worker

Uses Python 3.13 (isolated from the sentiment API's Python 3.12 environment).
Configure shared LiveKit project credentials, agent name and token in
`../api/.env`. A local `.env` is optional for speech overrides. Keep `VOICE_LLM=app` to use the chat
model selected in the browser. Local Ollama remains local; Ollama Cloud requires
explicit selection, as in typed chat.

The normal app launch (`npm run dev` in `../web`) starts this worker automatically
and shares credentials from `../api/.env`. No separate terminal is needed.

For standalone debugging:

```powershell
uv sync --python 3.13
uv run python voice_agent.py dev
```

Speech recognition, synthesis and turn detection use LiveKit Cloud Inference.
Production: `uv run python voice_agent.py start`.
Plugin files can be prepared with `uv run python voice_agent.py download-files`.
Check download sizes and obtain approval before downloading any resource over
200 MB. See `../README.md` for full configuration and verification details.
