"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon, CloudIcon, ImagePlusIcon, LoaderCircleIcon, LockKeyholeIcon, PlusIcon, RefreshCwIcon, SendIcon, SquareIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";

import { AttachmentTray } from "@/components/photos/attachment-tray";
import { PhotoDropZone } from "@/components/photos/drop-overlay";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { VisionNotice } from "@/components/photos/vision-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAttachments, type UseAttachments } from "@/hooks/use-attachments";
import { usePhotoChat } from "@/hooks/use-photo-chat";
import { request } from "@/lib/api";
import { ACCEPT_ATTR, DEFAULT_IMAGE_LIMITS } from "@/lib/images";
import { KEYS, readStore, writeStore } from "@/lib/storage";
import type { PhotoModelsResponse } from "@/lib/types";

export function PhotoChatView({ active, sharedAttachments, draft: sharedDraft, onDraftChange, onBusyChange }: { active: boolean; sharedAttachments?: UseAttachments; draft?: string; onDraftChange?: (value: string) => void; onBusyChange?: (busy: boolean) => void }) {
  const [data, setData] = useState<PhotoModelsResponse | null>(null);
  const [model, setModel] = useState("auto");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [localDraft, setLocalDraft] = useState("");
  const draft = sharedDraft ?? localDraft;
  const setDraft = onDraftChange ?? setLocalDraft;
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const limits = data?.image_limits ?? DEFAULT_IMAGE_LIMITS;
  const localAttachments = useAttachments(limits);
  const attachments = sharedAttachments ?? localAttachments;
  const chosen = data?.models.find((m) => m.id === (model === "auto" ? data.default_vision : model));
  const canSee = chosen?.vision ?? false;
  const chat = usePhotoChat(model === "auto" ? null : model, limits, canSee);
  const visionModel = data?.models.find((m) => m.vision && !m.cloud) ?? data?.models.find((m) => m.vision);
  const hasPhotos = attachments.items.length > 0;
  const hasHistoryPhotos = chat.messages.some((m) => m.images?.length);
  const blocked = hasPhotos && !canSee;
  const disabled = !chat.ready || loading || !!error || !chosen;
  useEffect(() => { onBusyChange?.(chat.busy); }, [chat.busy, onBusyChange]);

  useEffect(() => {
    const saved = readStore<unknown>(KEYS.photoModel, "auto");
    if (typeof saved === "string") setModel(saved);
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) writeStore(KEYS.photoModel, model); }, [model, loaded]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await request<PhotoModelsResponse>("/photo-models", { timeoutMs: 60_000 });
      setData(next);
      setError(null);
      setModel((old) => old === "auto" || next.models.some((m) => m.id === old) ? old : "auto");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Can't reach Ollama.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (active) void refresh(); }, [active, refresh]);
  useEffect(() => { if (active && chat.busy) bottom.current?.scrollIntoView({ block: "nearest" }); }, [chat.messages, chat.busy, active]);

  const submit = () => {
    if (disabled || chat.busy || attachments.processing || blocked || (!draft.trim() && !hasPhotos)) return;
    chat.send(draft, attachments.takeAll());
    setDraft("");
  };
  const files = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && !chat.busy) attachments.add(Array.from(event.target.files));
    event.target.value = "";
  };
  const itemClass = "flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-accent";

  return (
    <div className="flex flex-col gap-6">
      <PhotoDropZone enabled={active && !chat.busy} onFiles={attachments.add} limitText={`JPEG, PNG, WebP or GIF · up to ${limits.per_message} photos, ${Math.round(limits.max_bytes / 1024**2)} MB each`} />
      <div>
        <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">See more. Ask anything.</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Chat / ask questions</h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-muted-foreground sm:text-base">Ask a question, attach a photo, or continue the conversation. Ollama answers directly without scoring sentiment.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <Select value={model} onValueChange={setModel} disabled={chat.busy || loading}>
            <SelectTrigger aria-label="Photo chat model" className="w-full max-w-full sm:w-80"><SelectValue /></SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              <SelectItem value="auto">Auto · local vision models</SelectItem>
              {data?.models.map((m) => <SelectItem key={m.id} value={m.id}>{m.id} · {m.cloud ? "Cloud" : "Local"}{m.vision ? " · Sees images" : " · Text only"}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => void refresh()} disabled={loading || chat.busy} aria-label="Refresh photo models"><RefreshCwIcon className={loading ? "animate-spin" : ""} aria-hidden="true" /></Button>
        </div>
        <Button variant="outline" onClick={chat.clear} disabled={chat.busy || !chat.messages.length}><PlusIcon aria-hidden="true" />New photo chat</Button>
      </div>
      {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</div>}
      {!loading && !error && !chosen && <VisionNotice tone="warning" action={visionModel ? { label: `Use ${visionModel.id}`, onClick: () => setModel(visionModel.id) } : undefined}>No local vision model is available. Run <code>ollama pull gemma3:4b</code>, then refresh. {visionModel?.cloud && "Or choose Ollama Cloud using the button."}</VisionNotice>}

      <Card>
        <CardContent>
          <div className="flex min-h-48 flex-col gap-6" aria-label="Photo conversation" aria-live="polite" aria-relevant="additions">
            {chat.messages.length === 0 && (
              <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-background/50 px-4 py-8 text-center">
                <span className="grid size-14 place-items-center rounded-2xl border bg-card shadow-xs"><ImagePlusIcon className="size-6 text-muted-foreground" aria-hidden="true" /></span>
                <p className="font-medium">Start with a photo and a question.</p>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">Use the + menu to upload, or paste or drop an image here. Photos are saved in this browser.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["Describe this photo", "Extract the text", "Explain this chart", "Compare these photos"].map((prompt) => <Button key={prompt} variant="outline" size="sm" onClick={() => setDraft(prompt)}>{prompt}</Button>)}
                </div>
              </div>
            )}
            {chat.messages.map((message, index) => (
              <article key={message.id} className={`flex min-w-0 flex-col gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}>
                <p className="text-xs font-medium text-muted-foreground">{message.role === "user" ? "You" : message.model ?? "Assistant"}</p>
                {!!message.images?.length && <PhotoGallery images={message.images} />}
                {message.content && <div className={`max-w-full whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7 [overflow-wrap:anywhere] ${message.role === "user" ? "bg-secondary sm:max-w-[85%]" : "bg-background/60 w-full"}`}>{message.content}</div>}
                {message.status === "streaming" && !message.content && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />{hasHistoryPhotos ? "Looking at photos…" : "Thinking…"}</p>}
                {message.status === "stopped" && <p className="text-xs text-muted-foreground">Reply stopped.</p>}
                {message.error && <p role="alert" className="text-sm text-destructive">{message.error}</p>}
                {(message.status === "error" || message.status === "stopped") && index === chat.messages.length - 1 && <Button variant="outline" size="sm" onClick={chat.retry} disabled={chat.busy || disabled || (hasHistoryPhotos && !canSee)}><RefreshCwIcon aria-hidden="true" />Try again</Button>}
              </article>
            ))}
            <div ref={bottom} />
          </div>
          <div className="border-t pt-5">
            {blocked && <VisionNotice tone="warning" action={visionModel ? { label: `Use ${visionModel.id}`, onClick: () => setModel(visionModel.id) } : undefined}>{chosen ? `${chosen.id} can't see images. Switch to a model that can, or remove the photos.` : "No model that can see images is selected. Choose a vision model to send these photos."}</VisionNotice>}
            {!hasPhotos && hasHistoryPhotos && chosen && !canSee && <VisionNotice tone="info" action={visionModel ? { label: `Use ${visionModel.id}`, onClick: () => setModel(visionModel.id) } : undefined}>{chosen.id} can&apos;t see images, so it only gets a note that this chat has photos.</VisionNotice>}
            <AttachmentTray attachments={attachments} />
            <label htmlFor="photo-question" className="sr-only">Ask about your photos</label>
            <Textarea id="photo-question" value={draft} disabled={chat.busy} onChange={(e) => setDraft(e.target.value)} maxLength={20_000} placeholder="Ask a question, with or without a photo…" className="min-h-24 resize-y rounded-xl bg-background/50 p-4" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild><Button variant="outline" size="icon" aria-label="Add photos" title="Add photos" disabled={chat.busy}><PlusIcon aria-hidden="true" /></Button></DropdownMenu.Trigger>
                  <DropdownMenu.Portal><DropdownMenu.Content side="top" align="start" sideOffset={8} className="z-50 w-64 rounded-xl border bg-popover p-1 shadow-lg">
                    <DropdownMenu.Item className={itemClass} onSelect={() => requestAnimationFrame(() => fileInput.current?.click())}><ImagePlusIcon className="mt-0.5 size-4" aria-hidden="true" /><span>Add photos<span className="block text-xs text-muted-foreground">JPEG, PNG, WebP or GIF · up to {limits.per_message}</span></span></DropdownMenu.Item>
                    <DropdownMenu.Item className={itemClass} onSelect={() => requestAnimationFrame(() => cameraInput.current?.click())}><CameraIcon className="mt-0.5 size-4" aria-hidden="true" /><span>Take a photo<span className="block text-xs text-muted-foreground">Uses your camera on phones and tablets</span></span></DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" /><p className="px-3 py-2 text-xs text-muted-foreground">You can also paste or drop photos.</p>
                  </DropdownMenu.Content></DropdownMenu.Portal>
                </DropdownMenu.Root>
                <input ref={fileInput} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={files} data-testid="photo-input" />
                <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={files} data-testid="camera-input" />
                <span className="text-xs text-muted-foreground" aria-live="polite">{attachments.items.length ? `${attachments.items.length} of ${limits.per_message} photos` : "Paste or drop photos"}</span>
              </div>
              {chat.busy ? <Button onClick={chat.stop}><SquareIcon aria-hidden="true" />Stop</Button> : <Button onClick={submit} disabled={disabled || blocked || attachments.processing || (!draft.trim() && !hasPhotos)} aria-label={attachments.processing ? "Waiting for photos to be ready" : "Send message"}><SendIcon aria-hidden="true" />Send</Button>}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground" aria-live="polite">
              {chosen?.cloud ? <CloudIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : <LockKeyholeIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
              {chosen ? chosen.cloud ? `Photos and messages are sent to Ollama Cloud: ${chosen.id}.` : `Photos stay on this computer: ${chosen.id} runs locally.` : "Auto uses local vision models only. Cloud models must be selected explicitly."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Images are resized to 2048 px with photo metadata removed. AI answers can make mistakes.</p>
            <p className="mt-1 text-xs text-muted-foreground">Enter to send text or photos · Shift+Enter for a new line.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
