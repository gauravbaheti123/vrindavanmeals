/**
 * Single source of truth for date formatting across the portal.
 * Everything user-visible (UI, PDF, Excel) renders as DD-MM-YYYY.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Accepts an ISO date/timestamp string or Date. Returns "DD-MM-YYYY" ("—" when empty/invalid). */
export function fmtDate(input: string | Date | null | undefined, empty = "—"): string {
  if (!input) return empty;
  const d =
    input instanceof Date
      ? input
      : /^\d{4}-\d{2}-\d{2}$/.test(input)
        ? new Date(input + "T00:00:00")
        : new Date(input);
  if (Number.isNaN(d.getTime())) return empty;
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** "DD-MM-YYYY HH:MM" (24h). */
export function fmtDateTime(input: string | Date | null | undefined, empty = "—"): string {
  if (!input) return empty;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return empty;
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO "YYYY-MM-DD" from a Date (local, not UTC). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "DD-MM-YYYY" → "YYYY-MM-DD"; returns null when incomplete/invalid. */
export function parseDMY(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const dd = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const yyyy = Number(digits.slice(4, 8));
  if (mm < 1 || mm > 12 || dd < 1 || yyyy < 1900) return null;
  const dim = new Date(yyyy, mm, 0).getDate();
  if (dd > dim) return null;
  return `${yyyy}-${pad(mm)}-${pad(dd)}`;
}

/** Progressive input mask: digits → "DD-MM-YYYY". */
export function maskDMY(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join("-");
}

/** ISO "YYYY-MM-DD" → "DD-MM-YYYY" for the masked text field. */
export function isoToDMY(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
