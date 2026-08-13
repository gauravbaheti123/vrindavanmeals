import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Writes an Activity Log entry server-side using the service role.
 * Clients cannot insert into audit_log directly, and actor_id is always
 * taken from the verified session — so entries cannot be forged.
 */
export const writeAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    action: string;
    entity: string;
    entity_id?: string | null;
    student_id?: string | null;
    label?: string | null;
    old_values?: unknown;
    new_values?: unknown;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: data.action,
      entity: data.entity,
      entity_id: data.entity_id ?? null,
      student_id: data.student_id ?? null,
      label: data.label ?? null,
      old_values: (data.old_values ?? null) as never,
      new_values: (data.new_values ?? null) as never,
    });
    return { ok: true };
  });
