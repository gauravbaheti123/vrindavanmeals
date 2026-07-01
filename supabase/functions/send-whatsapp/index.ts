// AiSensy WhatsApp integration
// POST /functions/v1/send-whatsapp
// Body: { phone, template_name, params: string[], student_id?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const apiKey = Deno.env.get("AISENSY_API_KEY");
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { phone, template_name, params, student_id } = await req.json();
    if (!phone || !template_name) {
      return new Response(JSON.stringify({ success: false, error: "MISSING_FIELDS" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!apiKey) {
      await sb.from("notifications_log").insert({
        student_id: student_id ?? null, mobile: phone, template_name,
        status: "skipped", response_data: { reason: "AISENSY_API_KEY not configured" },
      });
      return new Response(JSON.stringify({ success: false, error: "NOT_CONFIGURED", message: "AISENSY_API_KEY missing" }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://backend.aisensy.com/campaign/t1/api/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        campaignName: template_name,
        destination: phone,
        userName: "Vrindavan Meals",
        templateParams: params ?? [],
        source: "portal",
        media: {},
      }),
    });
    const responseData = await res.json().catch(() => ({}));
    const status = res.ok ? "sent" : "failed";

    await sb.from("notifications_log").insert({
      student_id: student_id ?? null, mobile: phone, template_name,
      status, response_data: responseData,
    });

    return new Response(JSON.stringify({ success: res.ok, response: responseData }), {
      status: res.ok ? 200 : 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: "SERVER_ERROR", message: (e as Error).message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
