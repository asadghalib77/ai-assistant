"use client";

import { useEffect, useRef, useState } from "react";
import { MicIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

const errors: Record<string, string> = {
  "not-allowed": "Allow microphone access in your browser's site settings, then try Dictate again.",
  "service-not-allowed": "Your browser's speech service is unavailable. Try dictation in Chrome or Edge.",
  "audio-capture": "No microphone is available. Connect one and try again.",
  "network": "The speech service couldn't connect. Check your connection and try again.",
  "no-speech": "No speech was detected. Try again and speak clearly.",
  "language-not-supported": "Your browser doesn't support dictation in this language.",
};

/** Dictation fills a draft; callers can optionally submit after an explicit stop. */
export function DictationInput({ value, onChange, maxLength, disabled = false, label, compact = false, onStop }: {
  value: string;
  onChange: (text: string) => void;
  maxLength: number;
  disabled?: boolean;
  label: string;
  compact?: boolean;
  onStop?: (text: string) => void;
}) {
  const current = useRef({ value, onChange, maxLength, disabled, onStop });
  current.current = { value, onChange, maxLength, disabled, onStop };
  const recognition = useRef<Recognition | null>(null);
  const stoppedByUser = useRef(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const abort = () => {
    const instance = recognition.current;
    recognition.current = null;
    if (instance) {
      instance.onresult = instance.onerror = instance.onend = null;
      instance.abort();
    }
  };
  useEffect(() => {
    if (disabled) { abort(); setListening(false); setInterim(""); }
  }, [disabled]);
  useEffect(() => () => abort(), []);

  const start = () => {
    if (disabled || recognition.current) return;
    setNotice(null);
    const speechWindow = window as SpeechWindow;
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setNotice("This browser doesn't support dictation. Open this app in Chrome or Edge, or type your text.");
      return;
    }
    if (!window.isSecureContext) {
      setNotice("Microphone dictation needs HTTPS or localhost.");
      return;
    }
    const instance = new Constructor();
    stoppedByUser.current = false;
    recognition.current = instance;
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = document.documentElement.lang || "en-US";
    const saved = new Set<number>();
    let heard = false;
    let failed = false;
    instance.onresult = (event) => {
      if (recognition.current !== instance || current.current.disabled) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal || saved.has(i)) continue;
        saved.add(i);
        const text = result[0].transcript.trim();
        if (!text) continue;
        heard = true;
        const { value: draft, onChange: update, maxLength: limit } = current.current;
        const combined = `${draft}${draft && !/\s$/.test(draft) ? " " : ""}${text}`;
        const next = combined.slice(0, limit);
        current.current.value = next;
        update(next);
        if (combined.length >= limit) {
          setNotice("The text box reached its character limit. Edit the text before continuing.");
          instance.stop();
        }
      }
      setInterim(Array.from(event.results).filter((result) => !result.isFinal).map((result) => result[0].transcript).join(" "));
    };
    instance.onerror = (event) => {
      if (recognition.current !== instance) return;
      failed = true;
      if (event.error !== "aborted") setNotice(errors[event.error] ?? "Dictation couldn't finish. Try again or type your text.");
      setListening(false);
      setInterim("");
    };
    instance.onend = () => {
      if (recognition.current !== instance) return;
      recognition.current = null;
      setListening(false);
      setInterim("");
      if (!heard && !failed) setNotice("No speech was captured. Try again or type your text.");
      if (stoppedByUser.current && !failed && !current.current.disabled && current.current.value.trim()) {
        current.current.onStop?.(current.current.value);
      }
    };
    try { instance.start(); setListening(true); }
    catch {
      abort();
      setNotice("The microphone couldn't start. Check its permission and try again.");
    }
  };

  return <div className={compact ? "relative shrink-0" : "my-3 flex flex-wrap items-center gap-2"}>
    <Button type="button" variant={listening ? "secondary" : compact ? "ghost" : "outline"} size={compact ? "icon" : "sm"}
      className={compact ? "size-10 rounded-full" : undefined}
      disabled={disabled} aria-label={listening ? "Stop dictation" : `Dictate into ${label}`}
      aria-pressed={listening} title="Speech to text using your browser's speech service"
      onClick={() => {
        if (listening) { stoppedByUser.current = true; recognition.current?.stop(); }
        else start();
      }}>
      {listening ? <SquareIcon aria-hidden="true" /> : <MicIcon aria-hidden="true" />}
      {!compact && (listening ? "Stop dictation" : "Dictate")}
    </Button>
    {(!compact || listening || notice) && <span role="status" className={compact ? "absolute right-0 bottom-full z-20 mb-2 w-56 max-w-[70vw] rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-md [overflow-wrap:anywhere]" : "min-w-0 flex-1 text-xs text-muted-foreground [overflow-wrap:anywhere]"}>
      {listening ? interim || "Listening… Speak to fill this text box." : notice || "Speak to type. Review before sending."}
    </span>}
  </div>;
}
