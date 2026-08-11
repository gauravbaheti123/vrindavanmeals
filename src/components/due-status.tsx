import { Badge } from "@/components/ui/badge";
import type { LedgerStatus } from "@/lib/dues";
import { useDueThresholds, DEFAULT_DUE_THRESHOLDS, type DueThresholds } from "@/hooks/use-due-thresholds";

export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/**
 * Colour tone for an outstanding amount.
 * "high" (red) = crosses either configured threshold in Settings → Billing Engine
 * (Due Amount Threshold OR Days Overdue Threshold — whichever crosses first).
 */
export function dueTone(
  due: number,
  daysOverdue: number,
  thresholds: DueThresholds = DEFAULT_DUE_THRESHOLDS,
): "settled" | "recent" | "high" {
  if (due <= 0) return "settled";
  return due >= thresholds.amount || daysOverdue >= thresholds.days ? "high" : "recent";
}

export function StatusBadge({ status }: { status: LedgerStatus }) {
  return (
    <Badge
      variant="outline"
      className={
        status === "active"
          ? "border-success/40 bg-success/10 text-success"
          : "border-muted-foreground/30 bg-muted text-muted-foreground"
      }
    >
      {status === "active" ? "Active" : "Inactive"}
    </Badge>
  );
}

/** "₹8,450 due" / "₹0 · Paid up" / "₹0 · Settled" */
export function DueAmount({
  status,
  due,
  daysOverdue,
}: {
  status: LedgerStatus;
  due: number;
  daysOverdue: number;
}) {
  const thresholds = useDueThresholds();
  const tone = dueTone(due, daysOverdue, thresholds);
  if (tone === "settled") {
    return (
      <span className="text-sm text-muted-foreground">
        ₹0 · {status === "active" ? "Paid up" : "Settled"}
      </span>
    );
  }
  return (
    <span className={`text-sm font-semibold ${tone === "high" ? "text-destructive" : "text-warning-foreground"}`}>
      {inr(due)} due
    </span>
  );
}

/** Combined Status + Due display used across all list views. */
export function StatusDue({
  status,
  due,
  daysOverdue,
}: {
  status: LedgerStatus;
  due: number;
  daysOverdue: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={status} />
      <DueAmount status={status} due={due} daysOverdue={daysOverdue} />
    </div>
  );
}
