import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw new Error("Permission check failed");
  if (!data) throw new Error("Forbidden: Super Admin only");
}

export type RebuildSummary = {
  students_processed: number;
  before_total: number;
  after_total: number;
  samples: { roll_number: string | null; full_name: string; before: number; after: number }[];
};

/**
 * One-time (repeatable) backfill: regenerates every student's month-by-month
 * billing from their joining date to today (or exit date), using the Fee
 * Settings slab for each month and the 15th-pivot rule for first/last month.
 * Payments and adjustments are never touched.
 */
export const rebuildBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RebuildSummary> => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin.rpc("rebuild_all_billing");
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { students_processed: number; before_total: number; after_total: number }
      | undefined;

    const { data: logs } = await supabaseAdmin
      .from("billing_backfill_log")
      .select("before_billed, after_billed, students(full_name, roll_number)")
      .order("after_billed", { ascending: false })
      .limit(500);

    const samples = ((logs ?? []) as unknown as {
      before_billed: number; after_billed: number;
      students: { full_name: string; roll_number: string | null } | null;
    }[]).map((l) => ({
      roll_number: l.students?.roll_number ?? null,
      full_name: l.students?.full_name ?? "",
      before: Number(l.before_billed),
      after: Number(l.after_billed),
    }));

    return {
      students_processed: Number(row?.students_processed ?? 0),
      before_total: Number(row?.before_total ?? 0),
      after_total: Number(row?.after_total ?? 0),
      samples,
    };
  });

/**
 * Adds any missing month charges for active students (safe to call repeatedly).
 * Also scheduled nightly in the database.
 */
export const accrueMonthlyBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("accrue_monthly_billing");
    if (error) throw new Error(error.message);
    return { created: Number(data ?? 0) };
  });
