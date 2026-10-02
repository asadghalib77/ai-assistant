"use client";

import { useCallback, useEffect, useState } from "react";
import { request } from "@/lib/api";
import { KEYS, readStore, writeStore } from "@/lib/storage";
import type { PhotoModelsResponse } from "@/lib/types";

export function usePhotoModels(active: boolean) {
  const [data, setData] = useState<PhotoModelsResponse | null>(null);
  const [selection, setSelection] = useState("auto");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const stored = readStore<unknown>(KEYS.photoModel, "auto");
    if (typeof stored === "string") setSelection(stored);
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) writeStore(KEYS.photoModel, selection); }, [selection, loaded]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await request<PhotoModelsResponse>("/photo-models", { timeoutMs: 60_000 });
      setData(next);
      setError(null);
      setSelection((old) => old === "auto" || next.models.some((m) => m.id === old) ? old : "auto");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Can't reach Ollama.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (active) void refresh(); }, [active, refresh]);
  return {
    data, selection, select: setSelection, error, loading, refresh,
    chosen: data?.models.find((m) => m.id === (selection === "auto" ? data.default_vision : selection)),
    visionDefault: data?.models.find((m) => m.vision && !m.cloud) ?? data?.models.find((m) => m.vision),
  };
}
