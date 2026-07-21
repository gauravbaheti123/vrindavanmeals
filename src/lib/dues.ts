import { supabase } from "@/integrations/supabase/client";
import { computeSubscriptionStatus } from "@/lib/subscription-status";

export type DuesRow = {
  student_id: string;
  full_name: string;
  mobile: string | null;
  roll_number: string | null;
  unit_name: string | null;
  unit_id: string | null;
  sub_id: string | null;
  end_date: string;
  grace_end_date: string;
  eff_status: "active" | "grace" | "expired" | "pending";
  last_payment_date: string | null;
  due_amount: number;
  opening_balance: number;
  days_overdue: number;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Single source of truth for outstanding dues.
 * Formula per student: (subscription_count × plan_price + opening_balance) − sum(successful_payments)
 * Only students with due > 0 are returned.
 */
export async function fetchDuesRows(planPrice: number): Promise<DuesRow[]> {
  const [studentsRes, subsRes, paysRes] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, mobile, roll_number, unit_id, opening_balance, opening_balance_as_of, units(name)")
      .eq("is_approved", true),
    supabase
      .from("subscriptions")
      .select("id, student_id, status, start_date, end_date, grace_end_date"),
    supabase
      .from("payments")
      .select("student_id, amount, created_at")
      .eq("status", "success")
      .order("created_at", { ascending: false }),
  ]);

  type St = { id: string; full_name: string; mobile: string | null; roll_number: string | null; unit_id: string | null; opening_balance: number | null; opening_balance_as_of: string | null; units: { name: string } | null };
  type Sub = { id: string; student_id: string; status: "active" | "grace" | "expired" | "pending"; start_date: string; end_date: string; grace_end_date: string };

  const students = (studentsRes.data ?? []) as unknown as St[];
  const subs = (subsRes.data ?? []) as unknown as Sub[];
  const pays = (paysRes.data ?? []) as { student_id: string; amount: number; created_at: string }[];

  const subsByStudent = new Map<string, Sub[]>();
  for (const s of subs) {
    const arr = subsByStudent.get(s.student_id) ?? [];
    arr.push(s);
    subsByStudent.set(s.student_id, arr);
  }

  const paidByStudent = new Map<string, number>();
  const lastPayMap = new Map<string, string>();
  for (const p of pays) {
    paidByStudent.set(p.student_id, (paidByStudent.get(p.student_id) ?? 0) + Number(p.amount));
    if (!lastPayMap.has(p.student_id)) lastPayMap.set(p.student_id, p.created_at);
  }

  const today = todayISO();
  const rows: DuesRow[] = [];

  for (const st of students) {
    const stSubs = subsByStudent.get(st.id) ?? [];
    const opening = Number(st.opening_balance ?? 0);
    const paid = paidByStudent.get(st.id) ?? 0;
    const billed = stSubs.length * planPrice + opening;
    const due = billed - paid;
    if (due <= 0) continue;

    const latest = stSubs.slice().sort((a, b) => (a.end_date > b.end_date ? -1 : 1))[0] ?? null;
    const eff = latest ? computeSubscriptionStatus(latest) : "expired";
    const lastPay = lastPayMap.get(st.id) ?? null;
    const refDate = lastPay ? lastPay.slice(0, 10) : (latest?.start_date ?? st.opening_balance_as_of ?? today);
    const days = Math.max(0, Math.floor((Date.parse(today) - Date.parse(refDate)) / 86400000));

    rows.push({
      student_id: st.id,
      full_name: st.full_name,
      mobile: st.mobile,
      roll_number: st.roll_number,
      unit_name: st.units?.name ?? null,
      unit_id: st.unit_id,
      sub_id: latest?.id ?? null,
      end_date: latest?.end_date ?? (st.opening_balance_as_of ?? ""),
      grace_end_date: latest?.grace_end_date ?? (st.opening_balance_as_of ?? ""),
      eff_status: eff,
      last_payment_date: lastPay,
      due_amount: due,
      opening_balance: opening,
      days_overdue: days,
    });
  }

  rows.sort((a, b) => b.days_overdue - a.days_overdue);
  return rows;
}
