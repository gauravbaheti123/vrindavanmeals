// Attendance scan endpoint for biometric device (ZKTeco MiniAC Plus)
// POST /functions/v1/attendance-scan
// Body: { device_user_id: string, unit_id: string, timestamp?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return j(405, { success: false, error: "METHOD_NOT_ALLOWED" });

  try {
    const { device_user_id, unit_id, timestamp } = await req.json();
    if (!device_user_id || !unit_id) {
      return j(400, { success: false, error: "MISSING_FIELDS", message: "device_user_id and unit_id required" });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const scanTime = timestamp ? new Date(timestamp) : new Date();
    const scanDate = scanTime.toISOString().slice(0, 10);
    // IST HH:MM:SS for meal window compare
    const istTime = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
    }).format(scanTime);

    // 1. Lookup mapping
    const { data: mapping } = await sb
      .from("biometric_mappings")
      .select("student_id")
      .eq("device_user_id", device_user_id)
      .eq("unit_id", unit_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!mapping?.student_id) {
      await sb.from("unmapped_scans").insert({
        device_user_id, unit_id, scan_time: scanTime.toISOString(),
        raw_data: { source: "attendance-scan", timestamp },
      });
      return j(200, { success: false, error: "DEVICE_NOT_MAPPED", message: "Device not mapped to any student" });
    }

    // 2. Student + unit
    const [{ data: student }, { data: unit }] = await Promise.all([
      sb.from("students").select("id, full_name, roll_number, mobile").eq("id", mapping.student_id).maybeSingle(),
      sb.from("units").select("name").eq("id", unit_id).maybeSingle(),
    ]);
    if (!student) return j(200, { success: false, error: "STUDENT_NOT_FOUND", message: "Student record missing" });

    // 3. Meal window
    const { data: windows } = await sb.from("meal_windows").select("meal_type, start_time, end_time").eq("unit_id", unit_id);
    const mw = (windows ?? []).find((w) => istTime >= w.start_time && istTime <= w.end_time);
    if (!mw) return j(200, { success: false, error: "OUTSIDE_MEAL_TIME", message: "Outside meal time" });
    const meal_type = mw.meal_type;

    // 4. Subscription
    const { data: sub } = await sb
      .from("subscriptions")
      .select("id, end_date, grace_end_date, status")
      .eq("student_id", student.id)
      .in("status", ["active", "grace", "pending"])
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) return j(200, { success: false, error: "NO_SUBSCRIPTION", message: "No active subscription" });
    if (sub.status === "pending") return j(200, { success: false, error: "PAYMENT_PENDING", message: "Payment pending" });

    let warning_message: string | null = null;
    if (scanDate > sub.grace_end_date) {
      return j(200, { success: false, error: "SUBSCRIPTION_EXPIRED", message: "Subscription expired" });
    }
    if (scanDate > sub.end_date) warning_message = "In grace period — renew soon";

    // 5. Duplicate
    const { data: dup } = await sb
      .from("attendance")
      .select("id")
      .eq("student_id", student.id)
      .eq("meal_type", meal_type)
      .eq("scan_date", scanDate)
      .maybeSingle();
    if (dup) return j(200, { success: false, error: "DUPLICATE_SCAN", message: `Already marked for ${meal_type} today` });

    // 6. Token number: sequential per unit per meal per day
    const { count } = await sb
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unit_id)
      .eq("meal_type", meal_type)
      .eq("scan_date", scanDate);
    const token_number = (count ?? 0) + 1;

    const { data: inserted, error: insErr } = await sb.from("attendance").insert({
      student_id: student.id,
      unit_id,
      meal_type,
      scan_type: "biometric",
      scan_time: scanTime.toISOString(),
      scan_date: scanDate,
      token_number,
      token_printed: false,
    }).select("id").single();

    if (insErr) return j(500, { success: false, error: "INSERT_FAILED", message: insErr.message });

    const unitPrefix = (unit?.name ?? "U").toString().replace(/[^0-9]/g, "") || "1";
    const mealPrefix = meal_type === "lunch" ? "L" : "D";
    const tokenLabel = `U${unitPrefix}-${mealPrefix}-${String(token_number).padStart(3, "0")}`;

    return j(200, {
      success: true,
      token_data: {
        attendance_id: inserted.id,
        student_name: student.full_name,
        roll_number: student.roll_number,
        unit: unit?.name ?? "",
        meal_type,
        token_number,
        token_label: tokenLabel,
        scan_time: scanTime.toISOString(),
        warning_message,
      },
    });
  } catch (e) {
    return j(500, { success: false, error: "SERVER_ERROR", message: (e as Error).message });
  }
});
