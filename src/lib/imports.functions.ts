import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdminOrManager(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles").select("role").eq("user_id", context.userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("manager")) {
    throw new Error("Forbidden: Super Admin or Manager only");
  }
}

function normalizeMobile(m: string | undefined | null): string {
  if (!m) return "";
  let s = String(m).replace(/[\s\-()]/g, "");
  if (s.startsWith("+91")) s = s.slice(3);
  if (s.startsWith("91") && s.length === 12) s = s.slice(2);
  s = s.replace(/^0+/, "");
  return s;
}

function parseDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const str = String(s).trim();
  // DD-MM-YYYY
  const dm = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dm) return `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  // YYYY-MM-DD
  const ym = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}-${ym[3].padStart(2, "0")}`;
  return null;
}

type ImportResult = {
  ok: boolean;
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  errorRows: Array<{ row: number; reason: string; data: any }>;
  log_id?: string;
};

async function logImport(
  admin: any,
  userId: string,
  type: string,
  fileName: string,
  result: Omit<ImportResult, "ok" | "log_id">,
) {
  const { data } = await admin.from("import_logs").insert({
    import_type: type,
    file_name: fileName,
    total_rows: result.total,
    imported_rows: result.imported,
    skipped_rows: result.skipped,
    error_rows: result.errors,
    error_report: result.errorRows.length ? result.errorRows : null,
    imported_by: userId,
  }).select("id").maybeSingle();
  return data?.id as string | undefined;
}

const RowsSchema = z.object({
  file_name: z.string().default("upload.csv"),
  rows: z.array(z.record(z.string(), z.any())).max(5000),
});

export const importStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RowsSchema.parse(raw))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    await assertAdminOrManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: units } = await supabaseAdmin.from("units").select("id,name");
    const unitMap = new Map((units ?? []).map((u) => [u.name.trim().toLowerCase(), u.id]));

    const errors: ImportResult["errorRows"] = [];
    const toInsert: any[] = [];
    const seenMobiles = new Set<string>();
    let skipped = 0;

    // Pre-fetch existing mobiles
    const inputMobiles = data.rows.map((r) => normalizeMobile(r.mobile)).filter(Boolean);
    const { data: existing } = await supabaseAdmin
      .from("students").select("mobile").in("mobile", inputMobiles);
    (existing ?? []).forEach((s) => seenMobiles.add(s.mobile));

    data.rows.forEach((r, idx) => {
      const rowNum = idx + 2;
      const name = String(r.full_name || "").trim();
      const mobile = normalizeMobile(r.mobile);
      if (!name || !mobile) {
        errors.push({ row: rowNum, reason: "Missing full_name or mobile", data: r });
        return;
      }
      if (seenMobiles.has(mobile)) { skipped++; return; }
      seenMobiles.add(mobile);

      const unitName = String(r.unit_name || "").trim().toLowerCase();
      const unit_id = unitName ? unitMap.get(unitName) ?? null : null;
      if (unitName && !unit_id) {
        errors.push({ row: rowNum, reason: `Unknown unit: ${r.unit_name}`, data: r });
        return;
      }

      const docType = String(r.doc_type || "").trim().toLowerCase();
      if (docType && !["college_id", "aadhar"].includes(docType)) {
        errors.push({ row: rowNum, reason: `Invalid doc_type: ${r.doc_type}`, data: r });
        return;
      }

      toInsert.push({
        full_name: name,
        mobile,
        roll_number: r.roll_number || null,
        course: r.course || null,
        hostel_room: r.hostel_room || null,
        parent_mobile: normalizeMobile(r.parent_mobile) || null,
        email: r.email || null,
        batch_year: r.batch_year ? Number(r.batch_year) : null,
        blood_group: r.blood_group || null,
        address: r.address || null,
        unit_id,
        doc_type: docType || null,
        doc_number: r.doc_number || null,
        is_approved: true,
      });
    });

    let imported = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabaseAdmin.from("students").insert(batch);
      if (error) {
        errors.push({ row: i + 2, reason: `Batch insert failed: ${error.message}`, data: null });
      } else imported += batch.length;
    }

    const result = { total: data.rows.length, imported, skipped, errors: errors.length, errorRows: errors };
    const log_id = await logImport(supabaseAdmin, context.userId, "students", data.file_name, result);
    return { ok: true, ...result, log_id };
  });

