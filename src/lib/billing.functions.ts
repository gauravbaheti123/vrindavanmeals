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

export type BatchResult = { processed: number; before: number; after: number };

/** Clears the audit log and returns the number of students to process. */
export const startRebuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ total: number }> => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("rebuild_billing_reset");
    if (error) throw new Error(error.message);
    return { total: Number(data ?? 0) };
  });

/**
 * Rebuilds one chunk of students (month-by-month billing from joining date to
 * today/exit, Fee Settings slab per month, 15th-pivot first/last month).
 * Each chunk commits on its own, so partial progress is never lost and the
 * whole run is safe to repeat. Payments and adjustments are never touched.
 */
export const rebuildBillingBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { offset: number; limit: number }) => d)
  .handler(async ({ data, context }): Promise<BatchResult> => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("rebuild_billing_batch", {
      p_offset: data.offset,
      p_limit: data.limit,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(rows) ? rows[0] : rows) as
      | { students_processed: number; before_total: number; after_total: number }
      | undefined;
    return {
      processed: Number(row?.students_processed ?? 0),
      before: Number(row?.before_total ?? 0),
      after: Number(row?.after_total ?? 0),
    };
  });

/** Top changed students from the last rebuild, for the summary panel. */
export const rebuildSamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RebuildSummary["samples"]> => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: logs } = await supabaseAdmin
      .from("billing_backfill_log")
      .select("before_billed, after_billed, students(full_name, roll_number)")
      .order("after_billed", { ascending: false })
      .limit(50);
    return ((logs ?? []) as unknown as {
      before_billed: number; after_billed: number;
      students: { full_name: string; roll_number: string | null } | null;
    }[]).map((l) => ({
      roll_number: l.students?.roll_number ?? null,
      full_name: l.students?.full_name ?? "",
      before: Number(l.before_billed),
      after: Number(l.after_billed),
    }));
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

/**
 * Recalculates billing for ONE student (used after a Joining/Exit Date edit).
 * Regenerates only subscription/billing rows — payments, adjustments and
 * security deposits are untouched.
 */
export const recalcStudentBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { student_id: string }) => d)
  .handler(async ({ data, context }): Promise<{ total: number }> => {
    const { data: roles, error: rErr } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (rErr) throw new Error("Permission check failed");
    const list = (roles ?? []).map((r: any) => r.role);
    if (!list.includes("super_admin") && !list.includes("manager")) {
      throw new Error("Forbidden: Super Admin or Manager only");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: total, error } = await supabaseAdmin.rpc("rebuild_student_billing", {
      p_student: data.student_id,
    });
    if (error) throw new Error(error.message);
    return { total: Number(total ?? 0) };
  });
