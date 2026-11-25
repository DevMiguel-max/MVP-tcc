"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Hook que busca dados de uma URL a cada `intervalMs` milissegundos.
 * Pausa quando a aba está oculta para economizar recursos.
 */
export function usePolling<T>(url: string, intervalMs = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    }
  }, [url]);

  useEffect(() => {
    let running = true;

    const tick = async () => {
      if (!running) return;
      await fetchData();
      if (running) {
        timeoutRef.current = setTimeout(tick, intervalMs);
      }
    };

    tick();

    const onVisChange = () => {
      if (document.hidden) {
        clearTimeout(timeoutRef.current);
      } else {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisChange);

    return () => {
      running = false;
      clearTimeout(timeoutRef.current);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [fetchData, intervalMs]);

  return { data, error, refetch: fetchData };
}