export const importSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RowsSchema.parse(raw))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    await assertAdminOrManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: units } = await supabaseAdmin.from("units").select("id,name");
    const unitMap = new Map((units ?? []).map((u) => [u.name.trim().toLowerCase(), u.id]));

    const { data: plans } = await supabaseAdmin.from("subscription_plans").select("id,is_active").eq("is_active", true).limit(1);
    const planId = plans?.[0]?.id;
    if (!planId) throw new Error("No active subscription plan configured");

    const { data: gpSetting } = await supabaseAdmin.from("system_settings").select("value").eq("key", "grace_period_days").maybeSingle();
    const gracePeriodDays = Number(gpSetting?.value ?? 7);

    const mobiles = data.rows.map((r) => normalizeMobile(r.student_mobile)).filter(Boolean);
    const { data: students } = await supabaseAdmin.from("students").select("id,mobile").in("mobile", mobiles);
    const studentMap = new Map((students ?? []).map((s) => [s.mobile, s.id]));

    const errors: ImportResult["errorRows"] = [];
    const toInsert: any[] = [];
    let skipped = 0;

    for (let idx = 0; idx < data.rows.length; idx++) {
      const r = data.rows[idx];
      const rowNum = idx + 2;
      const mobile = normalizeMobile(r.student_mobile);
      const studentId = studentMap.get(mobile);
      if (!studentId) {
        errors.push({ row: rowNum, reason: `Student with mobile ${r.student_mobile} not found`, data: r });
        continue;
      }
      const start = parseDate(r.start_date);
      if (!start) {
        errors.push({ row: rowNum, reason: `Invalid start_date: ${r.start_date}`, data: r });
        continue;
      }
      let end = parseDate(r.end_date);
      if (!end) {
        const d = new Date(start); d.setDate(d.getDate() + 30);
        end = d.toISOString().slice(0, 10);
      }
      const graceDate = new Date(end); graceDate.setDate(graceDate.getDate() + gracePeriodDays);
      const status = String(r.status || "active").trim().toLowerCase();
      if (!["active", "grace", "expired", "pending"].includes(status)) {
        errors.push({ row: rowNum, reason: `Invalid status: ${r.status}`, data: r });
        continue;
      }
      const unitName = String(r.unit_name || "").trim().toLowerCase();
      const unit_id = unitName ? unitMap.get(unitName) ?? null : null;

      // overlap check
      const { data: overlap } = await supabaseAdmin
        .from("subscriptions").select("id").eq("student_id", studentId)
        .lte("start_date", end).gte("end_date", start).limit(1);
      if (overlap && overlap.length) { skipped++; continue; }

      toInsert.push({
        student_id: studentId, plan_id: planId, unit_id,
        start_date: start, end_date: end,
        grace_end_date: graceDate.toISOString().slice(0, 10),
        status,
      });
    }

    let imported = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabaseAdmin.from("subscriptions").insert(batch);
      if (error) errors.push({ row: i + 2, reason: `Batch insert failed: ${error.message}`, data: null });
      else imported += batch.length;
    }

    const result = { total: data.rows.length, imported, skipped, errors: errors.length, errorRows: errors };
    const log_id = await logImport(supabaseAdmin, context.userId, "subscriptions", data.file_name, result);
    return { ok: true, ...result, log_id };
  });

export const importPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RowsSchema.parse(raw))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    await assertAdminOrManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const mobiles = data.rows.map((r) => normalizeMobile(r.student_mobile)).filter(Boolean);
    const { data: students } = await supabaseAdmin.from("students").select("id,mobile").in("mobile", mobiles);
    const studentMap = new Map((students ?? []).map((s) => [s.mobile, s.id]));

    const errors: ImportResult["errorRows"] = [];
    const toInsert: any[] = [];

    for (let idx = 0; idx < data.rows.length; idx++) {
      const r = data.rows[idx];
      const rowNum = idx + 2;
      const mobile = normalizeMobile(r.student_mobile);
      const studentId = studentMap.get(mobile);
      if (!studentId) {
        errors.push({ row: rowNum, reason: `Student with mobile ${r.student_mobile} not found`, data: r });
        continue;
      }
      const amount = Number(r.amount);
      if (!amount || isNaN(amount)) {
        errors.push({ row: rowNum, reason: `Invalid amount: ${r.amount}`, data: r });
        continue;
      }
      const mode = String(r.payment_mode || "").trim().toLowerCase();
      if (!["cash", "upi", "card", "razorpay"].includes(mode)) {
        errors.push({ row: rowNum, reason: `Invalid payment_mode: ${r.payment_mode}`, data: r });
        continue;
      }
      const payDate = parseDate(r.payment_date);
      if (!payDate) {
        errors.push({ row: rowNum, reason: `Invalid payment_date: ${r.payment_date}`, data: r });
        continue;
      }

      let subscription_id: string | null = null;
      const subStart = parseDate(r.subscription_start_date);
      if (subStart) {
        const { data: sub } = await supabaseAdmin
          .from("subscriptions").select("id")
          .eq("student_id", studentId).eq("start_date", subStart).maybeSingle();
        subscription_id = sub?.id ?? null;
      }

      toInsert.push({
        student_id: studentId,
        subscription_id,
        amount,
        mode,
        status: "success",
        recorded_by: context.userId,
        created_at: new Date(payDate).toISOString(),
      });
    }

    let imported = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabaseAdmin.from("payments").insert(batch);
      if (error) errors.push({ row: i + 2, reason: `Batch insert failed: ${error.message}`, data: null });
      else imported += batch.length;
    }

    const result = { total: data.rows.length, imported, skipped: 0, errors: errors.length, errorRows: errors };
    const log_id = await logImport(supabaseAdmin, context.userId, "payments", data.file_name, result);
    return { ok: true, ...result, log_id };
  });

