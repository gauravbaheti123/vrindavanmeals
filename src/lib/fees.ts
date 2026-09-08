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

export type HolidaySegment = {
  /** unique key for rendering */
  key: string;
  kind: "block" | "tail";
  index: number;
  from: string;
  to: string;
  days: number;
  /** month whose slab was used (block only) */
  month: string;
  monthlyFee: number;
  amount: number;
};
export type HolidayCalc = { days: number; amount: number; segments: HolidaySegment[]; missingMonths: string[] };

const BLOCK_DAYS = 15;

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Month containing the majority of days between two ISO dates (inclusive). */
function predominantMonth(fromISO: string, toISO: string): string {
  const counts = new Map<string, number>();
  const end = new Date(toISO + "T00:00:00");
  for (const d = new Date(fromISO + "T00:00:00"); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = monthKey(fromISO);
  let bestN = -1;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best;
}

/**
 * Continuous-span rule: walk forward from the start date in complete 15-day blocks.
 * Each complete block deducts half of the monthly fee for the month that block
 * predominantly falls in. Any leftover tail shorter than 15 days deducts ₹0.
 */
export function computeHolidayDeduction(slabs: FeeSlab[], fromISO: string, toISO: string): HolidayCalc {
  const start = new Date(fromISO + "T00:00:00");
  const end = new Date(toISO + "T00:00:00");
  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (!Number.isFinite(totalDays) || totalDays <= 0) {
    return { days: 0, amount: 0, segments: [], missingMonths: [] };
  }

  const segments: HolidaySegment[] = [];
  const missingMonths: string[] = [];
  let amount = 0;

  const blocks = Math.floor(totalDays / BLOCK_DAYS);
  for (let i = 0; i < blocks; i++) {
    const bFrom = addDays(fromISO, i * BLOCK_DAYS);
    const bTo = addDays(fromISO, i * BLOCK_DAYS + BLOCK_DAYS - 1);
    const month = predominantMonth(bFrom, bTo);
    const fee = feeForMonth(slabs, month);
    if (fee === null) { missingMonths.push(month); continue; }
    const seg = Math.round(fee / 2);
    amount += seg;
    segments.push({
      key: `block-${i}`, kind: "block", index: i + 1,
      from: bFrom, to: bTo, days: BLOCK_DAYS, month, monthlyFee: fee, amount: seg,
    });
  }

  const tailDays = totalDays - blocks * BLOCK_DAYS;
  if (tailDays > 0) {
    const tFrom = addDays(fromISO, blocks * BLOCK_DAYS);
    segments.push({
      key: "tail", kind: "tail", index: blocks + 1,
      from: tFrom, to: toISO, days: tailDays,
      month: predominantMonth(tFrom, toISO), monthlyFee: 0, amount: 0,
    });
  }

  return { days: totalDays, amount: Math.round(amount), segments, missingMonths };
}

/** Preview label for a holiday segment. */
export function holidaySegmentLabel(seg: HolidaySegment): string {
  if (seg.kind === "tail") {
    return `Remaining ${seg.days} day${seg.days === 1 ? "" : "s"} — no additional deduction`;
  }
  return `Block ${seg.index} (${fmtDate(seg.from)} to ${fmtDate(seg.to)}, ${seg.days} days) — half month deduction`;
}


export function formatDMY(iso: string): string {
  return fmtDate(iso);
}
