import { supabase } from "@/integrations/supabase/client";

export const MESS_NO_PREFIX = "VM-";
export const MESS_NO_REGEX = /^VM-\d{4}$/;

export function formatMessNo(n: number): string {
  return `${MESS_NO_PREFIX}${String(n).padStart(4, "0")}`;
}

export function isValidMessNo(v: string): boolean {
  return MESS_NO_REGEX.test(v.trim());
}

/** Highest numeric suffix among VM-#### mess numbers. Legacy formats are ignored. */
export function maxFromRolls(rolls: (string | null | undefined)[]): number {
  let max = 0;
  for (const r of rolls) {
    const m = String(r ?? "").trim().match(/^VM-(\d{4})$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Always re-checks the database — never cached — so concurrent adds don't collide.
 */
export async function getNextMessNo(): Promise<string> {
  const { data } = await supabase
    .from("students")
    .select("roll_number")
    .like("roll_number", "VM-%")
    .order("roll_number", { ascending: false })
    .limit(50);
  return formatMessNo(maxFromRolls((data ?? []).map((r) => r.roll_number)) + 1);
}

/** Returns true when the mess no is free (optionally excluding the student being edited). */
export async function isMessNoAvailable(messNo: string, excludeStudentId?: string): Promise<boolean> {
  let q = supabase.from("students").select("id").eq("roll_number", messNo.trim()).limit(1);
  if (excludeStudentId) q = q.neq("id", excludeStudentId);
  const { data } = await q;
  return (data ?? []).length === 0;
}
