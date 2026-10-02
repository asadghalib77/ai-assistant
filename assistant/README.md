# Sentiment Studio

Sentiment analysis with PyTorch and Hugging Face Transformers: a FastAPI service
that serves four fine-tuned transformer models, and a Next.js workspace to
analyze a text, run batches and inspect the models.

```
sentiment-studio/
â”œâ”€â”€ api/   FastAPI Â· Python 3.12 Â· uv Â· Ruff Â· pytest Â· torch 2.2.2 Â· transformers 4.57.6   â†’ :8000
â””â”€â”€ web/   Next.js 16 Â· React 19 Â· TypeScript 7 Â· Tailwind CSS 4 Â· shadcn/ui Â· Node 24      â†’ :3000
```

## Photos in the sentiment analyzer

Use **Add photos** in the existing **Analyze** input card, paste screenshots,
drop images, or use a phone camera. Text and photos share the same analysis
screen, sentiment results, and recent history. No separate Photos tab or app
is required. The `assistant/api` and `assistant/web` structure is unchanged.

First choose **Analyze text / photos** or **Chat / ask questions** in the Analyze view. Chat answers directly through Ollama without a sentiment classifier. Press **Enter** to submit text or photos; **Shift+Enter** inserts a new line. Successful photo analysis clears the input text and attachment tray while keeping the result and source photos in history. Failed analysis keeps the inputs for retry.

For sentiment analysis, choose **Read text**, **Describe photo**, or **Ask a question**. Ollama prepares
the transcription, description, or answer, then the selected sentiment model
returns scores and word explanations. The exact photo text is shown alongside
the result so it can be checked. With Read text or Describe photo, any typed
text is included in the sentiment analysis. With Ask a question, only the
answer is scored; the question is an instruction. Follow-up questions keep
context while the same photos are attached. These scores describe the generated
or extracted text, rather than directly classifying pixels or facial emotions.

The four sentiment classifiers are text-only. The photo reader discovers the models
installed in Ollama and checks each model's `vision` capability. **Auto uses local
vision models only**. It never silently falls back to a cloud model. The dropdown
marks each photo reader as Local or Cloud and Sees images or Text only.
The model picker in the original top bar chooses the sentiment classifier.
Changing that classifier reuses the prepared text rather than sending the photo again.

For local image understanding:

```bash
ollama pull gemma3:4b
```

For a smaller local model for basic photo questions:

```bash
ollama pull moondream
```

To use Gemma 4 through Ollama Cloud, explicitly select `gemma4:31b-cloud`:

```bash
ollama pull gemma4:31b-cloud
# If the app reports that sign-in is required:
ollama signin
```

Cloud selections send photos and messages to Ollama Cloud. Local models run
through `OLLAMA_HOST`, defaulting to this computer at `http://localhost:11434`.
The composer shows the destination before sending. There is no cloud fallback.
Use a local vision model if photos must remain on this computer.

Photos are limited to 5 per message, 10 MB each, and 20 per request. The browser
resizes them to a 2048 px long edge and at most 5 MB, strips photo metadata,
and converts to PNG/JPEG (animated GIFs use the first frame). HEIC is rejected
with conversion instructions. The API enforces a streaming body cap, decodes
and checks file signatures, and gives Ollama raw image bytes rather than paths.

Analysis text and photo metadata are saved in the existing history in localStorage;
photo bytes live in IndexedDB. Private
windows may fall back to memory for this tab. Only unreferenced photos older
than 24 hours are garbage-collected. New analysis resets the current input.
Previously saved analyses retain their photo sources. Retry controls appear
in the original results card. Opening history re-scores the saved text without
requiring another Ollama request. Newly attached photos require a vision reader;
ordinary text analysis continues to work even if Ollama is unavailable.

Verification, with both servers running:

```bash
cd api
uv run python -m pytest
uv run python ../scripts/doctor_photo_chat.py --api http://localhost:8000 --web http://localhost:3000
# Live test transmits a generated, non-personal image:
uv run python ../scripts/doctor_photo_chat.py --model gemma4:31b-cloud --send
```

`scripts/input_actions_e2e.cjs` checks action selection, keyboard submission, input clearing, error preservation, and direct chat routing against mocked model replies.
It needs Playwright/Chromium, a running web server, and `BASE_URL` (default
`http://localhost:3100`). `PLAYWRIGHT_PATH` can point to an external Playwright
installation. Screenshots go to `photo-chat-e2e-out` or `OUT`. Mock replies only
test wiring and UI; they do not measure model accuracy.

## Sentiment models

| Model | Hugging Face id | Domain | Labels |
|---|---|---|---|
| DistilBERT SST-2 (default) | `distilbert/distilbert-base-uncased-finetuned-sst-2-english` | Topic: reviews, comments, headlines | negative, positive |
| FinBERT | `ProsusAI/finbert` | Financial news and reports | negative, neutral, positive |
| Twitter RoBERTa | `cardiffnlp/twitter-roberta-base-sentiment-latest` | Tweets and social posts | negative, neutral, positive |
| Multilingual BERT | `nlptown/bert-base-multilingual-uncased-sentiment` | Product reviews (EN, NL, DE, FR, ES, IT) | 1â€“5 stars |

Models download from the Hugging Face Hub on first use (268â€“670 MB each) and
stay in memory. The default model loads in the background at startup.

## Quick start

Install dependencies once in `api/`, `agent/` and `web/`. Then run the entire
app from one terminal:

```powershell
cd web
npm run dev                     # http://localhost:3000
```

