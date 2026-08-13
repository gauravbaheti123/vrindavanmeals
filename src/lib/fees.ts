import { fmtDate } from "@/lib/dates";
import { supabase } from "@/integrations/supabase/client";

export type FeeSlab = {
  id: string;
  monthly_fee: number;
  effective_month: string; // YYYY-MM-01
  effective_to_month: string | null; // YYYY-MM-01 or null (ongoing)
  is_active: boolean;
  created_at: string;
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-05-01" → "May 2026" */
export function formatMonth(iso: string | null): string {
  if (!iso) return "Ongoing";
  const [y, m] = iso.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

/** Any ISO date → first-of-month key, e.g. 2026-05-17 → 2026-05-01 */
export function monthKey(dateISO: string): string {
  return dateISO.slice(0, 7) + "-01";
}

export function prevMonthKey(monthISO: string): string {
  const [y, m] = monthISO.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function fetchFeeSlabs(): Promise<FeeSlab[]> {
  const { data, error } = await supabase
    .from("fee_settings")
    .select("*")
    .order("effective_month", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FeeSlab[];
}

/**
 * Full-month fee applicable to the month containing `dateISO`.
 * Returns null when no slab covers that month — callers must surface a clear error.
 */
export function feeForMonth(slabs: FeeSlab[], dateISO: string): number | null {
  const key = monthKey(dateISO);
  const hit = slabs.find(
    (s) => key >= s.effective_month && (s.effective_to_month === null || key <= s.effective_to_month),
  );
  return hit ? Number(hit.monthly_fee) : null;
}

export function missingSlabMessage(dateISO: string): string {
  return `No fee slab configured for ${formatMonth(monthKey(dateISO))} — add it in Settings → Fee Settings first`;
}

/* ---------------- Holiday / Leave deduction ---------------- */

export type HolidaySegment = { month: string; days: number; monthlyFee: number; daysInMonth: number; amount: number };
export type HolidayCalc = { days: number; amount: number; segments: HolidaySegment[]; missingMonths: string[] };

function daysInMonth(monthISO: string): number {
  const [y, m] = monthISO.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Per-day rate = monthly fee (slab active for that month) ÷ days in that month.
 * A range spanning months is split so each month uses its own rate.
 */
export function computeHolidayDeduction(slabs: FeeSlab[], fromISO: string, toISO: string): HolidayCalc {
  const start = new Date(fromISO + "T00:00:00");
  const end = new Date(toISO + "T00:00:00");
  const byMonth = new Map<string, number>();
  let days = 0;
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    days += 1;
  }
  const segments: HolidaySegment[] = [];
  const missingMonths: string[] = [];
  let amount = 0;
  for (const [month, count] of byMonth) {
    const fee = feeForMonth(slabs, month);
    if (fee === null) { missingMonths.push(month); continue; }
    const dim = daysInMonth(month);
    const seg = (fee / dim) * count;
    amount += seg;
    segments.push({ month, days: count, monthlyFee: fee, daysInMonth: dim, amount: Math.round(seg) });
  }
  return { days, amount: Math.round(amount), segments, missingMonths };
}

export function formatDMY(iso: string): string {
  return fmtDate(iso);
}
