"use client";

import { useRef } from "react";
import { CameraIcon, CloudIcon, ImagePlusIcon, LockKeyholeIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { AttachmentTray } from "@/components/photos/attachment-tray";
import { VisionNotice } from "@/components/photos/vision-notice";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UseAttachments } from "@/hooks/use-attachments";
import type { usePhotoModels } from "@/hooks/use-photo-models";
import { ACCEPT_ATTR } from "@/lib/images";
import type { PhotoTask } from "@/lib/types";

export function PhotoInput({ attachments, models, task, onTaskChange, disabled }: {
  attachments: UseAttachments;
  models: ReturnType<typeof usePhotoModels>;
  task: PhotoTask;
  onTaskChange: (task: PhotoTask) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const hasPhotos = attachments.items.length > 0;
  const onFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && !disabled) attachments.add(Array.from(event.target.files));
    event.target.value = "";
  };
  const itemClass = "flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-accent";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild><Button type="button" variant="outline" aria-label="Add photos" disabled={disabled}><PlusIcon aria-hidden="true" />Add photos</Button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content sideOffset={8} align="start" className="z-50 w-64 rounded-xl border bg-popover p-1 shadow-lg">
            <DropdownMenu.Item className={itemClass} onSelect={() => requestAnimationFrame(() => input.current?.click())}><ImagePlusIcon className="mt-0.5 size-4" aria-hidden="true" /><span>Add photos<span className="block text-xs text-muted-foreground">JPEG, PNG, WebP or GIF · up to {models.data?.image_limits.per_message ?? 5}</span></span></DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={() => requestAnimationFrame(() => camera.current?.click())}><CameraIcon className="mt-0.5 size-4" aria-hidden="true" /><span>Take a photo<span className="block text-xs text-muted-foreground">Uses your camera on phones and tablets</span></span></DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-border" /><p className="px-3 py-2 text-xs text-muted-foreground">You can also paste or drop photos.</p>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
        <input ref={input} type="file" accept={ACCEPT_ATTR} hidden multiple onChange={onFiles} data-testid="photo-input" />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} data-testid="camera-input" />
        <span className="text-xs text-muted-foreground" aria-live="polite">{hasPhotos ? `${attachments.items.length} of ${models.data?.image_limits.per_message ?? 5} photos` : "Or paste / drop a photo"}</span>
      </div>
      <AttachmentTray attachments={attachments} />
      {hasPhotos && (
        <div className="space-y-3 rounded-xl border bg-background/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">Photo task</span>
            <Select value={task} onValueChange={(v) => onTaskChange(v as PhotoTask)} disabled={disabled}>
              <SelectTrigger aria-label="Photo task" className="w-full sm:w-auto"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="extract_text">Read text</SelectItem><SelectItem value="describe">Describe photo</SelectItem><SelectItem value="question">Ask a question</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">Photo reader</span>
            <Select value={models.selection} onValueChange={models.select} disabled={disabled || models.loading}>
              <SelectTrigger aria-label="Photo reader model" className="w-full min-w-0 max-w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="auto">Auto · local vision models</SelectItem>{models.data?.models.map((m) => <SelectItem key={m.id} value={m.id}>{m.id} · {m.cloud ? "Cloud" : "Local"} · {m.vision ? "Sees images" : "Text only"}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => void models.refresh()} disabled={disabled || models.loading} aria-label="Refresh photo models"><RefreshCwIcon className={models.loading ? "animate-spin" : ""} aria-hidden="true" />Refresh</Button>
          </div>
          {models.error && <p role="alert" className="text-xs text-destructive">{models.error}</p>}
          {!models.error && !models.loading && !models.chosen?.vision && <VisionNotice tone="warning" action={models.visionDefault ? { label: `Use ${models.visionDefault.id}`, onClick: () => models.select(models.visionDefault!.id) } : undefined}>{models.chosen ? `${models.chosen.id} can't see images. Switch to a model that can, or remove the photos.` : "No local vision model is available. Install a local vision model or explicitly choose Ollama Cloud, then refresh."}</VisionNotice>}
          <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground" aria-live="polite">{models.chosen?.cloud ? <CloudIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : <LockKeyholeIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}{models.chosen ? models.chosen.cloud ? `Photos are sent to Ollama Cloud: ${models.chosen.id}. Sentiment is scored by your selected classifier.` : `Photos stay on this computer: ${models.chosen.id} runs locally.` : "Auto uses local vision models only. Cloud models must be selected explicitly."}</p>
          <p className="text-xs leading-5 text-muted-foreground">{task === "question" ? "Enter a question below. Sentiment is scored on the photo answer, not your question. You can ask follow-up questions with the same photos." : task === "describe" ? "The photo description and any text you enter below are analyzed together." : "Visible photo text and any text you enter below are analyzed together."}</p>
        </div>
      )}
    </div>
  );
}