This starts the API on port 8000 and the web app on port 3000. It also starts
the LiveKit worker automatically when credentials are set in `api/.env`.
Ctrl+C stops all three process trees. See [VOICE.md](VOICE.md) for setup.
`npm run dev:web` remains available for an independently managed API.


The web app calls `/api/*` on its own origin and Next.js forwards it to the API
(`API_URL`, default `http://localhost:8000`), so there is no CORS setup.

## What you can do

- **Analyze:** label and confidence, the probability of every class, word
  influence (integrated gradients: blue words pushed toward positive, red toward
  negative), token list and a truncation warning past 512 tokens. Examples match
  the selected model's domain. Ctrl/âŒ˜ + Enter runs it.
- **Batch:** paste one text per line or upload a CSV (`text`, `review`,
  `sentence`, `comment`â€¦ column) or TXT file, up to 1,000 rows. See the label
  split, average confidence and low-confidence rows, then filter and export as
  CSV with every class probability.
- **Model:** model card, runtime (device, limits), load models ahead of time,
  switch models, API reference.
- History of recent analyses (kept in the browser), light and dark themes, and
  a phone layout.

## API

| Method | Path | Body â†’ response |
|---|---|---|
| GET | `/api/health` | â†’ `{status, version, device, models: {id: status}}` |
| GET | `/api/models` | â†’ `{default_model, device, limits, models: [...]}` |
| POST | `/api/models/load` | `{model}` â†’ model info once loaded |
| POST | `/api/predict` | `{text, model?, explain?}` â†’ `{label, score, probs, tokens, num_tokens, truncated, attributions, model, device, latency_ms}` |
| POST | `/api/predict/batch` | `{texts, model?}` â†’ `{model, device, latency_ms, results: [{label, score, probs, num_tokens, truncated}]}` |

```bash
curl -s localhost:8000/api/predict -H 'content-type: application/json' \
  -d '{"text": "Shares rose after strong earnings.", "model": "ProsusAI/finbert"}'
```

`probs` always lists every class from most negative to most positive. Errors are
JSON `{"detail": "..."}`: 404 unknown model, 422 invalid input or over a limit,
503 model failed to load (the message says why).

## Configuration

All backend settings are environment variables (or `api/.env`); see
`api/.env.example`. The most useful ones:

| Variable | Default | |
|---|---|---|
| `DEVICE` | `auto` | `auto` picks CUDA, then Apple MPS, then CPU |
| `DEFAULT_MODEL` / `ENABLED_MODELS` | DistilBERT / all four | JSON list for `ENABLED_MODELS` |
| `PRELOAD_MODELS` | the default model | loaded in the background at startup |
| `MODEL_SOURCES` | `{}` | `{"<model id>": "/local/folder"}` to serve a local copy |
| `MAX_TEXT_CHARS` / `MAX_BATCH_ITEMS` | 5000 / 1000 | request limits |
| `EXPLAIN_STEPS` | 16 | integrated-gradients steps; `0` turns word influence off |
| `ENVIRONMENT` | `development` | `production` hides `/docs` |

Web: `API_URL` (build time and server side) sets where `/api` is forwarded.

### Offline servers

```bash
cd api
uv run python -m app.download       # config, tokenizer and model.safetensors only
HF_HUB_OFFLINE=1 uv run fastapi run
```

### GPU and CPU

`torch==2.2.2` from PyPI includes CUDA 12.1 on Linux, so NVIDIA GPUs work out of
the box (`DEVICE=auto`). Apple Silicon uses MPS. On a CPU-only Linux server you
can install the much smaller CPU build by adding this to `api/pyproject.toml`,
then running `uv lock && uv sync`:

```toml
[[tool.uv.index]]
name = "pytorch-cpu"
url = "https://download.pytorch.org/whl/cpu"
explicit = true

[tool.uv.sources]
torch = { index = "pytorch-cpu", marker = "sys_platform == 'linux'" }
torchvision = { index = "pytorch-cpu", marker = "sys_platform == 'linux'" }
```

## Docker

```bash
cp api/.env.example api/.env      # optional
docker compose up --build         # web â†’ http://localhost:3000, API â†’ http://localhost:8000
```

Models are cached in the `models` volume, so they download once. To fill it in
advance: `docker compose run --rm api python -m app.download`. For an NVIDIA
GPU, uncomment the `deploy` block in `docker-compose.yml`.

## Why safetensors only

torch is pinned to 2.2.2, and transformers refuses to unpickle `pytorch_model.bin`
files on torch < 2.6 because of CVE-2025-32434. The API therefore always loads
`model.safetensors`. FinBERT and Twitter RoBERTa publish safetensors only on the
Hugging Face conversion bot's pull-request revisions, so the catalog pins those
revisions (`refs/pr/29`, `refs/pr/43`). The Model view shows each model's revision.

## Quality checks

```bash
cd api && uv run ruff check . && uv run ruff format --check . && uv run pytest
cd web && npm run typecheck && npm run build
```

The backend tests build tiny real BERT, DistilBERT and RoBERTa checkpoints on the
fly, so they exercise the actual PyTorch/Transformers code with no downloads:
label mapping per model, batching, truncation, the safetensors-only rule, the
integrated-gradients completeness property, and every endpoint and error path.

## Production checklist

- Set `ENVIRONMENT=production` and put the web app behind HTTPS.
- Add authentication before exposing the API publicly; inference costs CPU/GPU time.
- One API process holds each model in memory (0.3â€“0.7 GB per model). Scale with
  more processes or replicas, and use `ENABLED_MODELS` to load only what you need.
- History lives in each user's browser. Add a database if you need shared history.



## LiveKit voice mode

Voice setup, environment variables, startup commands, access controls and tests
are documented in [VOICE.md](VOICE.md).
