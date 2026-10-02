"use client";

import Image from "next/image";
import { PlusIcon } from "lucide-react";

import { LabelPill } from "@/components/studio/label-pill";
import { UserMenu } from "@/components/studio/user-menu";
import { Button } from "@/components/ui/button";
import { APP_CONFIG } from "@/lib/config";
import { pct, timeAgo } from "@/lib/format";
import type { HistoryEntry, ModelInfo } from "@/lib/types";

export function Sidebar({
  history,
  models,
  apiOnline,
  onNew,
  onOpen,
  onClear,
  onDeleteAnalysis,
  onOpenChat,
  username,
  onUsernameChange,
  userPhoto,
  onUserPhotoChange,
}: {
  history: HistoryEntry[];
  models: ModelInfo[];
  apiOnline: boolean;
  onNew: () => void;
  onOpen: (entry: HistoryEntry) => void;
  onClear: () => void;
  onDeleteAnalysis: (id: string) => void;
  onOpenChat: () => void;
  username: string;
  onUsernameChange: (name: string) => void;
  userPhoto: string | null;
  onUserPhotoChange: (photo: string | null) => void;
}) {
  const nameOf = (id: string) => models.find((m) => m.id === id)?.name ?? id.split("/").pop();

  return (
    <div className="flex h-full flex-col gap-3 bg-sidebar px-3 pt-[calc(0.875rem+env(safe-area-inset-top))] pb-3">
      <button type="button" onClick={onNew} aria-label={`${APP_CONFIG.appName} home`} className="flex items-center gap-2.5 rounded-lg px-1.5 pb-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Image src="/ss-logo.svg" alt="SS" width={40} height={40} className="size-10 shrink-0 rounded-xl shadow-sm" />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight">{APP_CONFIG.appName}</p>
          <p className="mt-1 text-[11px] font-medium tracking-wide text-muted-foreground">Test Project</p>
        </div>
      </button>

      <Button variant="outline" className="justify-center" onClick={onNew}>
        <PlusIcon aria-hidden="true" />
        New analysis
      </Button>

      <div className="flex items-center justify-between px-2 pt-1">
        <h2 className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Recent
        </h2>
        {history.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear analysis history"
            className="rounded px-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear history
          </button>
        )}
      </div>

      <nav aria-label="Recent analyses" className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1">
        {history.length === 0 ? (
          <p className="px-2 py-1 text-sm text-muted-foreground">Texts you analyze appear here.</p>
        ) : (
          history.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onOpen(entry)}
              className="flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none"
            >
              <span className="truncate text-[13px]">{entry.text}</span>
              <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                <LabelPill label={entry.label} className="text-[11px] font-normal text-foreground" />
                <span className="tabular">{pct(entry.score, 0)}</span>
                <span className="truncate">{nameOf(entry.model)}</span>
                <span className="ml-auto shrink-0">{timeAgo(entry.at)}</span>
              </span>
            </button>
          ))
        )}
      </nav>

      <div className="border-t pt-2">
        <UserMenu analyses={history} onOpenAnalysis={onOpen} onDeleteAnalysis={onDeleteAnalysis} onClearAnalyses={onClear} onOpenChat={onOpenChat} userPhoto={userPhoto} onUserPhotoChange={onUserPhotoChange} username={username} onUsernameChange={onUsernameChange} apiOnline={apiOnline} />
      </div>
    </div>
  );
}
