"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { SparklesIcon, ArrowUpIcon, AudioLinesIcon, MicIcon, CameraIcon, CloudIcon, ImagePlusIcon, LoaderCircleIcon, LockKeyholeIcon, PlusIcon, Trash2Icon, RefreshCwIcon, SquareIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { toast } from "sonner";

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
import type { ChatImage, PhotoModelsResponse } from "@/lib/types";
import { useImageUrl } from "@/hooks/use-image-url";
import { useVoiceConfig } from "@/hooks/use-voice-config";
import { DictationInput } from "@/components/voice/dictation-input";
import { VoiceLoading, VoiceTimer } from "@/components/voice/voice-chrome";
import type { VoiceHistoryMessage, VoiceTranscript } from "@/lib/voice";

const VoiceSession = dynamic(() => import("@/components/voice/voice-session"), {
  ssr: false, loading: () => <VoiceLoading />,
});

function GeneratedDownload({ image }: { image: ChatImage }) {
  const url = useImageUrl(image.id);
  if (!url) return null;
  return <Button asChild variant="outline" size="sm"><a href={url} download={`generated-image.${image.mediaType === "image/png" ? "png" : "jpg"}`}>Download image</a></Button>;
}

export function PhotoChatView({ active, sharedAttachments, draft: sharedDraft, onDraftChange, onBusyChange }: { active: boolean; sharedAttachments?: UseAttachments; draft?: string; onDraftChange?: (value: string) => void; onBusyChange?: (busy: boolean) => void }) {
  const [data, setData] = useState<PhotoModelsResponse | null>(null);
  const [model, setModel] = useState("auto");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generateMode, setGenerateMode] = useState(false);
  const [localDraft, setLocalDraft] = useState("");
  const draft = sharedDraft ?? localDraft;
  const setDraft = onDraftChange ?? setLocalDraft;
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const limits = data?.image_limits ?? DEFAULT_IMAGE_LIMITS;
  const localAttachments = useAttachments(limits);
  const attachments = sharedAttachments ?? localAttachments;
  const chosen = data?.models.find((m) => m.id === (model === "auto" ? data.default_vision : model));
  const canSee = chosen?.vision ?? false;
  const chat = usePhotoChat(model === "auto" ? null : model, limits, canSee);
  const { config: voiceConfig, prefs: voicePrefs, setPrefs: setVoicePrefs } = useVoiceConfig();
  const [voiceSession, setVoiceSession] = useState<{ key: number; startedAt: number; history: VoiceHistoryMessage[]; model: string } | null>(null);
  const pendingVoice = useRef<VoiceTranscript[]>([]);
  const acceptVoiceTranscripts = useRef(true);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const appendVoiceMessages = chat.appendVoiceMessages;
  const saveTranscripts = useCallback((batch: VoiceTranscript[]) => {
    if (!acceptVoiceTranscripts.current) return;
    for (const turn of batch) {
      const index = pendingVoice.current.findIndex((m) => m.id === turn.id);
      if (index < 0) pendingVoice.current.push(turn);
      else pendingVoice.current[index] = turn;
    }
    if (!pendingVoice.current.some((m) => m.role === "user")) return;
    appendVoiceMessages(pendingVoice.current);
  }, [appendVoiceMessages]);
  useEffect(() => { if (!active) setVoiceSession(null); }, [active]);
  const startVoice = useCallback(() => {
    if (!active || chat.busy) return;
    if (!voiceConfig?.enabled) {
      setVoiceNotice("Voice needs LiveKit setup. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to assistant/api/.env, then restart npm run dev. The microphone and spoken replies will be available here.");
      return;
    }
    if (!chosen || !chat.ready) {
      setVoiceNotice("Choose an available Ollama chat model before starting voice. If the model list is empty, start Ollama and refresh it.");
      return;
    }
    setVoiceNotice(null);
    acceptVoiceTranscripts.current = true;
    pendingVoice.current = [];
    setVoiceSession({ key: Date.now(), startedAt: Date.now(), model: chosen.id,
      history: chat.messages.filter((m) => !m.error && m.status !== "streaming" && m.content.trim()).map((m) => ({ role: m.role, content: m.content + (m.images?.length ? "\n[Photos attached in typed chat; unavailable in voice mode.]" : "") })),
    });
  }, [active, chat.busy, chat.ready, chat.messages, chosen, voiceConfig]);
  useEffect(() => {
    const deleted = () => {
      acceptVoiceTranscripts.current = false;
      pendingVoice.current = [];
      setVoiceSession(null);
    };
    window.addEventListener("assistant:chat-deleted", deleted);
    return () => window.removeEventListener("assistant:chat-deleted", deleted);
  }, []);
  useEffect(() => {
    const input = composerInput.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${Math.min(input.scrollHeight, 240)}px`;
  }, [draft, voiceSession, active]);
  useEffect(() => {
    if (!active || voiceSession) return;
    const frame = requestAnimationFrame(() => composerInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [active, voiceSession]);
  const visionModel = data?.models.find((m) => m.vision && !m.cloud) ?? data?.models.find((m) => m.vision);
  const hasPhotos = attachments.items.length > 0;
  const hasHistoryPhotos = chat.messages.some((m) => m.images?.length);
  const blocked = hasPhotos && !canSee;
  const disabled = !chat.ready || loading || !!error || !chosen;
  useEffect(() => { onBusyChange?.(chat.busy || !!voiceSession); }, [chat.busy, voiceSession, onBusyChange]);

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
    if (generateMode) {
      if (chat.busy || !chat.ready || !draft.trim() || draft.trim().length > 2048 || hasPhotos) return;
      chat.generate(draft);
      setDraft("");
      return;
    }
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
      <PhotoDropZone enabled={active && !chat.busy && !voiceSession} onFiles={attachments.add} limitText={`JPEG, PNG, WebP or GIF · up to ${limits.per_message} photos, ${Math.round(limits.max_bytes / 1024**2)} MB each`} />
      <div>
        <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">See more. Ask anything.</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Chat / ask questions</h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-muted-foreground sm:text-base">Ask a question, attach a photo, or continue the conversation. Ollama answers directly without scoring sentiment.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <Select value={model} onValueChange={setModel} disabled={chat.busy || !!voiceSession || loading}>
            <SelectTrigger aria-label="Photo chat model" className="w-full max-w-full sm:w-80"><SelectValue /></SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              <SelectItem value="auto">Auto · local vision models</SelectItem>
              {data?.models.map((m) => <SelectItem key={m.id} value={m.id}>{m.id} · {m.cloud ? "Cloud" : "Local"}{m.vision ? " · Sees images" : " · Text only"}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => void refresh()} disabled={loading || chat.busy} aria-label="Refresh photo models"><RefreshCwIcon className={loading ? "animate-spin" : ""} aria-hidden="true" /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => { setVoiceSession(null); if (!voiceSession) chat.clear(); }} disabled={chat.busy || !!voiceSession || !chat.messages.length}><PlusIcon aria-hidden="true" />New chat</Button>
        <Button variant="ghost" disabled={chat.busy || !!voiceSession || !chat.messages.length} onClick={() => {
          const undo = chat.clear();
          if (undo) toast("Chat history cleared.", { action: { label: "Undo", onClick: undo } });
        }} aria-label="Clear chat history"><Trash2Icon aria-hidden="true" />Clear history</Button>
        </div>
      </div>
      {voiceNotice && <div role="status" aria-label="Voice setup" className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm leading-relaxed"><MicIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" /><p>{voiceNotice}</p><Button variant="ghost" size="sm" onClick={() => setVoiceNotice(null)} className="ml-auto shrink-0" aria-label="Dismiss voice setup">Dismiss</Button></div>}
      {voiceSession && <VoiceTimer startedAt={voiceSession.startedAt} />}
      {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</div>}
      {!loading && !error && !chosen && <VisionNotice tone="warning" action={visionModel ? { label: `Use ${visionModel.id}`, onClick: () => setModel(visionModel.id) } : undefined}>No local vision model is available. Run <code>ollama pull gemma3:4b</code>, then refresh. {visionModel?.cloud && "Or choose Ollama Cloud using the button."}</VisionNotice>}

      <Card>
        <CardContent>
          {voiceSession ? <VoiceSession key={voiceSession.key}
            selection={{ provider: "ollama", model: voiceSession.model }} participantName="Rizwan"
            history={voiceSession.history} voices={voiceConfig?.voices ?? []}
            voice={voicePrefs.voice} captions={voicePrefs.captions} onPrefsChange={setVoicePrefs}
            onTranscripts={saveTranscripts} onEnd={() => setVoiceSession(null)}
            onRetry={() => setVoiceSession((old) => old ? { ...old, key: Date.now() } : null)}
          /> : <>
          <div className="flex min-h-36 flex-col gap-4" aria-label="Photo conversation" aria-live="polite" aria-relevant="additions">
            {chat.messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-background/50 px-4 py-5 text-center">
                <span className="grid size-14 place-items-center rounded-2xl border bg-card shadow-xs"><ImagePlusIcon className="size-6 text-muted-foreground" aria-hidden="true" /></span>
                <p className="font-medium">Start with a photo or a question.</p>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">Use the + menu to upload, or paste or drop an image here. Photos are saved in this browser.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["Describe this photo", "Extract the text", "Explain this chart", "Compare these photos"].map((prompt) => <Button key={prompt} variant="outline" size="sm" onClick={() => setDraft(prompt)}>{prompt}</Button>)}
                </div>
              </div>
            )}
            {chat.messages.map((message, index) => (
              <article key={message.id} className={`flex min-w-0 flex-col gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}>
                <p className="text-xs font-medium text-muted-foreground">{message.role === "user" ? "You" : message.model ?? "Assistant"}</p>
                {message.voice && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MicIcon className="size-3" aria-hidden="true" />Spoken</span>}
                {!!message.images?.length && <PhotoGallery images={message.images} />}
                {message.generation && message.images?.[0] && <GeneratedDownload image={message.images[0]} />}
                {message.content && <div className={`max-w-full whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7 [overflow-wrap:anywhere] ${message.role === "user" ? "bg-secondary sm:max-w-[85%]" : "bg-background/60 w-full"}`}>{message.content}</div>}
                {message.status === "streaming" && !message.content && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />{message.generation ? "Generating image?" : hasHistoryPhotos ? "Looking at photos…" : "Thinking…"}</p>}
                {message.status === "stopped" && <p className="text-xs text-muted-foreground">Reply stopped.</p>}
                {message.error && <p role="alert" className="text-sm text-destructive">{message.error}</p>}
                {(message.status === "error" || message.status === "stopped") && index === chat.messages.length - 1 && <Button variant="outline" size="sm" onClick={chat.retry} disabled={chat.busy || (!message.generation && (disabled || (hasHistoryPhotos && !canSee)))}><RefreshCwIcon aria-hidden="true" />Try again</Button>}
              </article>
            ))}
            <div ref={bottom} />
          </div>
          <div className="mt-6">
            {generateMode && <p role="status" className="mb-3 text-sm text-muted-foreground">Describe an image to create with FLUX.1 Schnell. Uses Cloudflare?s daily allowance. {hasPhotos && "Remove attached photos first; generation uses your text description."}</p>}
            {!generateMode && blocked && <VisionNotice tone="warning" action={visionModel ? { label: `Use ${visionModel.id}`, onClick: () => setModel(visionModel.id) } : undefined}>{chosen ? `${chosen.id} can't see images. Switch to a model that can, or remove the photos.` : "No model that can see images is selected. Choose a vision model to send these photos."}</VisionNotice>}
            {!hasPhotos && hasHistoryPhotos && chosen && !canSee && <VisionNotice tone="info" action={visionModel ? { label: `Use ${visionModel.id}`, onClick: () => setModel(visionModel.id) } : undefined}>{chosen.id} can&apos;t see images, so it only gets a note that this chat has photos.</VisionNotice>}
            <div className="rounded-[28px] border border-border/80 bg-background/50 p-2 shadow-sm transition-shadow focus-within:border-border focus-within:shadow-md" aria-label="Chat message composer">
            <div className="px-3 pt-1"><AttachmentTray attachments={attachments} /></div>
            <label htmlFor="photo-question" className="sr-only">Ask about your photos</label>
            <Textarea ref={composerInput} id="photo-question" rows={1} value={draft} disabled={chat.busy} onChange={(e) => setDraft(e.target.value)} maxLength={generateMode ? 2048 : 20_000} placeholder={generateMode ? "Describe the image you want to generate" : "Start with a photo or a question"} className="min-h-12 max-h-60 resize-none rounded-none border-0 bg-transparent px-4 py-2 text-base leading-6 shadow-none outline-none focus-visible:border-transparent focus-visible:ring-0 md:text-base dark:bg-transparent" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
            <div className="flex items-center justify-between gap-2 px-1 pb-1">
              <div className="flex items-center gap-2">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild><Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label="Add photos" title="Add photos" disabled={chat.busy}><PlusIcon aria-hidden="true" /></Button></DropdownMenu.Trigger>
                  <DropdownMenu.Portal><DropdownMenu.Content side="top" align="start" sideOffset={8} className="z-50 w-64 rounded-xl border bg-popover p-1 shadow-lg">
                    <DropdownMenu.Item className={itemClass} onSelect={() => requestAnimationFrame(() => fileInput.current?.click())}><ImagePlusIcon className="mt-0.5 size-4" aria-hidden="true" /><span>Add photos<span className="block text-xs text-muted-foreground">JPEG, PNG, WebP or GIF · up to {limits.per_message}</span></span></DropdownMenu.Item>
                    <DropdownMenu.Item className={itemClass} onSelect={() => requestAnimationFrame(() => cameraInput.current?.click())}><CameraIcon className="mt-0.5 size-4" aria-hidden="true" /><span>Take a photo<span className="block text-xs text-muted-foreground">Uses your camera on phones and tablets</span></span></DropdownMenu.Item>
                    <DropdownMenu.Item className={itemClass} onSelect={() => { setGenerateMode(true); requestAnimationFrame(() => composerInput.current?.focus()); }}><SparklesIcon className="mt-0.5 size-4" aria-hidden="true" /><span>Generate an image<span className="block text-xs text-muted-foreground">Create from a text description</span></span></DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" /><p className="px-3 py-2 text-xs text-muted-foreground">You can also paste or drop photos.</p>
                  </DropdownMenu.Content></DropdownMenu.Portal>
                </DropdownMenu.Root>
                <Button variant={generateMode ? "secondary" : "ghost"} size="sm" onClick={() => setGenerateMode((mode) => !mode)} disabled={chat.busy || !!voiceSession} aria-pressed={generateMode} aria-label="Generate an image" title="Generate an image"><SparklesIcon aria-hidden="true" /><span className="hidden sm:inline">{generateMode ? "Image mode" : "Generate an image"}</span></Button>
                <input ref={fileInput} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={files} data-testid="photo-input" />
                <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={files} data-testid="camera-input" />
                <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">{attachments.items.length ? `${attachments.items.length} of ${limits.per_message} photos` : ""}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <DictationInput compact value={draft} onChange={setDraft} maxLength={20_000} disabled={chat.busy || !active} label="chat message" />
                <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={startVoice} disabled={chat.busy || attachments.processing || !voiceConfig} aria-label="Start voice mode" title="Start a voice conversation"><AudioLinesIcon className="size-5" aria-hidden="true" /></Button>
                {chat.busy ? <Button size="icon" className="size-10 rounded-full" onClick={chat.stop} aria-label="Stop reply" title="Stop reply"><SquareIcon className="size-4 fill-current" aria-hidden="true" /></Button> : <Button size="icon" className="size-10 rounded-full" onClick={submit} disabled={generateMode ? !chat.ready || hasPhotos || !draft.trim() || draft.trim().length > 2048 : disabled || blocked || attachments.processing || (!draft.trim() && !hasPhotos)} aria-label={generateMode ? "Generate image from description" : attachments.processing ? "Waiting for photos to be ready" : "Send message"} title="Send message"><ArrowUpIcon className="size-5" aria-hidden="true" /></Button>}
              </div>
            </div>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground" aria-live="polite">
              {chosen?.cloud ? <CloudIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : <LockKeyholeIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
              {generateMode ? "Image descriptions are sent to Cloudflare Workers AI. Generated images are saved in this browser." : chosen ? chosen.cloud ? `Photos and messages are sent to Ollama Cloud: ${chosen.id}.` : `Photos stay on this computer: ${chosen.id} runs locally.` : "Auto uses local vision models only. Cloud models must be selected explicitly."}
            </p>
            {voiceConfig?.enabled && <p className="mt-1 text-xs text-muted-foreground">Voice audio is processed by LiveKit Cloud.</p>}
            <p className="mt-1 text-xs text-muted-foreground">Images are resized to 2048 px with photo metadata removed. AI answers can make mistakes.</p>
            <p className="mt-1 text-xs text-muted-foreground">Enter to send text or photos · Shift+Enter for a new line.</p>
          </div>
          </>}
        </CardContent>
      </Card>
    </div>
  );
}
