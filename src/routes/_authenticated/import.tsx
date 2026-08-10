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
import { importPayments, importAttendance, importExcelWorkbook } from "@/lib/imports.functions";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import Data — Vrindavan Meals" }] }),
  component: ImportPage,
});

const TEMPLATES: Record<string, { headers: string[]; samples: string[][] }> = {
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
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="excel">Excel Workbook</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>
        <TabsContent value="excel"><ExcelWorkbookTab /></TabsContent>
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

// ============ Excel Workbook — Unified 2-sheet format ============

function excelDateToISO(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim();
    const dm = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dm) return `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
    const ym = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}-${ym[3].padStart(2, "0")}`;
    const n = Number(s);
    if (!isNaN(n) && n > 20000 && n < 80000) v = n;
    else return null;
  }
  if (typeof v !== "number" || isNaN(v)) return null;
  const ms = Math.round((v - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeMode(v: any): "cash" | "upi" | "card" | "razorpay" | null {
  if (v == null || String(v).trim() === "") return null;
  const s = String(v).toLowerCase();
  if (s.includes("cash")) return "cash";
  if (s.includes("card")) return "card";
  if (s.includes("razor")) return "razorpay";
  if (s.includes("upi")) return "upi";
  return "upi";
}

function pickSheet(wb: XLSX.WorkBook, patterns: RegExp[]): string | undefined {
  return wb.SheetNames.find((n) => patterns.some((p) => p.test(n.trim())));
}

type StudentRow = {
  full_name: string; mobile: string; mess_no: string | null;
  unit_name: string | null; room: string | null; opening_balance: number | null;
  course: string | null; parent_mobile: string | null; email: string | null;
  blood_group: string | null; address: string | null;
  joining_date: string | null; exit_date: string | null; status: "active" | "inactive";
};
type TxnRow = {
  mobile: string; name: string | null; date: string | null;
  amount: number | null; mode: "cash" | "upi" | "card" | "razorpay" | null;
  sub_start: string | null; sub_end: string | null;
};

type Parsed = {
  fileName: string;
  students: StudentRow[];
  transactions: TxnRow[];
  studentsRaw: number;
  txnsRaw: number;
  skippedStudents: number;
  skippedTxns: number;
  rowErrors: Array<{ section: string; row: number; reason: string }>;
};


function pick(r: any, keys: string[]): any {
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
    const upper = Object.keys(r).find((x) => x.trim().toLowerCase() === k.toLowerCase());
    if (upper && r[upper] !== null && r[upper] !== "") return r[upper];
  }
  return null;
}

function parseWorkbook(file: File): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result as ArrayBuffer, { type: "array" });
        const studentsSheet = pickSheet(wb, [/^students?$/i, /^student\s*master$/i, /^master$/i]);
        const txnSheet = pickSheet(wb, [/^transactions?$/i, /^payments?$/i, /^receipts?$/i]);
        if (!studentsSheet) throw new Error("No 'Students' sheet found. Download the template to see the expected format.");

        const sRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[studentsSheet], { raw: true, defval: null });
        const students: StudentRow[] = [];
        let skippedStudents = 0;
        for (const r of sRows) {
          const name = String(pick(r, ["Name", "STUDENT NAME", "Student Name", "full_name"]) ?? "").trim();
          const mobileRaw = pick(r, ["Mobile", "MOBILE", "Mobile No", "mobile"]);
          const mobile = mobileRaw ? String(mobileRaw).replace(/\D/g, "").slice(-10) : "";
          if (!name || !mobile) { skippedStudents++; continue; }
          const messRaw = pick(r, ["Mess No", "MESS NO", "mess_no"]);
          const ob = pick(r, ["Opening Balance", "OPENING BALANCE", "opening_balance"]);
          students.push({
            full_name: name,
            mobile,
            mess_no: messRaw ? String(messRaw).trim() : null,
            unit_name: (pick(r, ["Unit", "UNIT", "unit_name"]) ?? null) as any,
            room: (pick(r, ["Room", "ROOM", "Room No", "hostel_room"]) ?? null) as any,
            opening_balance: ob != null && ob !== "" && !isNaN(Number(ob)) ? Number(ob) : null,
            course: (pick(r, ["Course", "COURSE", "course"]) ?? null) as any,
            parent_mobile: (pick(r, ["Parent Mobile", "PARENT MOBILE", "parent_mobile"]) ?? null) as any,
            email: (pick(r, ["Email", "EMAIL", "email"]) ?? null) as any,
            blood_group: (pick(r, ["Blood Group", "BLOOD GROUP", "blood_group"]) ?? null) as any,
            address: (pick(r, ["Address", "ADDRESS", "address"]) ?? null) as any,
          });
        }

        const transactions: TxnRow[] = [];
        let skippedTxns = 0;
        let txnsRaw = 0;
        if (txnSheet) {
          const tRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[txnSheet], { raw: true, defval: null });
          txnsRaw = tRows.length;
          for (const r of tRows) {
            const isEmpty = Object.values(r).every((v) => v == null || v === "");
            if (isEmpty) { skippedTxns++; continue; }
            const mobileRaw = pick(r, ["Mobile", "MOBILE", "Mobile No", "mobile", "student_mobile"]);
            const mobile = mobileRaw ? String(mobileRaw).replace(/\D/g, "").slice(-10) : "";
            const name = pick(r, ["Name", "STUDENT NAME", "Student Name"]);
            if (!mobile && !name) { skippedTxns++; continue; }
            if (!mobile) { skippedTxns++; continue; } // name-only cannot match; skip
            const amtRaw = pick(r, ["Amount", "AMOUNT", "amount"]);
            const amount = amtRaw != null && amtRaw !== "" && !isNaN(Number(amtRaw)) ? Number(amtRaw) : null;
            transactions.push({
              mobile,
              name: name ? String(name).trim() : null,
              date: excelDateToISO(pick(r, ["Date", "DATE", "Payment Date", "PAYMENT DATE", "payment_date"])),
              amount,
              mode: normalizeMode(pick(r, ["Mode", "MODE", "Payment Mode", "PAYMENT MODE"])),
              sub_start: excelDateToISO(pick(r, ["Subscription Start Date", "Sub Start", "SUB START", "START DATE", "Start Date"])),
              sub_end: excelDateToISO(pick(r, ["Subscription End Date", "Sub End", "SUB END", "END DATE", "End Date"])),
            });
          }
        }

        resolve({
          fileName: file.name,
          students, transactions,
          studentsRaw: sRows.length,
          txnsRaw,
          skippedStudents, skippedTxns,
        });
      } catch (e: any) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function downloadMasterTemplate() {
  const wb = XLSX.utils.book_new();
  const students = [
    ["Name*", "Mobile*", "Mess No", "Unit", "Room", "Opening Balance", "Course", "Parent Mobile", "Email", "Blood Group", "Address"],
    ["Priya Sharma", "9876543210", "MESS-001", "Unit 1", "A-101", 0, "B.Sc", "9123456789", "priya@example.com", "O+", "Latur"],
    ["Anita Patel", "9876543211", "", "", "A-102", 1200, "", "", "", "", ""],
  ];
  const txns = [
    ["Mobile*", "Name", "Date", "Amount", "Mode", "Subscription Start Date", "Subscription End Date"],
    ["9876543210", "Priya Sharma", "2026-07-05", 3500, "UPI", "2026-07-01", "2026-07-31"],
    ["9876543211", "Anita Patel", "2026-07-10", 3500, "Cash", "", ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(students), "Students");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txns), "Transactions");
  XLSX.writeFile(wb, `Vrindavan_Meals_Template.xlsx`);
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
          transactions: parsed.transactions,
        },
      });
    },
    onSuccess: (res: any) => {
      setResult(res);
      toast.success(`Import complete — ${res.summary.students.imported} new, ${res.summary.students.updated} updated, ${res.summary.payments.imported} payments`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function onFile(f: File) {
    setBusy(true); setResult(null); setParsed(null);
    try { setParsed(await parseWorkbook(f)); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card className="mt-4"><CardContent className="p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" onClick={downloadMasterTemplate}>
          <Download className="h-4 w-4 mr-2" />Download Template
        </Button>
        <label className="inline-flex">
          <input type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button variant="secondary" asChild>
            <span>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
              {parsed ? parsed.fileName : "Upload Excel Workbook"}
            </span>
          </Button>
        </label>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <div><strong>Unified format — 2 sheets:</strong></div>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><strong>Students</strong> — required: <code>Name</code>, <code>Mobile</code>. Optional: Mess No (auto-generated if blank), Unit, Room, Opening Balance, Course, Parent Mobile, Email, Blood Group, Address.</li>
          <li><strong>Transactions</strong> — required: <code>Mobile</code>. Optional: Date, Amount, Mode (Cash/UPI/Card/Razorpay), Subscription Start/End Date (defaults to the transaction month's 1st–last day).</li>
        </ul>
        <div className="pt-1">Match key is <strong>Mobile number</strong>. Existing students are updated in place — no duplicates. Rows without Amount are skipped (no payment recorded).</div>
      </div>

      {parsed && !result && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <PanelStat label="Students" total={parsed.studentsRaw} valid={parsed.students.length} skipped={parsed.skippedStudents} />
            <PanelStat label="Transactions" total={parsed.txnsRaw} valid={parsed.transactions.length} skipped={parsed.skippedTxns} />
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Existing students matched by <strong>Mobile</strong> will be updated with any filled fields. Transactions without Amount will be skipped.
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
            <ResultBox icon={CheckCircle2} label="Students new" value={result.summary.students.imported} color="text-emerald-600" />
            <ResultBox icon={CheckCircle2} label="Students updated" value={result.summary.students.updated} color="text-blue-600" />
            <ResultBox icon={CheckCircle2} label="Payments" value={`${result.summary.payments.imported} / ${result.summary.payments.total}`} color="text-emerald-600" />
            <ResultBox icon={CheckCircle2} label="Collected" value={`₹${Number(result.summary.payments.total_amount).toLocaleString("en-IN")}`} color="text-emerald-600" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <ResultBox icon={AlertTriangle} label="Students skipped" value={result.summary.students.skipped} color="text-amber-600" />
            <ResultBox icon={AlertTriangle} label="Transactions skipped" value={result.summary.payments.skipped} color="text-amber-600" />
            <ResultBox icon={CheckCircle2} label="Subscriptions created" value={result.summary.subscriptions.imported} color="text-emerald-600" />
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
                downloadCsv("excel-import-errors.csv", rows);
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
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{valid} <span className="text-sm text-muted-foreground font-normal">/ {total}</span></div>
      {skipped > 0 && <div className="text-xs text-amber-600 mt-1">{skipped} skipped</div>}
    </div>
  );
}
