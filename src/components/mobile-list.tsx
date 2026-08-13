import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Wrapper that shows its children only on phones (tables are hidden there). */
export function MobileOnly({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("md:hidden", className)}>{children}</div>;
}

/** Wrapper that hides its children on phones (used around wide tables). */
export function DesktopOnly({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("hidden md:block", className)}>{children}</div>;
}

/** One stacked card per table row. */
export function MobileCard({
  title,
  subtitle,
  right,
  meta,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  meta?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{title}</div>
          {subtitle ? <div className="text-xs text-muted-foreground truncate">{subtitle}</div> : null}
        </div>
        {right ? <div className="shrink-0 text-right">{right}</div> : null}
      </div>
      {meta?.length ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {meta.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="uppercase tracking-wide text-[10px]">{m.label}</dt>
              <dd className="text-foreground truncate">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
    </div>
  );
}

export function MobileCardList({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

export function MobileEmpty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">{children}</div>;
}
