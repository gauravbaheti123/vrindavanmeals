// Client helpers for token printing + WhatsApp fallback
import { supabase } from "@/integrations/supabase/client";

export interface TokenData {
  attendance_id: string;
  student_name: string;
  roll_number: string | null;
  unit: string;
  meal_type: "lunch" | "dinner";
  token_number: number;
  token_label: string;
  scan_time: string;
  warning_message?: string | null;
  student_mobile?: string | null;
  student_id?: string | null;
}

export function printToken(token: TokenData) {
  const w = window.open("", "PRINT", "width=380,height=600");
  if (!w) return false;
  const time = new Date(token.scan_time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  w.document.write(`<!doctype html><html><head><title>Token</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; width: 72mm; margin: 0; padding: 4px; }
  .center { text-align: center; }
  .big { font-size: 22px; font-weight: 900; }
  .med { font-size: 14px; font-weight: 700; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
</style></head><body>
  <div class="center med">VRINDAVAN MEALS</div>
  <div class="center">${token.unit}</div>
  <hr />
  <div>Name: <b>${token.student_name}</b></div>
  ${token.roll_number ? `<div>Mess No: ${token.roll_number}</div>` : ""}
  <hr />
  <div class="center big">${token.meal_type.toUpperCase()}</div>
  <div class="center big">${token.token_label}</div>
  <hr />
  <div class="center">${time}</div>
  <div class="center" style="font-size:11px">Valid for today only</div>
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 250);
  // Mark printed (best-effort)
  supabase.from("attendance").update({ token_printed: true }).eq("id", token.attendance_id);
  return true;
}

export async function sendTokenViaWhatsapp(token: TokenData) {
  if (!token.student_mobile) throw new Error("No mobile on file");
  const { data, error } = await supabase.functions.invoke("send-whatsapp", {
    body: {
      phone: token.student_mobile,
      template_name: "digital_token",
      student_id: token.student_id,
      params: [
        token.student_name,
        token.meal_type,
        token.token_label,
        new Date(token.scan_time).toLocaleDateString("en-IN"),
      ],
    },
  });
  if (error) throw error;
  return data;
}
