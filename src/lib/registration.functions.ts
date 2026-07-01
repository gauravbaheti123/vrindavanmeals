import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createHash } from "crypto";
import { z } from "zod";

const RegistrationSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  mobile: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, "Invalid mobile"),
  roll_number: z.string().trim().max(50).optional().nullable(),
  course: z.string().trim().max(100).optional().nullable(),
  hostel_room: z.string().trim().max(50).optional().nullable(),
  parent_mobile: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/).optional().nullable().or(z.literal("")),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  unit_id: z.string().uuid().optional().nullable().or(z.literal("")),
});

const MAX_PER_HOUR = 3;

export const submitStudentRegistration = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => RegistrationSchema.parse(raw))
  .handler(async ({ data }) => {
    const headers = getRequestHeaders() as Record<string, string | undefined>;
    const ip =
      headers["cf-connecting-ip"] ||
      headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      headers["x-real-ip"] ||
      "unknown";
    const ipHash = createHash("sha256").update(String(ip)).digest("hex");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: rlErr } = await supabaseAdmin
      .from("registration_rate_limit")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if (rlErr) throw new Error("Rate limit check failed");
    if ((count ?? 0) >= MAX_PER_HOUR) {
      throw new Error("Too many registrations from this network. Please try again later.");
    }

    const { error } = await supabaseAdmin.from("students").insert({
      full_name: data.full_name,
      mobile: data.mobile,
      roll_number: data.roll_number || null,
      course: data.course || null,
      hostel_room: data.hostel_room || null,
      parent_mobile: data.parent_mobile || null,
      email: data.email || null,
      unit_id: data.unit_id || null,
      is_approved: false,
    });
    if (error) throw new Error("Registration failed");

    await supabaseAdmin.from("registration_rate_limit").insert({ ip_hash: ipHash });
    return { ok: true };
  });
