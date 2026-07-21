import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Upload, AlertTriangle, CheckCircle2, XCircle, Loader2, FileText, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, roleFlags } from "@/hooks/use-current-user";
import { importStudents, importSubscriptions, importPayments, importAttendance, importExcelWorkbook } from "@/lib/imports.functions";


export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import Data — Vrindavan Meals" }] }),
  component: ImportPage,
});

const TEMPLATES: Record<string, { headers: string[]; samples: string[][] }> = {
  students: {
    headers: ["full_name", "mobile", "roll_number", "course", "hostel_room", "parent_mobile", "email", "batch_year", "blood_group", "address", "unit_name", "doc_type", "doc_number"],
    samples: [
      ["Priya Sharma", "9876543210", "R101", "B.Sc", "A-12", "9123456789", "priya@example.com", "2024", "O+", "Latur", "Unit 1", "college_id", "COL-2024-101"],
      ["Anita Patel", "9876543211", "R102", "B.Com", "A-13", "", "", "2024", "", "", "Unit 2", "aadhar", "1234-5678-9012"],
    ],
  },
  subscriptions: {
    headers: ["student_mobile", "unit_name", "start_date", "end_date", "status"],
    samples: [
      ["9876543210", "Unit 1", "01-01-2026", "31-01-2026", "active"],
      ["9876543211", "Unit 2", "01-06-2025", "30-06-2025", "expired"],
    ],
  },
  payments: {
    headers: ["student_mobile", "amount", "payment_mode", "payment_date", "reference_note", "subscription_start_date"],
    samples: [
      ["9876543210", "3000", "upi", "01-01-2026", "UPI-Ref-12345", "01-01-2026"],
      ["9876543211", "3000", "cash", "01-06-2025", "Cash receipt #45", "01-06-2025"],
    ],
  },
  attendance: {
    headers: ["student_mobile", "unit_name", "meal_type", "scan_date", "scan_time", "scan_type"],
    samples: [
      ["9876543210", "Unit 1", "lunch", "15-01-2026", "13:15", "biometric"],
      ["9876543210", "Unit 1", "dinner", "15-01-2026", "20:30", "manual"],
    ],
  },
};

function ImportPage() {
  const { roles } = useCurrentUser();
  const flags = roleFlags(roles);
  if (!flags.isSuperAdmin && !flags.isManager) {
    return <div className="max-w-md mx-auto mt-16 text-center"><h2 className="text-xl font-semibold">Restricted</h2><p className="text-muted-foreground">Only Super Admins and Managers can import data.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Data Import</h1>
        <p className="text-muted-foreground">Onboard historical data before going live.</p>
      </div>
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>This action cannot be undone. Please download a database backup before importing large datasets.</AlertDescription>
      </Alert>
      <Tabs defaultValue="excel">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="excel">Excel Workbook</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>
        <TabsContent value="excel"><ExcelWorkbookTab /></TabsContent>
        <TabsContent value="students"><ImportTab kind="students" fn={importStudents} /></TabsContent>
        <TabsContent value="subscriptions"><ImportTab kind="subscriptions" fn={importSubscriptions} /></TabsContent>
        <TabsContent value="payments"><ImportTab kind="payments" fn={importPayments} /></TabsContent>
        <TabsContent value="attendance"><ImportTab kind="attendance" fn={importAttendance} /></TabsContent>
      </Tabs>
      <ImportHistory />
    </div>
  );
}


