import { anySignal, timeoutSignal } from "@/lib/api";
import { loadImage } from "@/lib/image-store";
import { blobToBase64, textWithPhotoNote } from "@/lib/images";
import type { ApiChatMessage, ChatMessage, ImageLimits } from "@/lib/types";

/** Keep the newest photos within the budget; older photos become a text note. */
export async function toApiMessages(messages: ChatMessage[], limits: ImageLimits, vision: boolean): Promise<ApiChatMessage[]> {
  let budget = limits.per_request;
  const result: ApiChatMessage[] = [];
  for (const message of [...messages].slice(-99).reverse()) {
    if (message.role === "assistant" && message.status !== "done") continue;
    const images: NonNullable<ApiChatMessage["images"]> = [];
    let omitted = 0;
    for (const image of [...(message.images ?? [])].reverse()) {
      if (!vision || budget <= 0 || images.length >= limits.per_message || image.size > limits.max_bytes) {
        omitted++;
        continue;
      }
      const blob = await loadImage(image.id);
      if (!blob) {
        // Don't pretend to answer about a newly sent photo that is unavailable.
        if (message === messages[messages.length - 1]) throw new Error("This photo is no longer stored in this browser. Please attach it again.");
        omitted++;
        continue;
      }
      images.unshift({ media_type: image.mediaType, data: await blobToBase64(blob) });
      budget--;
    }
    const content = omitted ? textWithPhotoNote({ content: message.content, images: (message.images ?? []).slice(0, omitted) }) : message.content;
    if (content.trim() || images.length) result.unshift({ role: message.role, content: content.slice(0, 20_000), ...(images.length ? { images } : {}) });
  }
  return result;
}

export async function streamPhotoChat(model: string | null, messages: ApiChatMessage[], signal: AbortSignal, onToken: (value: string) => void, onModel: (model: string) => void): Promise<void> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE ?? "/api"}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
    signal: anySignal([signal, timeoutSignal(10 * 60_000)]),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d) => d.msg).join(". ") : "The API could not answer. Check that it is running.";
    throw new Error(message);
  }
  if (!response.body) throw new Error("No response stream was received.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let done = false;
  try {
    while (true) {
      const part = await reader.read();
      pending += decoder.decode(part.value, { stream: !part.done });
      const frames = pending.split("\n\n");
      pending = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((line) => line.startsWith("data: "));
        if (!line) continue;
        const value = JSON.parse(line.slice(6));
        if (value.type === "error") throw new Error(value.message);
        if (value.type === "model") onModel(value.model);
        if (value.type === "token") onToken(value.content);
        if (value.type === "done") done = true;
      }
      if (part.done) break;
    }
    if (!done) throw new Error("The reply ended early. Please try again.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
