import { Badge } from "@/components/ui/badge";
import type { LedgerStatus } from "@/lib/dues";

export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Colour tone for an outstanding amount, based on how long it has been overdue. */
export function dueTone(due: number, daysOverdue: number): "settled" | "recent" | "old" {
  if (due <= 0) return "settled";
  return daysOverdue >= 30 ? "old" : "recent";
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
  const tone = dueTone(due, daysOverdue);
  if (tone === "settled") {
    return (
      <span className="text-sm text-muted-foreground">
        ₹0 · {status === "active" ? "Paid up" : "Settled"}
      </span>
    );
  }
  return (
    <span className={`text-sm font-semibold ${tone === "old" ? "text-destructive" : "text-warning-foreground"}`}>
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
