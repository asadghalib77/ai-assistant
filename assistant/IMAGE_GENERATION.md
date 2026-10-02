# Image generation

Select **Generate an image** in the app, enter a description, and generate or download the result. In **Chat / ask questions**, select **Generate an image** in the composer or its + menu. Enter sends the description to Cloudflare; select the image option again to return to typed chat. Generated images appear in the conversation, support download, and persist in browser IndexedDB with chat history. Generation does not require an Ollama model. Remove photo attachments before generating; this model accepts text descriptions only.

The API calls Cloudflare Workers AI's `@cf/black-forest-labs/flux-1-schnell` with four steps. No image model is downloaded locally. The standalone preview stays in memory until the page reloads; use Download image to keep it. Conversation images use the existing local photo storage and cleanup; private browsing or storage limits can make persistence unavailable.

Configure `assistant/api/.env` and restart the API:

```dotenv
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-workers-ai-token
```

Create a Cloudflare API token with Account / Workers AI / Edit permission restricted to your account. Never put this token in frontend variables or commit `.env`.

Cloudflare provides 10,000 free Neurons daily, shared across Workers AI models. Use the Workers Free plan to avoid paid overage: requests fail when the allocation is exhausted. On Workers Paid, Cloudflare charges beyond the free allowance; this integration does not enforce an account-wide billing cap. See https://developers.cloudflare.com/workers-ai/platform/pricing/.

API endpoints: `GET /api/images/config` reports configuration availability, and `POST /api/images/generate` accepts `{ "prompt": "description" }` (1?2048 characters). Timeouts, missing credentials, provider limits, and invalid responses produce visible errors. The API never automatically retries generation.
