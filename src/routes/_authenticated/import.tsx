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
      <Tabs defaultValue="students">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>
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
