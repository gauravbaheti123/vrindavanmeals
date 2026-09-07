import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { refreshActiveQueries } from "@/lib/refresh";

/**
 * Refreshes on-screen data when the app comes back to the foreground.
 *
 * Browsers fire `focus`/`visibilitychange`, but the Android WebView inside the
 * Capacitor shell does not reliably fire them on app resume — so we also listen
 * to Capacitor's native `resume` event when running as an installed app.
 */
export function useAppRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    try {
      await refreshActiveQueries(qc);
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  }, [qc]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onFocus = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    let removeNative: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor?.isNativePlatform?.()) return;
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("resume", () => void refresh());
        const stateHandle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void refresh();
        });
        if (cancelled) {
          void handle.remove();
          void stateHandle.remove();
          return;
        }
        removeNative = () => {
          void handle.remove();
          void stateHandle.remove();
        };
      } catch {
        /* not running inside the native shell — web listeners are enough */
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      removeNative?.();
    };
  }, [refresh]);

  return { refresh, refreshing };
}