export const importAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RowsSchema.parse(raw))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    await assertAdminOrManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: units } = await supabaseAdmin.from("units").select("id,name");
    const unitMap = new Map((units ?? []).map((u) => [u.name.trim().toLowerCase(), u.id]));
    const defaultUnitId = units?.[0]?.id;

    const mobiles = data.rows.map((r) => normalizeMobile(r.student_mobile)).filter(Boolean);
    const { data: students } = await supabaseAdmin.from("students").select("id,mobile").in("mobile", mobiles);
    const studentMap = new Map((students ?? []).map((s) => [s.mobile, s.id]));

    const errors: ImportResult["errorRows"] = [];
    const toInsert: any[] = [];
    let skipped = 0;
    let seq = 1;

    for (let idx = 0; idx < data.rows.length; idx++) {
      const r = data.rows[idx];
      const rowNum = idx + 2;
      const mobile = normalizeMobile(r.student_mobile);
      const studentId = studentMap.get(mobile);
      if (!studentId) {
        errors.push({ row: rowNum, reason: `Student with mobile ${r.student_mobile} not found`, data: r });
        continue;
      }
      const meal = String(r.meal_type || "").trim().toLowerCase();
      if (!["lunch", "dinner"].includes(meal)) {
        errors.push({ row: rowNum, reason: `Invalid meal_type: ${r.meal_type}`, data: r });
        continue;
      }
      const scanType = String(r.scan_type || "manual").trim().toLowerCase();
      if (!["biometric", "manual"].includes(scanType)) {
        errors.push({ row: rowNum, reason: `Invalid scan_type: ${r.scan_type}`, data: r });
        continue;
      }
      const scanDate = parseDate(r.scan_date);
      if (!scanDate) {
        errors.push({ row: rowNum, reason: `Invalid scan_date: ${r.scan_date}`, data: r });
        continue;
      }
      const scanTimeStr = String(r.scan_time || "12:00").trim();
      const timeMatch = scanTimeStr.match(/^(\d{1,2}):(\d{2})$/);
      const hh = timeMatch ? timeMatch[1].padStart(2, "0") : "12";
      const mm = timeMatch ? timeMatch[2] : "00";

      const unitName = String(r.unit_name || "").trim().toLowerCase();
      const unit_id = (unitName ? unitMap.get(unitName) : null) ?? defaultUnitId;
      if (!unit_id) {
        errors.push({ row: rowNum, reason: `No unit`, data: r });
        continue;
      }

      // dup check
      const { data: dup } = await supabaseAdmin.from("attendance")
        .select("id").eq("student_id", studentId).eq("meal_type", meal as "lunch" | "dinner")
        .eq("scan_date", scanDate).limit(1);
      if (dup && dup.length) { skipped++; continue; }

      const iso = new Date(`${scanDate}T${hh}:${mm}:00`).toISOString();
      const dateCompact = scanDate.replace(/-/g, "");
      toInsert.push({
        student_id: studentId,
        unit_id,
        meal_type: meal,
        scan_type: scanType,
        scan_time: iso,
        scan_date: scanDate,
        token_number: 90000 + (seq++),
        token_printed: true,
        is_override: false,
        marked_by: context.userId,
        override_reason: `IMP-${dateCompact}-${String(seq).padStart(3, "0")}`,
      });
    }

    let imported = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabaseAdmin.from("attendance").insert(batch);
      if (error) errors.push({ row: i + 2, reason: `Batch insert failed: ${error.message}`, data: null });
      else imported += batch.length;
    }

    const result = { total: data.rows.length, imported, skipped, errors: errors.length, errorRows: errors };
    const log_id = await logImport(supabaseAdmin, context.userId, "attendance", data.file_name, result);
    return { ok: true, ...result, log_id };
  });

