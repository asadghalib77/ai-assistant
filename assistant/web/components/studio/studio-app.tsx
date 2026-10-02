"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MenuIcon, RefreshCwIcon, ServerCrashIcon } from "lucide-react";
import { toast } from "sonner";

import { AnalyzeView, type AnalysisState } from "@/components/studio/analyze-view";
import { ImageGenerationView } from "@/components/studio/image-generation-view";
import { PhotoChatView } from "@/components/studio/photo-chat-view";
import { BatchView } from "@/components/studio/batch-view";
import { ModelView } from "@/components/studio/model-view";
import { Sidebar } from "@/components/studio/sidebar";
import { ApiStatus, ModelPicker, ThemeToggle } from "@/components/studio/topbar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHistory } from "@/hooks/use-history";
import { useModels } from "@/hooks/use-models";
import { useAttachments } from "@/hooks/use-attachments";
import { usePhotoModels } from "@/hooks/use-photo-models";
import { PhotoDropZone } from "@/components/photos/drop-overlay";
import { ApiError, api, errorMessage, request as apiRequest } from "@/lib/api";
import { collectGarbage, loadImage } from "@/lib/image-store";
import { blobToBase64, DEFAULT_IMAGE_LIMITS } from "@/lib/images";
import { APP_CONFIG } from "@/lib/config";
import { isProfilePhoto } from "@/lib/profile-photo";
import { KEYS, readStore, writeStore } from "@/lib/storage";
import { GithubLink } from "@/components/studio/github-link";
import { LinkedinLink } from "@/components/studio/linkedin-link";
import type { ApiChatMessage, HistoryEntry, PhotoPredictResponse, PhotoSource, PhotoTask } from "@/lib/types";

const VIEWS = ["analyze", "batch", "model"] as const;
type View = (typeof VIEWS)[number];
const isView = (value: string): value is View => (VIEWS as readonly string[]).includes(value);

