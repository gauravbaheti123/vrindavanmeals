import type { QueryClient } from "@tanstack/react-query";

/**
 * Shared cache freshness windows.
 * Back-navigation renders from cache instantly; anything older than the window
 * is silently revalidated in the background.
 */
export const STALE = {
  /** Live counters (attendance feed, POS) — always revalidate. */
  LIVE: 0,
  /** Dashboard KPIs — frequently changing money numbers. */
  DASHBOARD: 30_000,
  /** Transactional lists — dues, payments, students, subscriptions. */
  LIST: 60_000,
  /** Reports — heavy, rarely need second-by-second freshness. */
  REPORT: 3 * 60_000,
  /** Master data — units, plans, fee slabs, POS masters, settings. */
  MASTER: 10 * 60_000,
} as const;

/** Query keys whose data derives from the student ledger (billing/payments/adjustments). */
const LEDGER_KEYS = [
  "dashboard-agg-v3",
  "dues-list",
  "students-ledger",
  "subscription-ledger",
  "bulk-ledger",
  "ledger",
  "student-detail",
  "student-due",
  "payments",
  "subscriptions",
  "subscription-payments",
];

/**
 * Invalidate everything that shows a balance after a money-changing action
 * (payment, adjustment, subscription edit, billing rebuild). Cheap: only
 * currently-mounted queries refetch, the rest are just marked stale.
 */
export function invalidateLedger(qc: QueryClient) {
  for (const key of LEDGER_KEYS) qc.invalidateQueries({ queryKey: [key] });
  qc.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("rpt-"),
  });
}
