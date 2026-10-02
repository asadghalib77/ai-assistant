"use client";

import { useEffect, useRef, useState } from "react";

import { uid } from "@/lib/helpers";
import { collectGarbage } from "@/lib/image-store";
import { toApiMessages, streamPhotoChat } from "@/lib/photo-chat";
import { KEYS, readStore, writeStore } from "@/lib/storage";
import type { ChatImage, ChatMessage, ImageLimits } from "@/lib/types";

function restoreMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((m): m is ChatMessage =>
    m && typeof m.id === "string" && ["user", "assistant"].includes(m.role) && typeof m.content === "string" &&
    (!m.images || (Array.isArray(m.images) && m.images.every((i: ChatImage) => i && typeof i.id === "string" && typeof i.name === "string" && typeof i.size === "number" && typeof i.width === "number" && typeof i.height === "number" && ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(i.mediaType))))
  ).slice(-100).map((m) => m.status === "streaming" ? { ...m, status: "stopped" } : m);
}

export function usePhotoChat(model: string | null, limits: ImageLimits, canSee: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = useRef<ChatMessage[]>([]);
  const active = useRef<AbortController | null>(null);

  const commit = (next: ChatMessage[]) => {
    current.current = next;
    setMessages(next);
  };
  useEffect(() => {
    const stored = restoreMessages(readStore<unknown>(KEYS.photoChat, []));
    current.current = stored;
    setMessages(stored);
    setReady(true);
    const retained = new Set(stored.flatMap((m) => (m.images ?? []).map((i) => i.id)));
    const analyses = readStore<unknown>(KEYS.history, []);
    if (Array.isArray(analyses)) for (const entry of analyses) {
      if (Array.isArray(entry?.photo?.images)) for (const image of entry.photo.images) {
        if (typeof image?.id === "string") retained.add(image.id);
      }
    }
    void collectGarbage(retained, Date.now() - 24 * 60 * 60_000);
    return () => { active.current?.abort(); };
  }, []);
  useEffect(() => { if (ready) writeStore(KEYS.photoChat, messages); }, [messages, ready]);

  const run = async (history: ChatMessage[]) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    const reply: ChatMessage = { id: uid(), role: "assistant", content: "", status: "streaming" };
    commit([...history, reply]);
    const update = (values: Partial<ChatMessage>) => commit(current.current.map((m) => m.id === reply.id ? { ...m, ...values } : m));
    try {
      const payload = await toApiMessages(history, limits, canSee);
      if (controller.signal.aborted) { update({ status: "stopped" }); return; }
      let answer = "";
      await streamPhotoChat(model, payload, controller.signal, (token) => {
        answer += token;
        update({ content: answer });
      }, (model) => update({ model }));
      update({ status: "done" });
    } catch (err) {
      if (controller.signal.aborted) update({ status: "stopped" });
      else update({ status: "error", error: err instanceof Error ? err.message : "Couldn't finish the reply. Try again." });
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  return {
    messages, busy, ready,
    send: (content: string, images: ChatImage[]) => {
      if (!ready || active.current || (!content.trim() && !images.length)) return;
      const user: ChatMessage = { id: uid(), role: "user", content: content.trim(), ...(images.length ? { images } : {}) };
      void run([...current.current.slice(-98), user]);
    },
    retry: () => {
      const history = [...current.current];
      while (history.length && history[history.length - 1].role !== "user") history.pop();
      if (history.length) void run(history);
    },
    stop: () => active.current?.abort(),
    clear: () => { if (!active.current) commit([]); },
  };
}
