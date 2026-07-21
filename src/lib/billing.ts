// Mid-month billing rule (15th pivot, flat 2-tier — not daily prorated).
// Join / activation:
//   Day 1–15  → full month charge, sub runs till last day of that month
//   Day 16–EOM → half month charge, sub runs till last day of that month
// The same rule mirrors for deactivation refunds.

export type BillingSlice = {
  isFullMonth: boolean;
  amount: number;
  startDate: string; // YYYY-MM-DD (== join date)
  endDate: string; // YYYY-MM-DD (last day of that calendar month)
};

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function lastDayOfMonthISO(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00");
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return toISO(last);
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/**
 * Compute the mid-month billing slice for a join/activation date.
 * `monthlyPrice` is the full-month subscription price (e.g. ₹3000).
 */
export function computeActivationBilling(joinDateISO: string, monthlyPrice: number): BillingSlice {
  const d = new Date(joinDateISO + "T00:00:00");
  const day = d.getDate();
  const isFullMonth = day <= 15;
  const amount = isFullMonth ? Number(monthlyPrice) : Number(monthlyPrice) / 2;
  return {
    isFullMonth,
    amount,
    startDate: joinDateISO,
    endDate: lastDayOfMonthISO(joinDateISO),
  };
}

/**
 * Refundable amount when a student with an advance-paid current-month sub is deactivated.
 * Mirrors the 15th pivot:
 *   Deactivate day 1–15  → liable only half month → refund up to half price
 *   Deactivate day 16–EOM → liable full month → no refund
 * `advanceAvailable` = paid − billed (only the positive advance portion).
 */
export function computeDeactivationRefund(
  deactivateDateISO: string,
  monthlyPrice: number,
  advanceAvailable: number,
): number {
  if (advanceAvailable <= 0) return 0;
  const d = new Date(deactivateDateISO + "T00:00:00");
  const day = d.getDate();
  if (day > 15) return 0;
  return Math.min(advanceAvailable, Number(monthlyPrice) / 2);
}
