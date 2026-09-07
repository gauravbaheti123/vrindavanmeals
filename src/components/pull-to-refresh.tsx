import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { useAppRefresh } from "@/hooks/use-app-refresh";
import { cn } from "@/lib/utils";

const TRIGGER = 70;
const MAX_PULL = 110;

/**
 * Native-feeling swipe-down-to-refresh for touch devices (mobile web, PWA and
 * the Android shell). Only engages when the page is already scrolled to the top.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { refresh, refreshing } = useAppRefresh();
  const [pull, setPull] = useState(0);
  const startY = useRef<number | null>(null);
  const active = useRef(false);

  useEffect(() => {
    const scrollTop = () => window.scrollY || document.documentElement.scrollTop || 0;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || scrollTop() > 0 || refreshing) return;
      startY.current = e.touches[0].clientY;
      active.current = false;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0 || scrollTop() > 0) {
        if (active.current) setPull(0);
        startY.current = null;
        active.current = false;
        return;
      }
      active.current = true;
      // Rubber-band resistance
      setPull(Math.min(MAX_PULL, delta * 0.5));
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      const distance = pullRef.current;
      startY.current = null;
      active.current = false;
      if (distance >= TRIGGER) {
        setPull(TRIGGER);
        void refresh().finally(() => setPull(0));
      } else {
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refresh, refreshing]);

  const pullRef = useRef(0);
  pullRef.current = pull;

  const showing = pull > 0 || refreshing;

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: showing ? Math.max(pull, refreshing ? TRIGGER : 0) : 0 }}
      >
        <div className="mt-2 h-9 w-9 rounded-full bg-card border shadow grid place-items-center">
          <RefreshCw
            className={cn("h-4 w-4 text-primary", refreshing && "animate-spin")}
            style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}
          />
        </div>
      </div>
      <div
        style={{ transform: showing ? `translateY(${Math.max(pull, refreshing ? TRIGGER / 2 : 0)}px)` : undefined }}
        className="transition-transform duration-150"
      >
        {children}
      </div>
    </div>
  );
}