export function StudioApp() {
  const models = useModels();
  const recent = useHistory();
  const [view, setView] = useState<View>("analyze");
  const [navOpen, setNavOpen] = useState(false);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [username, setUsername] = useState<string>(APP_CONFIG.user.name);
  useEffect(() => {
    const restore = () => {
      const photo = readStore<unknown>(KEYS.userPhoto, null);
      setUserPhoto(isProfilePhoto(photo) ? photo : null);
      const saved = readStore<unknown>(KEYS.username, APP_CONFIG.user.name);
      setUsername(typeof saved === "string" && saved.trim() ? saved.trim().slice(0, 40) : APP_CONFIG.user.name);
    };
    restore();
    const sync = (event: StorageEvent) => {
      if (event.key === KEYS.username || event.key === KEYS.userPhoto || event.key === null) restore();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const changeUsername = (name: string) => {
    setUsername(name);
    writeStore(KEYS.username, name);
  };
  const [text, setText] = useState("");
  const [purpose, setPurpose] = useState<"analyze" | "chat" | "generate" | null>("analyze");
  const [chatBusy, setChatBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisState>({ phase: "idle" });
  const photoModels = usePhotoModels(view === "analyze");
  const retainedImages = new Set(recent.entries.flatMap((entry) => (entry.photo?.images ?? []).map((image) => image.id)));
  if (analysis.phase === "done") analysis.photo?.images.forEach((image) => retainedImages.add(image.id));
  const imageLimits = photoModels.data?.image_limits ?? DEFAULT_IMAGE_LIMITS;
  const attachments = useAttachments(imageLimits, retainedImages);
  const [photoTask, setPhotoTask] = useState<PhotoTask>("extract_text");
  const photoContext = useRef<{ key: string; turns: ApiChatMessage[] }>({ key: "", turns: [] });
  const photoKey = attachments.ready.map((image) => image.id).join(",");
  useEffect(() => {
    if (photoContext.current.key !== photoKey) photoContext.current = { key: photoKey, turns: [] };
  }, [photoKey]);
  useEffect(() => {
    // Keep both the existing chat's photos and the unified analysis history's photos.
    const saved = readStore<unknown>(KEYS.history, []);
    const chat = readStore<unknown>(KEYS.photoChat, []);
    const ids = new Set<string>();
    for (const entries of [saved, chat]) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const images = entry?.photo?.images ?? entry?.images;
        if (Array.isArray(images)) for (const image of images) if (typeof image?.id === "string") ids.add(image.id);
      }
    }
    void collectGarbage(ids, Date.now() - 24 * 60 * 60_000);
  }, []);
  const request = useRef<AbortController | null>(null);
  const lastRun = useRef<{ text: string; model: string; photo?: PhotoSource } | null>(null);

  const { selected, setStatus, refresh } = models;

  // ---------------------------------------------------------------- views (#batch, #model)
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      setView(isView(hash) ? hash : "analyze");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const changeView = useCallback((next: string) => {
    if (!isView(next)) return;
    setView(next);
    const url = next === "analyze" ? window.location.pathname : `#${next}`;
    window.history.replaceState(null, "", url);
  }, []);

  // ---------------------------------------------------------------- analysis
  const analyze = useCallback(
    async (value?: string, { save = true, textOnly = false, photo: previousPhoto }: { save?: boolean; textOnly?: boolean; photo?: PhotoSource } = {}) => {
      const input = value ?? text;
      const images = textOnly ? [] : attachments.ready;
      if (!input.trim() && !images.length) return;
      if (!textOnly && attachments.processing) return;
      if (images.length && (!photoModels.chosen?.vision || photoModels.error)) {
        toast.error(photoModels.error ?? "Choose a photo reader that can see images.");
        return;
      }
      if (images.length && photoTask === "question" && !input.trim()) {
        toast.error("Enter a question about the photo.");
        return;
      }
      if (!selected) {
        toast.error(models.error ?? "No model is available yet.");
        return;
      }
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      // Recorded now (not on success) so a model switch mid-request re-runs this text.
      lastRun.current = images.length ? null : { text: input, model: selected.id, photo: previousPhoto };
      setAnalysis({ phase: "running", modelReady: selected.status === "ready", readingPhotos: images.length > 0 });
      if (!images.length && selected.status !== "ready") setStatus(selected.id, "loading");

      try {
        let source = previousPhoto;
        let analyzedText = input;
        let result;
        if (images.length) {
          const encoded = await Promise.all(images.map(async (image) => {
            const blob = await loadImage(image.id);
            if (!blob) throw new Error("This photo is no longer stored in this browser. Please attach it again.");
            return { media_type: image.mediaType, data: await blobToBase64(blob) };
          }));
          if (controller.signal.aborted) return;
          const response = await apiRequest<PhotoPredictResponse>("/predict/photos", {
            method: "POST", signal: controller.signal, timeoutMs: 10 * 60_000,
            body: { text: input, images: encoded, model: selected.id, photo_model: photoModels.selection === "auto" ? null : photoModels.selection, task: photoTask, context: photoTask === "question" ? photoContext.current.turns : [], explain: true },
          });
          if (controller.signal.aborted) return;
          result = response;
          analyzedText = response.analyzed_text;
          source = { text: response.photo_text, model: response.photo_model, task: response.photo_task, latency_ms: response.photo_latency_ms, images };
          if (photoTask === "question") photoContext.current.turns = [...photoContext.current.turns, { role: "user", content: input }, { role: "assistant", content: response.photo_text }].slice(-20) as ApiChatMessage[];
        } else {
          result = await api.predict({ text: input, model: selected.id, explain: true }, controller.signal);
          if (controller.signal.aborted) return;
        }
        lastRun.current = { text: analyzedText, model: selected.id, photo: source };
        setAnalysis({ phase: "done", result, photo: source });
        setStatus(selected.id, "ready");
        if (save) {
          recent.add({ text: analyzedText, label: result.label, score: result.score, model: selected.id, photo: source });
        }
        if (images.length) {
          attachments.takeAll();
          setText("");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setAnalysis({ phase: "error", message: errorMessage(err) });
        // Resync model status: the API may be down, or the model may have failed to load.
        if (err instanceof ApiError && (err.status === 0 || err.status >= 500)) void refresh();
      } finally {
        if (request.current === controller) request.current = null;
      }
    },
    [text, selected, models.error, setStatus, refresh, recent, attachments, photoModels, photoTask],
  );

  // When the model changes, re-run the last text with the new model.
  const analyzeRef = useRef(analyze);
  analyzeRef.current = analyze;
  const selectedId = selected?.id;
  useEffect(() => {
    const last = lastRun.current;
    if (selectedId && last && last.model !== selectedId) {
      void analyzeRef.current(last.text, { save: false, textOnly: true, photo: last.photo });
    }
  }, [selectedId]);

  // ---------------------------------------------------------------- sidebar actions
  const newAnalysis = () => {
    request.current?.abort();
    lastRun.current = null;
    attachments.takeAll();
    photoContext.current = { key: "", turns: [] };
    setText("");
    setAnalysis({ phase: "idle" });
    setPurpose(null);
    setChatBusy(false);
    changeView("analyze");
    setNavOpen(false);
    requestAnimationFrame(() => document.getElementById("analyze-text")?.focus());
  };

  const openEntry = (entry: HistoryEntry) => {
    request.current?.abort();
    attachments.takeAll();
    setNavOpen(false);
    changeView("analyze");
    setText(entry.text);
    setPurpose("analyze");
    const known = models.data?.models.some((m) => m.id === entry.model);
    if (known && entry.model !== selected?.id) {
      // The model-change effect re-runs the text with the entry's model.
      lastRun.current = { text: entry.text, model: "", photo: entry.photo };
      models.select(entry.model);
    } else {
      void analyze(entry.text, { save: false, textOnly: true, photo: entry.photo });
    }
  };

  const clearHistory = () => {
    const undo = recent.clear();
    toast("History cleared.", { action: { label: "Undo", onClick: undo } });
  };

  const sidebar = (
    <Sidebar
      history={recent.entries}
      models={models.data?.models ?? []}
      apiOnline={!models.error}
      onNew={newAnalysis}
      onOpen={openEntry}
      onClear={clearHistory}
      onDeleteAnalysis={recent.remove}
      onOpenChat={() => { setNavOpen(false); changeView("analyze"); setPurpose("chat"); }}
      username={username}
      userPhoto={userPhoto}
      onUserPhotoChange={(photo) => { setUserPhoto(photo); writeStore(KEYS.userPhoto, photo); }}
      onUsernameChange={changeUsername}
    />
  );

  const offline = models.error !== null;

  return (
    <div className="flex h-dvh flex-col">
      <PhotoDropZone enabled={view === "analyze" && purpose === "analyze" && analysis.phase !== "running"} onFiles={attachments.add} limitText={`JPEG, PNG, WebP or GIF · up to ${imageLimits.per_message} photos, ${Math.round(imageLimits.max_bytes / 1024**2)} MB each`} />
      <div className="flex min-h-0 flex-1">
      <aside className="hidden w-72 shrink-0 border-r md:block">{sidebar}</aside>
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" showClose={false} className="w-72 p-0 md:hidden">
          <SheetTitle className="sr-only">History</SheetTitle>
          <SheetDescription className="sr-only">Your recent analyses</SheetDescription>
          {sidebar}
        </SheetContent>
      </Sheet>

      <Tabs value={view} onValueChange={changeView} className="flex min-w-0 flex-1 flex-col gap-0">
        <header className="flex flex-wrap items-center gap-2 border-b bg-card px-4 pt-[calc(0.875rem+env(safe-area-inset-top))] pb-3.5 sm:px-6 md:flex-nowrap">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 text-muted-foreground md:hidden"
            aria-label="Open history"
            onClick={() => setNavOpen(true)}
          >
            <MenuIcon aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1 md:flex-none">
            <ModelPicker
              models={models.data?.models ?? []}
              value={selected?.id}
              onChange={models.select}
              disabled={analysis.phase === "running" && analysis.readingPhotos}
            />
          </div>
          <div className="hidden flex-1 md:block" />
          <ApiStatus error={models.error} model={selected} device={models.data?.device} />
          <ThemeToggle />
          <TabsList className="order-last w-full md:order-none md:ml-1 md:w-auto">
            <TabsTrigger value="analyze">Analyze</TabsTrigger>
            <TabsTrigger value="batch">Batch</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
          </TabsList>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 pt-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:pt-10">
            {offline && (
              <div
                role="alert"
                className="flex flex-wrap items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
              >
                <ServerCrashIcon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">Can&apos;t reach the API</p>
                  <p className="text-muted-foreground">
                    Start it with <code className="font-mono">cd api && uv run fastapi dev</code>. This
                    page reconnects on its own.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refresh()}>
                  <RefreshCwIcon aria-hidden="true" />
                  Retry now
                </Button>
              </div>
            )}

            <TabsContent value="analyze" forceMount className="data-[state=inactive]:hidden">
              <div className="mb-5 rounded-xl border bg-card p-4 text-center">
                <p className="mb-3 text-sm font-medium">What would you like to do?</p>
                <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Choose an action">
                  <Button variant={purpose === "analyze" ? "default" : "outline"} aria-pressed={purpose === "analyze"} disabled={chatBusy || analysis.phase === "running"} onClick={() => { setPurpose("analyze"); }}>Analyze text / photos</Button>
                  <Button variant={purpose === "chat" ? "default" : "outline"} aria-pressed={purpose === "chat"} disabled={chatBusy || analysis.phase === "running"} onClick={() => { setPurpose("chat"); }}>Chat / ask questions</Button>
                  <Button variant={purpose === "generate" ? "default" : "outline"} aria-pressed={purpose === "generate"} disabled={chatBusy || analysis.phase === "running"} onClick={() => setPurpose("generate")}>Generate an image</Button>
                </div>
                {!purpose && <p className="mt-3 text-xs text-muted-foreground">Choose sentiment analysis, chat, or image generation to get started.</p>}
              </div>
              <div hidden={purpose !== "analyze"}>
              <AnalyzeView
                active={view === "analyze" && purpose === "analyze"}
                text={text}
                onTextChange={setText}
                onAnalyze={(value) => void analyze(value)}
                analysis={analysis}
                model={selected}
                models={models.data?.models ?? []}
                limits={models.data?.limits ?? null}
                attachments={attachments}
                photoModels={photoModels}
                photoTask={photoTask}
                onPhotoTaskChange={setPhotoTask}
              />
              </div>
              {purpose === "chat" && <PhotoChatView active={view === "analyze"} sharedAttachments={attachments} draft={text} onDraftChange={setText} onBusyChange={setChatBusy} />}
              <div hidden={purpose !== "generate"}><ImageGenerationView /></div>
            </TabsContent>
            <TabsContent value="batch" forceMount className="data-[state=inactive]:hidden">
              <BatchView
                model={selected}
                limits={models.data?.limits ?? null}
                onModelReady={(id) => setStatus(id, "ready")}
              />
            </TabsContent>
            <TabsContent value="model" forceMount className="data-[state=inactive]:hidden">
              <ModelView
                data={models.data}
                selected={selected}
                onSelect={(id) => {
                  models.select(id);
                  toast(`Using ${models.data?.models.find((m) => m.id === id)?.name ?? id}.`);
                }}
                onStatus={setStatus}
                onRefresh={() => void refresh()}
              />
            </TabsContent>
          </div>
        </main>
      </Tabs>
      </div>
      <footer className="flex shrink-0 justify-center border-t bg-card py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <nav aria-label="Social profiles" className="flex items-center gap-3">
          <GithubLink />
          <LinkedinLink />
        </nav>
      </footer>
    </div>
  );
}
