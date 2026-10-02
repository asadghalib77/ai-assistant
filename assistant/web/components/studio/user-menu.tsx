"use client";

import { useId, useRef, useState } from "react";
import { ChevronUpIcon, HistoryIcon, ImageIcon, ImagePlusIcon, LoaderCircleIcon, RotateCcwIcon, SettingsIcon, Trash2Icon, UserRoundPenIcon, XIcon } from "lucide-react";
import { Dialog, DropdownMenu } from "radix-ui";
import { useTheme } from "next-themes";

import { HistoryPanel } from "@/components/studio/history-panel";
import type { HistoryEntry } from "@/lib/types";
import { StatusDot } from "@/components/studio/status";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APP_CONFIG } from "@/lib/config";
import { prepareProfilePhoto } from "@/lib/profile-photo";
import { toast } from "sonner";

export function UserMenu({ username, onUsernameChange, apiOnline, userPhoto, onUserPhotoChange, analyses, onOpenAnalysis, onDeleteAnalysis, onClearAnalyses, onOpenChat }: {
  username: string;
  onUsernameChange: (name: string) => void;
  apiOnline: boolean;
  analyses: HistoryEntry[];
  onOpenAnalysis: (entry: HistoryEntry) => void;
  onDeleteAnalysis: (id: string) => void;
  onClearAnalyses: () => void;
  onOpenChat: () => void;
  userPhoto: string | null;
  onUserPhotoChange: (photo: string | null) => void;
}) {
  const [panel, setPanel] = useState<"settings" | "username" | "history" | "photo" | null>(null);
  const [draft, setDraft] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const photoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { theme, setTheme } = useTheme();
  const itemClass = "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none focus:bg-accent data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground";

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button ref={trigger} type="button" aria-label={`User menu for ${username}`} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-2 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
              {userPhoto ? <img src={userPhoto} alt="Profile photo" className="size-full rounded-full object-cover" /> : Array.from(username)[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[13px] font-medium">{username}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <StatusDot status={apiOnline ? "ready" : "offline"} className="size-1.5" />
                Demo Account
              </span>
            </span>
            <ChevronUpIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content side="top" align="start" sideOffset={8} className="z-50 w-60 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
            <DropdownMenu.Item className={itemClass} onSelect={() => setPanel("history")}><HistoryIcon aria-hidden="true" />View history</DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={() => setPanel("settings")}><SettingsIcon aria-hidden="true" />Settings</DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={() => { setDraft(username); setPanel("username"); }}><UserRoundPenIcon aria-hidden="true" />Change username</DropdownMenu.Item>
            <DropdownMenu.Item disabled={uploading} className={itemClass} onSelect={() => requestAnimationFrame(() => photoInput.current?.click())}>{uploading ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : <ImagePlusIcon aria-hidden="true" />}Upload profile photo</DropdownMenu.Item>
            {userPhoto && <DropdownMenu.Item className={itemClass} onSelect={() => onUserPhotoChange(null)}><Trash2Icon aria-hidden="true" />Remove profile photo</DropdownMenu.Item>}
            {userPhoto && <DropdownMenu.Item className={itemClass} onSelect={() => setPanel("photo")}><ImageIcon aria-hidden="true" />View profile photo</DropdownMenu.Item>}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item className={itemClass} onSelect={() => onUsernameChange(APP_CONFIG.user.name)}><RotateCcwIcon aria-hidden="true" />Reset username</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden data-testid="profile-photo-input" onChange={async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setUploading(true);
        try { onUserPhotoChange(await prepareProfilePhoto(file)); toast.success("Profile photo updated."); }
        catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't upload this photo."); }
        finally { setUploading(false); }
      }} />

      <Dialog.Root open={panel !== null} onOpenChange={(open) => { if (!open) setPanel(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }} className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 text-card-foreground shadow-lg">
            <Dialog.Title className="pr-8 text-lg font-semibold">{panel === "photo" ? "Profile photo" : panel === "history" ? "View history" : panel === "settings" ? "Settings" : "Change username"}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">{panel === "photo" ? "Your profile photo is saved in this browser." : panel === "history" ? "View or delete the chats and analyses saved in this browser." : panel === "settings" ? "Choose how Sentiment Studio looks on this device." : "Your display name is saved in this browser."}</Dialog.Description>
            <Dialog.Close asChild><Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="Close dialog"><XIcon aria-hidden="true" /></Button></Dialog.Close>
            {panel === "photo" ? <div className="mt-5">{userPhoto && <img src={userPhoto} alt={`${username}'s profile photo`} className="mx-auto max-h-[55dvh] w-full rounded-xl object-contain" />}<Button variant="outline" className="mt-4 w-full" onClick={() => { onUserPhotoChange(null); setPanel(null); }}>Remove profile photo</Button></div> : panel === "history" ? <HistoryPanel analyses={analyses} onOpenAnalysis={(entry) => { setPanel(null); onOpenAnalysis(entry); }} onDeleteAnalysis={onDeleteAnalysis} onClearAnalyses={onClearAnalyses} onOpenChat={() => { setPanel(null); onOpenChat(); }} /> : panel === "settings" ? (
              <div className="mt-5 space-y-2">
                <p id={`${inputId}-theme`} className="text-sm font-medium">Appearance</p>
                <Select value={theme ?? "system"} onValueChange={setTheme}>
                  <SelectTrigger aria-labelledby={`${inputId}-theme`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="system">System</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
                </Select>
              </div>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); const name = draft.trim(); if (!name) return; onUsernameChange(name); setPanel(null); }}>
                <div className="space-y-2">
                  <label htmlFor={inputId} className="text-sm font-medium">Username</label>
                  <input id={inputId} value={draft} onChange={(event) => setDraft(event.target.value)} required maxLength={40} autoComplete="nickname" className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  <p className="text-xs text-muted-foreground">Up to 40 characters.</p>
                </div>
                <div className="flex justify-end gap-2"><Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close><Button type="submit" disabled={!draft.trim()}>Save</Button></div>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
