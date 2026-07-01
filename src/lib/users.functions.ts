import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RoleEnum = z.enum(["super_admin", "manager", "counter_staff", "accountant"]);

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

const CreateSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  mobile: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  role: RoleEnum,
  unit_id: z.string().uuid().optional().nullable().or(z.literal("")),
  password: z.string().min(8).max(128),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message || "Failed to create user");
    const uid = created.user.id;

    await supabaseAdmin.from("profiles").upsert({
      id: uid,
      name: data.full_name,
      email: data.email,
      mobile: data.mobile || null,
      unit_id: data.unit_id || null,
      is_active: true,
    });
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });

    return { ok: true, user_id: uid };
  });

const UpdateSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120),
  mobile: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  role: RoleEnum,
  unit_id: z.string().uuid().optional().nullable().or(z.literal("")),
  is_active: z.boolean(),
});

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Prevent removing last super admin
    if (data.role !== "super_admin") {
      const { data: existing } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", data.user_id).eq("role", "super_admin").maybeSingle();
      if (existing) {
        const { count } = await supabaseAdmin
          .from("user_roles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
        if ((count ?? 0) <= 1) throw new Error("Cannot demote the last Super Admin");
      }
    }

    await supabaseAdmin.from("profiles").update({
      name: data.full_name,
      mobile: data.mobile || null,
      unit_id: data.unit_id || null,
      is_active: data.is_active,
    }).eq("id", data.user_id);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });

    return { ok: true };
  });

const ResetSchema = z.object({ user_id: z.string().uuid() });
export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ResetSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tempPassword = "VM-" + Math.random().toString(36).slice(2, 10).toUpperCase();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: tempPassword });
    if (error) throw new Error(error.message);
    return { ok: true, temp_password: tempPassword };
  });
