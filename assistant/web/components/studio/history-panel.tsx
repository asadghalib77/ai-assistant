"use client";

import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { KEYS, readStore, writeStore } from "@/lib/storage";
import type { ChatMessage, HistoryEntry } from "@/lib/types";

function savedChat(): ChatMessage[] {
  const stored = readStore<unknown>(KEYS.photoChat, []);
  return Array.isArray(stored) ? stored.filter((m) => m && typeof m.id === "string" && typeof m.content === "string" && ["user", "assistant"].includes(m.role)) : [];
}

export function HistoryPanel({ analyses, onOpenAnalysis, onDeleteAnalysis, onClearAnalyses, onOpenChat }: {
  analyses: HistoryEntry[];
  onOpenAnalysis: (entry: HistoryEntry) => void;
  onDeleteAnalysis: (id: string) => void;
  onClearAnalyses: () => void;
  onOpenChat: () => void;
}) {
  const [chat, setChat] = useState<ChatMessage[]>([]);
  useEffect(() => {
    const refresh = () => setChat(savedChat());
    refresh();
    const local = (event: Event) => { if ((event as CustomEvent<string>).detail === KEYS.photoChat) refresh(); };
    const otherTab = (event: StorageEvent) => { if (event.key === KEYS.photoChat || event.key === null) refresh(); };
    window.addEventListener("assistant:store-updated", local);
    window.addEventListener("storage", otherTab);
    return () => { window.removeEventListener("assistant:store-updated", local); window.removeEventListener("storage", otherTab); };
  }, []);
  const deleteChat = (id?: string) => {
    const next = id ? savedChat().filter((m) => m.id !== id) : [];
    writeStore(KEYS.photoChat, next);
    window.dispatchEvent(new Event("assistant:chat-deleted"));
  };

  return <div className="mt-5 max-h-[60dvh] space-y-6 overflow-y-auto pr-1">
    <section aria-label="Chat history">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Chat history <span className="font-normal text-muted-foreground">({chat.length})</span></h3>
        <Button variant="ghost" size="sm" disabled={!chat.length} onClick={() => deleteChat()} aria-label="Clear saved chat history">Clear all</Button>
      </div>
      {!chat.length ? <p className="text-sm text-muted-foreground">No saved chat messages.</p> : <>
        <Button variant="outline" size="sm" className="mb-3" onClick={onOpenChat}>Open chat</Button>
        <ul className="space-y-2">{chat.map((message) => <li key={message.id} className="flex items-start gap-2 rounded-lg border p-3">
          <div className="min-w-0 flex-1"><p className="mb-1 text-xs font-medium text-muted-foreground">{message.role === "user" ? "You" : "Assistant"}{message.voice ? " · Spoken" : ""}</p><p className="line-clamp-3 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{message.content || "Photo message"}</p>{!!message.images?.length && <div className="mt-2"><PhotoGallery images={message.images} /></div>}</div>
          <Button variant="ghost" size="icon" aria-label={`Delete chat message ${message.id}`} onClick={() => deleteChat(message.id)}><Trash2Icon className="size-4" aria-hidden="true" /></Button>
        </li>)}</ul>
      </>}
    </section>
    <section aria-label="Analysis history">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Analysis history <span className="font-normal text-muted-foreground">({analyses.length})</span></h3>
        <Button variant="ghost" size="sm" disabled={!analyses.length} onClick={onClearAnalyses} aria-label="Clear saved analysis history">Clear all</Button>
      </div>
      {!analyses.length ? <p className="text-sm text-muted-foreground">No saved analyses.</p> : <ul className="space-y-2">{analyses.map((entry) => <li key={entry.id} className="flex items-start gap-2 rounded-lg border p-3">
        <div className="min-w-0 flex-1"><button className="w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpenAnalysis(entry)}><p className="line-clamp-3 text-sm [overflow-wrap:anywhere]">{entry.text}</p><p className="mt-1 text-xs text-muted-foreground">{entry.label} · {new Date(entry.at).toLocaleDateString()}</p></button>{!!entry.photo?.images?.length && <div className="mt-2"><PhotoGallery images={entry.photo.images} /></div>}</div>
        <Button variant="ghost" size="icon" aria-label={`Delete analysis ${entry.id}`} onClick={() => onDeleteAnalysis(entry.id)}><Trash2Icon className="size-4" aria-hidden="true" /></Button>
      </li>)}</ul>}
    </section>
  </div>;
}
