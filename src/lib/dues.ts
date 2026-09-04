import { supabase } from "@/integrations/supabase/client";
import { pageAll } from "@/lib/fetch-all";

export type LedgerStatus = "active" | "inactive";

export type DuesRow = {
  student_id: string;
  full_name: string;
  mobile: string | null;
  roll_number: string | null;
  college_roll_number: string | null;
  unit_name: string | null;
  unit_id: string | null;
  sub_id: string | null;
  /** Active = no exit date set. Inactive = deactivated (exit date recorded). */
  status: LedgerStatus;
  joining_date: string | null;
  exit_date: string | null;
  last_payment_date: string | null;
  total_billed: number;
  paid: number;
  due_amount: number;
  opening_balance: number;
  adjustments: number;
  security_deposit_held: number;
  days_overdue: number;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function overdueDays(due: number, ref: string | null): number {
  if (due <= 0) return 0;
  const today = todayISO();
  const from = ref ?? today;
  return Math.max(0, Math.floor((Date.parse(today) - Date.parse(from)) / 86400000));
}

type SummaryRow = {
  student_id: string | null;
  full_name: string | null;
  mobile: string | null;
  roll_number: string | null;
  college_roll_number: string | null;
  unit_id: string | null;
  unit_name: string | null;
  status: string | null;
  joining_date: string | null;
  exit_date: string | null;
  opening_balance_as_of: string | null;
  opening_balance: number | null;
  total_billed: number | null;
  total_paid: number | null;
  total_adjustments: number | null;
  total_due: number | null;
  security_deposit_held: number | null;
  last_payment_date: string | null;
  first_start_date: string | null;
  sub_id: string | null;
};

const SUMMARY_COLS =
  "student_id, full_name, mobile, roll_number, college_roll_number, unit_id, unit_name, status, joining_date, exit_date, opening_balance_as_of, opening_balance, total_billed, total_paid, total_adjustments, total_due, security_deposit_held, last_payment_date, first_start_date, sub_id";

/**
 * Single source of truth for the student ledger.
 * All summing/joining happens in Postgres via the `student_ledger_summary` view:
 * Due = Total Billed + Opening Balance + Adjustments − Payments received.
 */
export async function fetchLedgerRows(planPrice?: number): Promise<DuesRow[]> {
  void planPrice; // billing amounts always come from the generated billing rows

  const data = await pageAll<SummaryRow>((from, to) =>
    supabase.from("student_ledger_summary").select(SUMMARY_COLS).range(from, to),
  );

  const rows: DuesRow[] = data.map((r) => {
    const due = Number(r.total_due ?? 0);
    const lastPay = r.last_payment_date ?? null;
    const ref =
      (lastPay ? lastPay.slice(0, 10) : null) ??
      r.joining_date ??
      r.first_start_date ??
      r.opening_balance_as_of;

    return {
      student_id: r.student_id as string,
      full_name: r.full_name ?? "",
      mobile: r.mobile,
      roll_number: r.roll_number,
      college_roll_number: r.college_roll_number,
      unit_name: r.unit_name,
      unit_id: r.unit_id,
      sub_id: r.sub_id,
      status: (r.status === "inactive" ? "inactive" : "active") as LedgerStatus,
      joining_date: r.joining_date,
      exit_date: r.exit_date,
      last_payment_date: lastPay,
      total_billed: Number(r.total_billed ?? 0),
      paid: Number(r.total_paid ?? 0),
      due_amount: due,
      opening_balance: Number(r.opening_balance ?? 0),
      adjustments: Number(r.total_adjustments ?? 0),
      security_deposit_held: Number(r.security_deposit_held ?? 0),
      days_overdue: overdueDays(due, ref),
    };
  });

  rows.sort((a, b) => b.days_overdue - a.days_overdue);
  return rows;
}

/** Only students who currently owe money. */
export async function fetchDuesRows(planPrice?: number): Promise<DuesRow[]> {
  return (await fetchLedgerRows(planPrice)).filter((r) => r.due_amount > 0);
}

export type StudentDueSummary = { due_amount: number; days_overdue: number };

/** Lightweight single-student due lookup (used by the attendance counter). */
export async function fetchStudentDue(studentId: string): Promise<StudentDueSummary> {
  const { data } = await supabase
    .from("student_ledger_summary")
    .select("total_due, last_payment_date, joining_date, first_start_date, opening_balance_as_of")
    .eq("student_id", studentId)
    .maybeSingle();

  const r = data as Pick<
    SummaryRow,
    "total_due" | "last_payment_date" | "joining_date" | "first_start_date" | "opening_balance_as_of"
  > | null;
  const due = Number(r?.total_due ?? 0);
  const ref =
    (r?.last_payment_date ? r.last_payment_date.slice(0, 10) : null) ??
    r?.joining_date ??
    r?.first_start_date ??
    r?.opening_balance_as_of ??
    null;

  return { due_amount: due, days_overdue: overdueDays(due, ref) };
}


