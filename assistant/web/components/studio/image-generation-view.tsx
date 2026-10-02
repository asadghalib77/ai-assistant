"use client";

import { useEffect, useRef, useState } from "react";
import { DownloadIcon, LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage, request } from "@/lib/api";

type GeneratedImage = { image: string; prompt: string; model: string };

export function ImageGenerationView() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<GeneratedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void request<{ configured: boolean }>("/images/config", { signal: controller.signal })
      .then((data) => setConfigured(data.configured))
      .catch((err) => { if (!controller.signal.aborted) setError(errorMessage(err)); });
    return () => { controller.abort(); pending.current?.abort(); };
  }, []);

  async function generate() {
    if (!prompt.trim() || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(null);
    try {
      const image = await request<GeneratedImage>("/images/generate", {
        method: "POST", body: { prompt: prompt.trim() },
        signal: controller.signal, timeoutMs: 135_000,
      });
      if (!controller.signal.aborted) setResult(image);
    } catch (err) {
      if (!controller.signal.aborted) setError(errorMessage(err));
    } finally {
      pending.current = null;
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5 rounded-xl border bg-card p-5" aria-labelledby="image-generation-title">
      <div>
        <h2 id="image-generation-title" className="text-lg font-semibold">Generate an image</h2>
        <p className="mt-1 text-sm text-muted-foreground">Describe a scene, style, lighting, and details. Powered by FLUX.1 Schnell.</p>
        <p className="mt-1 text-xs text-muted-foreground">Uses Cloudflare&apos;s daily free allowance. Limits are shared with other Workers AI usage.</p>
      </div>
      {configured === false && <p role="status" className="text-sm text-muted-foreground">Add Cloudflare credentials to the backend configuration and restart the API to enable generation.</p>}
      <form onSubmit={(event) => { event.preventDefault(); void generate(); }} className="space-y-3">
        <label htmlFor="image-prompt" className="text-sm font-medium">Image description</label>
        <textarea id="image-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={2048} rows={4} disabled={busy}
          placeholder="A cozy cabin beside a mountain lake at sunrise, watercolor style…"
          className="w-full resize-y rounded-lg border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || configured === false || !prompt.trim()}>
            {busy ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : <SparklesIcon aria-hidden="true" />}
            {busy ? "Generating…" : "Generate an image"}
          </Button>
          <span className="text-xs text-muted-foreground">{prompt.length}/2048</span>
          {busy && <span role="status" className="text-sm text-muted-foreground">Your image is being created.</span>}
        </div>
      </form>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {result && <figure className="space-y-3">
        {/* Generated data URLs do not need the Next.js image proxy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.image} alt={result.prompt} className="mx-auto max-h-[640px] w-full rounded-lg object-contain" />
        <figcaption className="text-sm text-muted-foreground">{result.prompt}</figcaption>
        <Button asChild variant="outline"><a href={result.image} download={`generated-image.${result.image.startsWith("data:image/png") ? "png" : "jpg"}`}><DownloadIcon aria-hidden="true" />Download image</a></Button>
      </figure>}
    </section>
  );
}