function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function ImportTab({ kind, fn }: { kind: string; fn: any }) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const runFn = useServerFn(fn);
  const template = TEMPLATES[kind];

  const importM = useMutation({
    mutationFn: async () => runFn({ data: { file_name: file?.name || "upload.csv", rows } }),
    onSuccess: (res: any) => { setResult(res); toast.success(`Imported ${res.imported}/${res.total}`); },
    onError: (e: any) => toast.error(e.message),
  });

  function onFile(f: File) {
    setFile(f); setResult(null);
    Papa.parse(f, {
      header: true, skipEmptyLines: true,
      complete: (res) => setRows(res.data as any[]),
      error: (e) => toast.error(e.message),
    });
  }

  return (
    <Card className="mt-4"><CardContent className="p-6 space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => downloadCsv(`${kind}-template.csv`, [template.headers, ...template.samples])}>
          <Download className="h-4 w-4 mr-2" />Download Template
        </Button>
        <label className="inline-flex">
          <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button variant="secondary" asChild><span><Upload className="h-4 w-4 mr-2" />{file ? file.name : "Upload CSV"}</span></Button>
        </label>
      </div>

      {rows.length > 0 && !result && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Preview — first 10 of {rows.length} rows</div>
          <div className="border rounded-md overflow-auto max-h-80">
            <Table>
              <TableHeader><TableRow>{template.headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 10).map((r, i) => (
                  <TableRow key={i}>{template.headers.map((h) => <TableCell key={h} className="text-xs">{String(r[h] ?? "")}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button onClick={() => importM.mutate()} disabled={importM.isPending}>
            {importM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirm Import ({rows.length} rows)
          </Button>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <ResultBox icon={CheckCircle2} label="Imported" value={result.imported} color="text-emerald-600" />
            <ResultBox icon={AlertTriangle} label="Skipped" value={result.skipped} color="text-amber-600" />
            <ResultBox icon={XCircle} label="Errors" value={result.errors} color="text-red-600" />
          </div>
          {result.errorRows?.length > 0 && (
            <>
              <div className="text-sm font-medium">Errors:</div>
              <div className="border rounded-md overflow-auto max-h-60">
                <Table>
                  <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {result.errorRows.slice(0, 50).map((e: any, i: number) => (
                      <TableRow key={i}><TableCell>{e.row}</TableCell><TableCell className="text-xs">{e.reason}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button variant="outline" onClick={() => downloadCsv(`${kind}-errors.csv`, [["row", "reason"], ...result.errorRows.map((e: any) => [String(e.row), e.reason])])}>
                <Download className="h-4 w-4 mr-2" />Download Error Report
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => { setFile(null); setRows([]); setResult(null); }}>Import Another File</Button>
        </div>
      )}
    </CardContent></Card>
  );
}

function ResultBox({ icon: Icon, label, value, color }: any) {
  return (
    <div className="border rounded-md p-3 flex items-center gap-3">
      <Icon className={`h-6 w-6 ${color}`} />
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold">{value}</div></div>
    </div>
  );
}

function ImportHistory() {
  const { data } = useQuery({
    queryKey: ["import_logs"],
    queryFn: async () => (await supabase.from("import_logs").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Import History</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Type</TableHead><TableHead>File</TableHead><TableHead>Total</TableHead>
            <TableHead>Imported</TableHead><TableHead>Skipped</TableHead><TableHead>Errors</TableHead><TableHead>Date</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(data ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No imports yet</TableCell></TableRow>
              : (data ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="capitalize">{l.import_type}</TableCell>
                  <TableCell className="text-xs">{l.file_name}</TableCell>
                  <TableCell>{l.total_rows}</TableCell>
                  <TableCell className="text-emerald-600">{l.imported_rows}</TableCell>
                  <TableCell className="text-amber-600">{l.skipped_rows}</TableCell>
                  <TableCell className="text-red-600">{l.error_rows}</TableCell>
                  <TableCell className="text-xs">{new Date(l.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============ Excel Workbook (multi-sheet legacy format) ============

function excelDateToISO(serial: any): string | null {
  if (serial == null || serial === "") return null;
  if (typeof serial === "string") {
    const s = serial.trim();
    const dm = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dm) return `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
    const ym = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}-${ym[3].padStart(2, "0")}`;
    const n = Number(s);
    if (!isNaN(n) && n > 20000 && n < 80000) serial = n;
    else return null;
  }
  if (typeof serial !== "number" || isNaN(serial)) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function padMess(n: any): string | null {
  if (n == null || n === "") return null;
  const s = String(n).trim();
  // Already MESS-001 style?
  const m = s.match(/^MESS[-_ ]?(\d+)$/i);
  if (m) return `MESS-${m[1].padStart(3, "0")}`;
  const num = Number(s);
  if (isNaN(num)) return null;
  return `MESS-${String(num).padStart(3, "0")}`;
}


function normalizeMode(v: any): "cash" | "upi" | "card" | "razorpay" {
  const s = String(v || "").toLowerCase();
  if (s.includes("cash")) return "cash";
  if (s.includes("card")) return "card";
  if (s.includes("razor")) return "razorpay";
  return "upi";
}

type OpeningBalance = { mess_no: string; opening_balance: number; as_of: string };

type Parsed = {
  fileName: string;
  students: any[];
  subscriptions: any[];
  payments: any[];
  openingBalances: OpeningBalance[];
  openingAsOf: string | null;
  masterRaw: number;
  receiptsRaw: number;
  ledgerRaw: number;
  openingRaw: number;
  skippedStudents: number;
  skippedPayments: number;
  skippedSubs: number;
  skippedOpening: number;
};

function isoOnly(v: any): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return excelDateToISO(v);
}

function parseCleanWorkbook(
  fileName: string,
  wb: XLSX.WorkBook,
  studentsSheet: string,
  paymentsSheet: string,
  subsSheet: string,
): Parsed {
  const sRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[studentsSheet], { raw: true, defval: null });
  const pRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[paymentsSheet], { raw: true, defval: null });
  const subRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[subsSheet], { raw: true, defval: null });

  const students: any[] = [];
  let skippedStudents = 0;
  for (const r of sRows) {
    const name = String(r["STUDENT NAME"] ?? r["Student Name"] ?? "").trim();
    const messNo = padMess(r["MESS NO"] ?? r["Mess No"]);
    if (!name || !messNo) { skippedStudents++; continue; }
    const room = r["ROOM NO"] != null && String(r["ROOM NO"]).trim() !== ""
      ? String(r["ROOM NO"]).trim() : null;
    const mobileRaw = r["MOBILE"] ?? r["Mobile"];
    const mobile = mobileRaw ? String(mobileRaw).replace(/\D/g, "").slice(-10) : null;
    const status = String(r["STATUS"] ?? "").trim().toLowerCase();
    students.push({
      mess_no: messNo,
      full_name: titleCase(name),
      mobile: mobile || null,
      hostel_room: room,
      joining_date: isoOnly(r["JOINING DATE"]),
      exit_date: isoOnly(r["EXIT DATE"]),
      is_inactive: status === "inactive",
    });
  }

  const payments: any[] = [];
  let skippedPayments = 0;
  for (const r of pRows) {
    const messNo = padMess(r["MESS NO"] ?? r["Mess No"]);
    const amount = Number(r["AMOUNT"] ?? r["Amount"]);
    const paidAt = isoOnly(r["PAYMENT DATE"] ?? r["Date"]);
    if (!messNo || !paidAt || !amount || isNaN(amount) || amount <= 0) { skippedPayments++; continue; }
    const modeRaw = String(r["PAYMENT MODE"] ?? "").trim().toLowerCase();
    const mode: "cash" | "upi" | "card" | "razorpay" =
      modeRaw === "cash" ? "cash" : modeRaw === "card" ? "card" : modeRaw === "razorpay" ? "razorpay" : "upi";
    const remarks = r["REMARKS"];
    payments.push({
      mess_no: messNo,
      amount,
      mode,
      paid_at: paidAt,
      reference_note: remarks != null && remarks !== "" ? String(remarks).trim() : null,
    });
  }

  const subscriptions: any[] = [];
  let skippedSubs = 0;
  for (const r of subRows) {
    const messNo = padMess(r["MESS NO"] ?? r["Mess No"]);
    const start = isoOnly(r["START DATE"]);
    if (!messNo || !start) { skippedSubs++; continue; }
    const end = isoOnly(r["END DATE"]);
    const subStatus = String(r["SUB STATUS"] ?? "").trim().toLowerCase();
    const inactive = subStatus === "expired" || subStatus === "inactive" || subStatus === "closed";
    subscriptions.push({
      mess_no: messNo,
      start_date: start,
      end_date: end,
      is_inactive: inactive,
    });
  }

  return {
    fileName,
    students, subscriptions, payments,
    openingBalances: [],
    openingAsOf: null,
    masterRaw: sRows.length,
    receiptsRaw: pRows.length,
    ledgerRaw: subRows.length,
    openingRaw: 0,
    skippedStudents, skippedPayments, skippedSubs,
    skippedOpening: 0,
  };
}

function parseOpeningBalanceSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
): { rows: OpeningBalance[]; raw: number; skipped: number; asOf: string | null } {
  // Extract "as of DD MMM YYYY" from sheet name
  const asOfMatch = sheetName.match(/as\s+of\s+([\d]{1,2})\s*([A-Za-z]+)\s*(\d{4})/i);
  let asOf: string | null = null;
  if (asOfMatch) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const m = months[asOfMatch[2].slice(0, 3).toLowerCase()];
    if (m) asOf = `${asOfMatch[3]}-${m}-${asOfMatch[1].padStart(2, "0")}`;
  }
  const raw = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheetName], { raw: true, defval: null });
  const rows: OpeningBalance[] = [];
  let skipped = 0;
  for (const r of raw) {
    const messNo = padMess(r["MESS NO"] ?? r["Mess No"] ?? r["mess_no"]);
    const balRaw = r["OPENING BALANCE"] ?? r["Opening Balance"] ?? r["BALANCE"] ?? r["Balance"] ?? r["DUE"] ?? r["Due"];
    if (!messNo || balRaw == null || balRaw === "") { skipped++; continue; }
    const bal = Number(balRaw);
    if (isNaN(bal)) { skipped++; continue; }
    rows.push({ mess_no: messNo, opening_balance: bal, as_of: asOf ?? new Date().toISOString().slice(0, 10) });
  }
  return { rows, raw: raw.length, skipped, asOf };
}

function parseWorkbook(file: File): Promise<Parsed> {

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result as ArrayBuffer, { type: "array" });
        const findSheet = (name: string) =>
          wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase());

        // ---------- Opening Balance template detection ----------
        // Sheets: "Student Master" + "Opening Balance as of <date>" + "Transactions from <month> onwards"
        const studentMasterSheet = wb.SheetNames.find((n) => /^student\s*master$/i.test(n.trim()));
        const openingSheet = wb.SheetNames.find((n) => /^opening\s+balance/i.test(n.trim()));
        const txnSheet = wb.SheetNames.find((n) => /^transactions?/i.test(n.trim()));
        if (studentMasterSheet && openingSheet && txnSheet) {
          // Reuse clean parser for student master + transactions (payments).
          // Subscriptions sheet is optional in this template.
          const subsSheet = findSheet("Subscriptions") ?? studentMasterSheet;
          const parsed = parseCleanWorkbook(file.name, wb, studentMasterSheet, txnSheet, subsSheet);
          if (subsSheet === studentMasterSheet) {
            parsed.subscriptions = [];
            parsed.ledgerRaw = 0;
            parsed.skippedSubs = 0;
          }
          const ob = parseOpeningBalanceSheet(wb, openingSheet);
          parsed.openingBalances = ob.rows;
          parsed.openingAsOf = ob.asOf;
          parsed.openingRaw = ob.raw;
          parsed.skippedOpening = ob.skipped;
          resolve(parsed);
          return;
        }

        // ---------- Clean format detection ----------
        // "Vrindavan_Meals_Clean.xlsx": sheets Students / Payments / Subscriptions
        const cleanStudents = findSheet("Students");
        const cleanPayments = findSheet("Payments");
        const cleanSubs = findSheet("Subscriptions");
        if (cleanStudents && cleanPayments && cleanSubs) {
          resolve(parseCleanWorkbook(file.name, wb, cleanStudents, cleanPayments, cleanSubs));
          return;
        }


        // ---------- Legacy format (Master / Receipts / STUDENT LEDGER) ----------
        const mName = findSheet("Master");
        const rName = findSheet("Receipts");
        const lName = findSheet("STUDENT LEDGER") ?? findSheet("Student Ledger");
        if (!mName) throw new Error("No recognised sheets. Expected either Students/Payments/Subscriptions (clean) or Master/Receipts/STUDENT LEDGER (legacy).");

        const master = mName ? XLSX.utils.sheet_to_json<any>(wb.Sheets[mName], { raw: true, defval: null }) : [];
        const receiptsAoA: any[][] = rName
          ? XLSX.utils.sheet_to_json(wb.Sheets[rName], { header: 1, raw: true, defval: null })
          : [];
        const ledger = lName ? XLSX.utils.sheet_to_json<any>(wb.Sheets[lName], { raw: true, defval: null }) : [];

        const students: any[] = [];
        let skippedStudents = 0;
        for (const row of master) {
          const name = String(row["Student Name"] ?? row["Name"] ?? "").trim();
          const messNo = padMess(row["Mess No"] ?? row["Mess no"]);
          if (!name || !messNo) { skippedStudents++; continue; }
          const roomRaw = row["Room No"];
          const room = roomRaw == null || String(roomRaw).trim().toLowerCase() === "no"
            ? null : String(roomRaw).trim();
          const mobileRaw = row["Mobile no"] ?? row["Mobile No"] ?? row["Mobile"];
          const mobile = mobileRaw ? String(mobileRaw).replace(/\D/g, "").slice(-10) : null;
          const inactive = String(row["Inactive"] ?? "").trim().toLowerCase() === "inactive";
          students.push({
            mess_no: messNo,
            full_name: titleCase(name),
            mobile: mobile || null,
            hostel_room: room,
            joining_date: excelDateToISO(row["Joining Date"]),
            exit_date: excelDateToISO(row["Exit Date"]),
            is_inactive: inactive,
          });
        }

        const subscriptions: any[] = [];
        let skippedSubs = 0;
        const source = ledger.length ? ledger : master;
        for (const row of source) {
          const name = String(row["Name"] ?? row["Student Name"] ?? "").trim();
          const messNo = padMess(row["Mess No"] ?? row["Mess no"]);
          if (!name || !messNo) { skippedSubs++; continue; }
          const start = excelDateToISO(row["Date of Admission"] ?? row["Joining Date"]);
          if (!start) { skippedSubs++; continue; }
          const end = excelDateToISO(row["Date of Exit"] ?? row["Exit Date"]);
          const statusRaw = String(row["Status"] ?? row["Inactive"] ?? "").trim().toLowerCase();
          const inactive = statusRaw.includes("inactive") || statusRaw === "closed";
          subscriptions.push({
            mess_no: messNo,
            start_date: start,
            end_date: end,
            is_inactive: inactive,
          });
        }

        const payments: any[] = [];
        let skippedPayments = 0;
        const receiptRows = receiptsAoA.slice(1);
        for (const row of receiptRows) {
          if (!row || row.every((c) => c == null || c === "")) { skippedPayments++; continue; }
          const dateCell = row[0];
          const messRaw = row[1];
          const amountCell = row[3];
          const modeRaw = row[10];
          const remarks = row[11];
          if (messRaw == null || messRaw === "") { skippedPayments++; continue; }
          const messStr = String(messRaw).trim();
          if (messStr.toLowerCase() === "mess no" || messStr.toLowerCase() === "mess no.") { skippedPayments++; continue; }
          if (amountCell == null || amountCell === "") { skippedPayments++; continue; }
          if (typeof amountCell === "string" && /#(NUM|N\/A|VALUE|REF|DIV|NAME)/i.test(amountCell)) { skippedPayments++; continue; }
          const amount = Number(amountCell);
          if (isNaN(amount) || amount <= 0) { skippedPayments++; continue; }
          const messNo = padMess(messStr);
          if (!messNo) { skippedPayments++; continue; }
          const paidAt = excelDateToISO(dateCell);
          if (!paidAt) { skippedPayments++; continue; }
          payments.push({
            mess_no: messNo, amount, mode: normalizeMode(modeRaw), paid_at: paidAt,
            reference_note: remarks != null && remarks !== "" ? String(remarks).trim() : null,
          });
        }

        resolve({
          fileName: file.name,
          students, subscriptions, payments,
          openingBalances: [],
          openingAsOf: null,
          masterRaw: master.length,
          receiptsRaw: receiptsAoA.length > 0 ? receiptsAoA.length - 1 : 0,
          ledgerRaw: ledger.length,
          openingRaw: 0,
          skippedStudents, skippedPayments, skippedSubs,
          skippedOpening: 0,
        });
      } catch (e: any) {

        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function ExcelWorkbookTab() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const runFn = useServerFn(importExcelWorkbook);

  const runImport = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error("Nothing to import");
      return runFn({
        data: {
          file_name: parsed.fileName,
          students: parsed.students,
          subscriptions: parsed.subscriptions,
          payments: parsed.payments,
        },
      });
    },
    onSuccess: (res: any) => {
      setResult(res);
      toast.success(`Import complete — ${res.summary.students.imported} students, ${res.summary.payments.imported} payments`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function onFile(f: File) {
    setBusy(true); setResult(null); setParsed(null);
    try {
      const p = await parseWorkbook(f);
      setParsed(p);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4"><CardContent className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <label className="inline-flex">
          <input type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button variant="secondary" asChild>
            <span>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
              {parsed ? parsed.fileName : "Upload Vrindavan_Meals.xlsx"}
            </span>
          </Button>
        </label>
        <span className="text-xs text-muted-foreground">Expected sheets: Master, Receipts, STUDENT LEDGER</span>
      </div>

      {parsed && !result && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <PanelStat label="Master (Students)" total={parsed.masterRaw} valid={parsed.students.length} skipped={parsed.skippedStudents} />
            <PanelStat label="Receipts (Payments)" total={parsed.receiptsRaw} valid={parsed.payments.length} skipped={parsed.skippedPayments} />
            <PanelStat label="Ledger (Subscriptions)" total={parsed.ledgerRaw} valid={parsed.subscriptions.length} skipped={parsed.skippedSubs} />
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Import order: <strong>Students → Subscriptions → Payments</strong>. All students assigned to Unit 1 by default.
              Existing students (matched by Mess No) will be skipped, not overwritten.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button onClick={() => runImport.mutate()} disabled={runImport.isPending}>
              {runImport.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Import
            </Button>
            <Button variant="ghost" onClick={() => setParsed(null)}>Cancel</Button>
          </div>
        </>
      )}

      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ResultBox icon={CheckCircle2} label="Students imported" value={`${result.summary.students.imported} / ${result.summary.students.total}`} color="text-emerald-600" />
            <ResultBox icon={CheckCircle2} label="Subscriptions" value={`${result.summary.subscriptions.imported} / ${result.summary.subscriptions.total}`} color="text-emerald-600" />
            <ResultBox icon={CheckCircle2} label="Payments" value={`${result.summary.payments.imported} / ${result.summary.payments.total}`} color="text-emerald-600" />
            <ResultBox icon={CheckCircle2} label="Total collected" value={`₹${Number(result.summary.payments.total_amount).toLocaleString("en-IN")}`} color="text-emerald-600" />
          </div>

          {result.errors?.length > 0 && (
            <>
              <div className="text-sm font-medium">Errors ({result.errors.length}):</div>
              <div className="border rounded-md overflow-auto max-h-60">
                <Table>
                  <TableHeader><TableRow><TableHead>Section</TableHead><TableHead>Row</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {result.errors.slice(0, 100).map((e: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="capitalize">{e.section}</TableCell>
                        <TableCell>{e.row}</TableCell>
                        <TableCell className="text-xs">{e.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button variant="outline" onClick={() => {
                const rows = [["section", "row", "reason"], ...result.errors.map((e: any) => [e.section, String(e.row), e.reason])];
                const csv = rows.map((r) => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "excel-import-errors.csv"; a.click();
                URL.revokeObjectURL(url);
              }}><Download className="h-4 w-4 mr-2" />Download Error CSV</Button>
            </>
          )}
          <Button variant="ghost" onClick={() => { setParsed(null); setResult(null); }}>Import Another File</Button>
        </div>
      )}
    </CardContent></Card>
  );
}

function PanelStat({ label, total, valid, skipped }: { label: string; total: number; valid: number; skipped: number }) {
  return (
    <div className="border rounded-md p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1">{total} <span className="text-sm font-normal text-muted-foreground">rows</span></div>
      <div className="text-xs mt-2 space-x-3">
        <span className="text-emerald-600">✓ {valid} valid</span>
        <span className="text-amber-600">⚠ {skipped} skipped</span>
      </div>
    </div>
  );
}

