"use client";

import { ChartNoAxesColumnIncreasingIcon, LayersIcon, LoaderCircleIcon, RefreshCwIcon, ScanTextIcon, TriangleAlertIcon } from "lucide-react";

import { Eyebrow, ResultView } from "@/components/studio/result-view";
import { PhotoInput } from "@/components/photos/photo-input";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import type { UseAttachments } from "@/hooks/use-attachments";
import type { usePhotoModels } from "@/hooks/use-photo-models";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EXAMPLES } from "@/lib/config";
import { count, duration, wordCount } from "@/lib/format";
import type { Limits, ModelInfo, PhotoSource, PhotoTask, PredictResponse } from "@/lib/types";

const SPECIAL_TOKENS = new Set(["[CLS]", "[SEP]", "[PAD]", "<s>", "</s>", "<pad>"]);

export type AnalysisState =
  | { phase: "idle" }
  | { phase: "running"; modelReady: boolean; readingPhotos?: boolean }
  | { phase: "done"; result: PredictResponse; photo?: PhotoSource }
  | { phase: "error"; message: string };

export function AnalyzeView({
  text,
  onTextChange,
  onAnalyze,
  analysis,
  model,
  models,
  limits,
  attachments,
  photoModels,
  photoTask,
  onPhotoTaskChange,
}: {
  text: string;
  onTextChange: (text: string) => void;
  onAnalyze: (text?: string) => void;
  analysis: AnalysisState;
  model: ModelInfo | null;
  models: ModelInfo[];
  limits: Limits | null;
  attachments: UseAttachments;
  photoModels: ReturnType<typeof usePhotoModels>;
  photoTask: PhotoTask;
  onPhotoTaskChange: (task: PhotoTask) => void;
}) {
  const maxChars = limits?.max_text_chars ?? 5000;
  const running = analysis.phase === "running";
  const examples = EXAMPLES[model?.domain ?? "Topic"] ?? EXAMPLES.Topic;
  const result = analysis.phase === "done" ? analysis.result : null;
  const photo = analysis.phase === "done" ? analysis.photo : undefined;
  const hasPhotos = attachments.items.length > 0;
  const photoBlocked = hasPhotos && (attachments.processing || photoModels.loading || !!photoModels.error || !photoModels.chosen?.vision);
  const canSubmit = !running && !photoBlocked && (!!text.trim() || hasPhotos) && !(hasPhotos && photoTask === "question" && !text.trim());

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Understand the sentiment</p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Every text tells a story.</h1>
          <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
            Turn reviews, posts, headlines, or uploaded photos into clear insights. Explore the sentiment,
            compare probabilities, and see the words behind the result.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
          <LayersIcon className="size-3.5" aria-hidden="true" />
          {models.length ? `${models.length} models available` : "Connecting to models"}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5"><ScanTextIcon className="size-4 text-muted-foreground" aria-hidden="true" />Your text &amp; photos</CardTitle>
            {!hasPhotos && <div className="flex flex-wrap gap-1.5" aria-label="Examples">
              {examples.map((example) => (
                <button
                  key={example.name}
                  type="button"
                  onClick={() => {
                    onTextChange(example.text);
                    onAnalyze(example.text);
                  }}
                  className="rounded-full border bg-secondary/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {example.name}
                </button>
              ))}
            </div>}
          </CardHeader>
          <CardContent>
            <PhotoInput attachments={attachments} models={photoModels} task={photoTask} onTaskChange={onPhotoTaskChange} disabled={running} />
            <label htmlFor="analyze-text" className="sr-only">
              Text to analyze
            </label>
            <Textarea
              id="analyze-text"
              value={text}
              maxLength={maxChars}
              disabled={running}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (canSubmit) onAnalyze();
                }
              }}
              placeholder="Type or paste a review, a post, a headline…"
              className="max-h-96 min-h-56 resize-y rounded-xl bg-background/50 p-4 text-[15px] leading-relaxed md:text-[15px]"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular">
                <span>
                  {count(text.length)} / {count(maxChars)} characters
                </span>
                <span>{count(wordCount(text))} words</span>
                <span>First {limits?.max_length ?? 512} tokens are analyzed</span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { onTextChange(""); attachments.items.forEach((item) => attachments.remove(item.id)); }} disabled={running || (!text && !hasPhotos)}>
                  Clear
                </Button>
                <Button onClick={() => onAnalyze()} disabled={!canSubmit}>
                  {running && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
                  {running ? "Analyzing" : "Analyze"}
                  {!running && (
                    <kbd className="hidden font-mono text-[11px] opacity-60 sm:inline">Enter ↵</kbd>
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Enter to submit text or photos · Shift+Enter for a new line.</p>
          </CardContent>
        </Card>

        <Card className="min-w-0" aria-live="polite">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5"><ChartNoAxesColumnIncreasingIcon className="size-4 text-muted-foreground" aria-hidden="true" />Sentiment insights</CardTitle>
            {result && (
              <div className="flex flex-wrap gap-1.5">
                <Chip title={result.model}>
                  {models.find((m) => m.id === result.model)?.name ?? result.model}
                </Chip>
                <Chip title="Inference time">{duration(result.latency_ms)}</Chip>
                <Chip title="Tokens">{result.num_tokens} tokens</Chip>
                <Chip title="Device" mono>
                  {result.device}
                </Chip>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {analysis.phase === "idle" && (
              <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-background/50 px-4 py-8 text-center text-muted-foreground">
                <span className="grid size-14 place-items-center rounded-2xl border bg-card shadow-xs"><ChartNoAxesColumnIncreasingIcon className="size-6" aria-hidden="true" /></span>
                <p className="text-base font-medium text-foreground">A little text. A clearer picture.</p>
                <p className="max-w-72 text-sm leading-relaxed">
                  Enter a text and press Analyze, or pick an example to see how {model?.name ?? "the model"} reads it.
                </p>
              </div>
            )}
            {analysis.phase === "running" &&
              (analysis.readingPhotos ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center"><LoaderCircleIcon className="size-7 animate-spin text-muted-foreground" aria-hidden="true" /><p className="font-medium">Reading photos and analyzing sentiment…</p><p className="max-w-80 text-sm text-muted-foreground">The photo reader prepares the text, then {model?.name ?? "your sentiment model"} scores it.</p></div>
              ) : analysis.modelReady ? (
                <ResultSkeleton />
              ) : (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <LoaderCircleIcon className="size-7 animate-spin text-muted-foreground" aria-hidden="true" />
                  <p className="font-medium">Loading {model?.name ?? "the model"}…</p>
                  <p className="max-w-80 text-sm text-muted-foreground">
                    The first run downloads the model from Hugging Face. This can take a minute;
                    later requests are fast.
                  </p>
                </div>
              ))}
            {analysis.phase === "error" && (
              <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="flex gap-2 text-sm">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  {analysis.message}
                </p>
                <Button variant="outline" size="sm" onClick={() => onAnalyze()}>
                  <RefreshCwIcon aria-hidden="true" />
                  Try again
                </Button>
              </div>
            )}
            {result && (
              <>
              {photo && <details className="rounded-xl border bg-background/50 p-3" open>
                <summary className="cursor-pointer text-sm font-medium">{photo.task === "extract_text" ? "Text read from photos" : photo.task === "describe" ? "Photo description" : "Photo answer"}</summary>
                <p className="mt-2 text-xs text-muted-foreground">Read by {photo.model}. The sentiment scores describe the text below{photo.task === "question" ? "." : " and any additional text you entered."}</p>
                <p className="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{photo.text}</p>
                <details className="mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">Source photos</summary><div className="mt-2"><PhotoGallery images={photo.images} /></div></details>
              </details>}
              <ResultView
                result={result}
                lowConfidence={limits?.low_confidence ?? 0.6}
                specialTokens={SPECIAL_TOKENS}
              />
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 rounded-2xl border bg-card/60 p-5 sm:grid-cols-3" aria-label="How to read your results">
        {[
          { title: "Sentiment", description: "The label that best matches the tone of your text." },
          { title: "Probabilities", description: "Compare how strongly the model scores each class." },
          { title: "Word influence", description: "Explore which words shaped the prediction." },
        ].map((item, index) => (
          <div key={item.title} className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg border bg-card font-mono text-[11px] text-muted-foreground">0{index + 1}</span>
            <div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ children, title, mono }: { children: React.ReactNode; title: string; mono?: boolean }) {
  return (
    <span
      title={title}
      className={
        "inline-flex h-7 items-center rounded-full border px-2.5 text-xs text-muted-foreground tabular " +
        (mono ? "font-mono" : "")
      }
    >
      {children}
    </span>
  );
}

function ResultSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-label="Analyzing">
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Eyebrow>Class probabilities</Eyebrow>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
      <div className="flex flex-col gap-2">
        <Eyebrow>Word influence</Eyebrow>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