// ============ Excel workbook (unified 2-sheet importer) ============
// Sheet 1 = Students, Sheet 2 = Transactions.
// Match key: MOBILE (unique). Existing students are updated in place.

const UStudentRow = z.object({
  full_name: z.string().min(1),
  mobile: z.string().min(1),
  mess_no: z.string().nullable().optional(),
  unit_name: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  opening_balance: z.number().nullable().optional(),
  course: z.string().nullable().optional(),
  parent_mobile: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  blood_group: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

const UTxnRow = z.object({
  mobile: z.string().min(1),
  name: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  mode: z.enum(["cash", "upi", "card", "razorpay"]).nullable().optional(),
  sub_start: z.string().nullable().optional(),
  sub_end: z.string().nullable().optional(),
});

const UnifiedWorkbookSchema = z.object({
  file_name: z.string().default("workbook.xlsx"),
  students: z.array(UStudentRow).max(20000),
  transactions: z.array(UTxnRow).max(30000),
});

function monthBounds(iso: string): { start: string; end: string } {
  const d = new Date(iso + "T00:00:00");
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export const importExcelWorkbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UnifiedWorkbookSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdminOrManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: units } = await supabaseAdmin.from("units").select("id,name");
    const unitMap = new Map((units ?? []).map((u) => [u.name.trim().toLowerCase(), u.id]));
    const defaultUnitId =
      units?.find((u) => u.name.trim().toLowerCase() === "unit 1")?.id ?? units?.[0]?.id;
    if (!defaultUnitId) throw new Error("No units configured");

    const { data: plans } = await supabaseAdmin
      .from("subscription_plans").select("id").eq("is_active", true).limit(1);
    const planId = plans?.[0]?.id;
    if (!planId) throw new Error("No active subscription plan configured");

    const { data: gp } = await supabaseAdmin
      .from("system_settings").select("value").eq("key", "grace_period_days").maybeSingle();
    const graceDays = Number(gp?.value ?? 5);

    const errors: Array<{ section: string; row: number; reason: string }> = [];
    const summary = {
      students: { total: data.students.length, imported: 0, updated: 0, skipped: 0 },
      subscriptions: { total: 0, imported: 0, skipped: 0 },
      payments: { total: 0, imported: 0, skipped: 0, total_amount: 0 },
    };

    const allMobiles = Array.from(new Set([
      ...data.students.map((s) => normalizeMobile(s.mobile)),
      ...data.transactions.map((t) => normalizeMobile(t.mobile)),
    ].filter(Boolean)));

    const { data: existing } = await supabaseAdmin
      .from("students").select("id,mobile,roll_number").in("mobile", allMobiles);
    const mobileToId = new Map<string, string>();
    (existing ?? []).forEach((s) => { if (s.mobile) mobileToId.set(s.mobile, s.id); });

    const { data: maxRow } = await supabaseAdmin
      .from("students").select("roll_number")
      .like("roll_number", "MESS-%").order("roll_number", { ascending: false }).limit(1);
    let messCounter = 0;
    if (maxRow?.[0]?.roll_number) {
      const m = String(maxRow[0].roll_number).match(/MESS-(\d+)/);
      if (m) messCounter = Number(m[1]);
    }
    const nextMess = () => `MESS-${String(++messCounter).padStart(3, "0")}`;

    // ---------- STUDENTS (Sheet 1) ----------
    for (let idx = 0; idx < data.students.length; idx++) {
      const s = data.students[idx];
      const rowNum = idx + 2;
      const mobile = normalizeMobile(s.mobile);
      if (!s.full_name?.trim() || !mobile) {
        summary.students.skipped++;
        errors.push({ section: "students", row: rowNum, reason: "Missing name or mobile" });
        continue;
      }
      const unitId = s.unit_name
        ? unitMap.get(s.unit_name.trim().toLowerCase()) ?? defaultUnitId
        : defaultUnitId;

      const patch: any = {
        full_name: s.full_name.trim(),
        hostel_room: s.room?.trim() || null,
        course: s.course?.trim() || null,
        parent_mobile: s.parent_mobile ? normalizeMobile(s.parent_mobile) || null : null,
        email: s.email?.trim() || null,
        blood_group: s.blood_group?.trim() || null,
        address: s.address?.trim() || null,
        opening_balance: s.opening_balance ?? 0,
      };
      Object.keys(patch).forEach((k) => { if (patch[k] === null || patch[k] === "") delete patch[k]; });

      const existingId = mobileToId.get(mobile);
      if (existingId) {
        const { error } = await supabaseAdmin.from("students").update(patch).eq("id", existingId);
        if (error) errors.push({ section: "students", row: rowNum, reason: `Update failed: ${error.message}` });
        else summary.students.updated++;
      } else {
        const roll = s.mess_no?.trim() || nextMess();
        const { data: ins, error } = await supabaseAdmin.from("students").insert({
          ...patch,
          mobile,
          roll_number: roll,
          unit_id: unitId,
          is_approved: true,
        }).select("id").maybeSingle();
        if (error || !ins) {
          errors.push({ section: "students", row: rowNum, reason: `Insert failed: ${error?.message || "unknown"}` });
        } else {
          mobileToId.set(mobile, ins.id);
          summary.students.imported++;
        }
      }
    }

    // ---------- TRANSACTIONS (Sheet 2) ----------
    for (let idx = 0; idx < data.transactions.length; idx++) {
      const t = data.transactions[idx];
      const rowNum = idx + 2;
      const mobile = normalizeMobile(t.mobile);
      if (!mobile) {
        errors.push({ section: "transactions", row: rowNum, reason: "Missing mobile" });
        continue;
      }
      let studentId = mobileToId.get(mobile);

      if (!studentId) {
        const name = t.name?.trim() || `Student ${mobile}`;
        const { data: ins, error } = await supabaseAdmin.from("students").insert({
          full_name: name,
          mobile,
          roll_number: nextMess(),
          unit_id: defaultUnitId,
          is_approved: true,
        }).select("id").maybeSingle();
        if (error || !ins) {
          errors.push({ section: "transactions", row: rowNum, reason: `Auto-create student failed: ${error?.message}` });
          continue;
        }
        studentId = ins.id;
        mobileToId.set(mobile, studentId);
        summary.students.imported++;
      }

      const hasPayment = !!(t.amount && t.amount > 0);
      const hasSubDates = !!(t.sub_start || t.sub_end);

      if (!hasPayment && !hasSubDates) {
        summary.payments.skipped++;
        continue;
      }

      const payDate = t.date || t.sub_start || new Date().toISOString().slice(0, 10);
      const anchor = t.sub_start || t.date || payDate;
      const bounds = monthBounds(anchor);
      const subStart = t.sub_start || bounds.start;
      const subEnd = t.sub_end || bounds.end;

      let subscription_id: string | null = null;
      {
        const { data: existSub } = await supabaseAdmin
          .from("subscriptions").select("id")
          .eq("student_id", studentId).eq("start_date", subStart).maybeSingle();
        if (existSub) {
          subscription_id = existSub.id;
          summary.subscriptions.skipped++;
        } else {
          const grace = new Date(subEnd + "T00:00:00");
          grace.setDate(grace.getDate() + graceDays);
          const graceEnd = grace.toISOString().slice(0, 10);
          const today = new Date().toISOString().slice(0, 10);
          let status: "active" | "expired" | "grace" | "pending" = "active";
          if (subEnd < today) status = today <= graceEnd ? "grace" : "expired";
          const { data: subIns, error: subErr } = await supabaseAdmin.from("subscriptions").insert({
            student_id: studentId,
            plan_id: planId,
            unit_id: defaultUnitId,
            start_date: subStart,
            end_date: subEnd,
            grace_end_date: graceEnd,
            status,
          }).select("id").maybeSingle();
          if (subErr) {
            errors.push({ section: "transactions", row: rowNum, reason: `Sub failed: ${subErr.message}` });
          } else if (subIns) {
            subscription_id = subIns.id;
            summary.subscriptions.imported++;
          }
        }
        summary.subscriptions.total++;
      }

      if (hasPayment) {
        const mode = t.mode || "upi";
        const { error } = await supabaseAdmin.from("payments").insert({
          student_id: studentId,
          subscription_id,
          amount: t.amount!,
          mode,
          status: "success",
          recorded_by: context.userId,
          created_at: new Date(payDate + "T12:00:00Z").toISOString(),
        });
        if (error) {
          errors.push({ section: "transactions", row: rowNum, reason: `Payment failed: ${error.message}` });
        } else {
          summary.payments.imported++;
          summary.payments.total_amount += t.amount!;
        }
        summary.payments.total++;
      }
    }

    await logImport(supabaseAdmin, context.userId, "excel_workbook", data.file_name, {
      total: summary.students.total + summary.payments.total,
      imported: summary.students.imported + summary.students.updated + summary.payments.imported,
      skipped: summary.students.skipped + summary.payments.skipped,
      errors: errors.length,
      errorRows: errors.map((e) => ({ row: e.row, reason: `[${e.section}] ${e.reason}`, data: null })),
    });

    return { ok: true, summary, errors };
  });


