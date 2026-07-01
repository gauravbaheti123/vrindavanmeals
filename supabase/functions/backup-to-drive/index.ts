// Google Drive Weekly Backup
// POST /functions/v1/backup-to-drive
// Requires secrets: GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_DRIVE_FOLDER_ID

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TABLES = ["students", "subscriptions", "payments", "attendance", "token_reprints"];

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

async function getAccessToken(saJson: string): Promise<string> {
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  };
  const b64u = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsigned = `${b64u(header)}.${b64u(claim)}`;

  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get Google token: " + JSON.stringify(data));
  return data.access_token;
}

async function uploadToDrive(token: string, folderId: string, name: string, content: string) {
  const boundary = "----vrindavan" + crypto.randomUUID();
  const metadata = { name, parents: [folderId], mimeType: "text/csv" };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload ${name} failed: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  const folderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  if (!saJson || !folderId) {
    return new Response(JSON.stringify({
      success: false, error: "NOT_CONFIGURED",
      message: "GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_FOLDER_ID must be set",
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const token = await getAccessToken(saJson);
    const date = new Date().toISOString().slice(0, 10);
    const uploaded: string[] = [];
    for (const t of TABLES) {
      const { data } = await sb.from(t).select("*");
      const csv = toCsv((data ?? []) as Record<string, unknown>[]);
      const name = `vrindavan_backup_${date}_${t}.csv`;
      await uploadToDrive(token, folderId, name, csv || "\n");
      uploaded.push(name);
    }

    const timestamp = new Date().toISOString();
    await sb.from("system_settings").upsert({ key: "last_backup_at", value: timestamp });
    await sb.from("system_settings").upsert({
      key: "last_backup_files", value: JSON.stringify({ date, files: uploaded }),
    });

    return new Response(JSON.stringify({ success: true, uploaded, timestamp }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: "BACKUP_FAILED", message: (e as Error).message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
