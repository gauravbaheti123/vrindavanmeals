import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Wallet, Users as UsersIcon, Search, IndianRupee, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { computeSubscriptionStatus } from "@/lib/subscription-status";
import { exportPdf, exportExcel } from "@/lib/report-export";

export const Route = createFileRoute("/_authenticated/dues")({
  head: () => ({ meta: [{ title: "Dues & Ledger — Vrindavan Meals" }] }),
  component: DuesPage,
});

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};

type Row = {
  student_id: string;
  full_name: string;
  mobile: string | null;
  roll_number: string | null;
  unit_name: string | null;
  unit_id: string | null;
  sub_id: string | null;
  end_date: string;
  grace_end_date: string;
  eff_status: "active" | "grace" | "expired" | "pending";
  last_payment_date: string | null;
  due_amount: number;
  opening_balance: number;
  days_overdue: number;
};

function DuesPage() {
  const qc = useQueryClient();
  const [unitId, setUnitId] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [payFor, setPayFor] = useState<Row | null>(null);

  const { data: units } = useQuery({
    queryKey: ["units-list"],
    queryFn: async () => {
      const { data } = await supabase.from("units").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: plan } = useQuery({
    queryKey: ["default-plan-price"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("price")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return Number(data?.price ?? 3000);
    },
  });
  const planPrice = plan ?? 3000;

  const { data, isLoading } = useQuery({
    queryKey: ["dues-list"],
    queryFn: async () => {
      const [studentsRes, subsRes, paysRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, full_name, mobile, roll_number, unit_id, opening_balance, opening_balance_as_of, units(name)")
          .eq("is_approved", true),
        supabase
          .from("subscriptions")
          .select("id, student_id, status, start_date, end_date, grace_end_date"),
        supabase
          .from("payments")
          .select("student_id, amount, created_at")
          .eq("status", "success")
          .order("created_at", { ascending: false }),
      ]);

      type St = { id: string; full_name: string; mobile: string | null; roll_number: string | null; unit_id: string | null; opening_balance: number | null; opening_balance_as_of: string | null; units: { name: string } | null };
      type Sub = { id: string; student_id: string; status: "active" | "grace" | "expired" | "pending"; start_date: string; end_date: string; grace_end_date: string };

      const students = (studentsRes.data ?? []) as unknown as St[];
      const subs = (subsRes.data ?? []) as unknown as Sub[];
      const pays = (paysRes.data ?? []) as { student_id: string; amount: number; created_at: string }[];

      const subsByStudent = new Map<string, Sub[]>();
      for (const s of subs) {
        const arr = subsByStudent.get(s.student_id) ?? [];
        arr.push(s);
        subsByStudent.set(s.student_id, arr);
      }

      const paidByStudent = new Map<string, number>();
      const lastPayMap = new Map<string, string>();
      for (const p of pays) {
        paidByStudent.set(p.student_id, (paidByStudent.get(p.student_id) ?? 0) + Number(p.amount));
        if (!lastPayMap.has(p.student_id)) lastPayMap.set(p.student_id, p.created_at);
      }

      const today = todayISO();
      const rows: Row[] = [];

      for (const st of students) {
        const stSubs = subsByStudent.get(st.id) ?? [];
        const opening = Number(st.opening_balance ?? 0);
        const paid = paidByStudent.get(st.id) ?? 0;
        // Single source of truth — same formula as Student Detail page
        const billed = stSubs.length * planPrice + opening;
        const due = billed - paid;
        if (due <= 0) continue;

        const latest = stSubs.slice().sort((a, b) => (a.end_date > b.end_date ? -1 : 1))[0] ?? null;
        const eff = latest ? computeSubscriptionStatus(latest) : "expired";
        const lastPay = lastPayMap.get(st.id) ?? null;
        const refDate = lastPay ? lastPay.slice(0, 10) : (latest?.start_date ?? st.opening_balance_as_of ?? today);
        const days = Math.max(0, Math.floor((Date.parse(today) - Date.parse(refDate)) / 86400000));

        rows.push({
          student_id: st.id,
          full_name: st.full_name,
          mobile: st.mobile,
          roll_number: st.roll_number,
          unit_name: st.units?.name ?? null,
          unit_id: st.unit_id,
          sub_id: latest?.id ?? null,
          end_date: latest?.end_date ?? (st.opening_balance_as_of ?? ""),
          grace_end_date: latest?.grace_end_date ?? (st.opening_balance_as_of ?? ""),
          eff_status: eff,
          last_payment_date: lastPay,
          due_amount: due,
          opening_balance: opening,
          days_overdue: days,
        });
      }

      rows.sort((a, b) => b.days_overdue - a.days_overdue);
      return rows;
    },
  });

  const { data: collectedThisMonth } = useQuery({
    queryKey: ["dues-collected-month"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("amount")
        .eq("status", "success")
        .gte("created_at", monthStartISO());
      return (data ?? []).reduce((s, p) => s + Number(p.amount), 0);
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((r) => {
      if (unitId !== "all" && r.unit_id !== unitId) return false;
      if (overdueOnly && r.days_overdue <= 0) return false;
      if (q && !(r.full_name.toLowerCase().includes(q) || (r.roll_number ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data, search, unitId, overdueOnly]);

  const totalOutstanding = filtered.reduce((s, r) => s + r.due_amount, 0);

  const exportColumns = ["Mess No", "Student", "Mobile", "Unit", "Due", "Last Payment", "Days Overdue", "Status"];
  const exportRows = filtered.map((r) => [
    r.roll_number ?? "",
    r.full_name,
    r.mobile ?? "",
    r.unit_name ?? "",
    r.due_amount,
    r.last_payment_date ? r.last_payment_date.slice(0, 10) : "",
    r.days_overdue,
    r.eff_status,
  ]);
  const exportTitle = `Dues & Ledger — ${new Date().toLocaleDateString("en-IN")}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dues & Ledger</h1>
          <p className="text-sm text-muted-foreground">Students who owe money — sorted by days overdue.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => exportPdf({ title: exportTitle, columns: exportColumns, rows: exportRows, filename: "dues-ledger" })}>
            <FileText className="h-4 w-4 mr-1" />PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportExcel({ title: "Dues Ledger", columns: exportColumns, rows: exportRows, filename: "dues-ledger" })}>
            <Download className="h-4 w-4 mr-1" />Excel
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="pt-4">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Total Outstanding</div>
            <div className="text-3xl font-bold text-destructive">{inr(totalOutstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><UsersIcon className="h-3 w-3" /> Students With Dues</div>
            <div className="text-3xl font-bold">{filtered.length}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-success">
          <CardContent className="pt-4">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Collected This Month</div>
            <div className="text-3xl font-bold text-success">{inr(collectedThisMonth ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Name or Mess No" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Units</SelectItem>
                {units?.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="overdue" checked={overdueOnly} onCheckedChange={setOverdueOnly} />
            <Label htmlFor="overdue" className="text-sm">Overdue only</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base">Outstanding — {filtered.length} students</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Mess No</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Last Payment</TableHead>
                  <TableHead className="text-right">Days Overdue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : !filtered.length ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No dues 🎉</TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.sub_id}>
                    <TableCell className="font-mono text-xs">{r.roll_number ?? "—"}</TableCell>
                    <TableCell>
                      <Link to="/students/$id" params={{ id: r.student_id }} className="hover:underline font-medium">{r.full_name}</Link>
                    </TableCell>
                    <TableCell className="text-sm">{r.mobile ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.unit_name ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold text-destructive">{inr(r.due_amount)}</TableCell>
                    <TableCell className="text-sm">{r.last_payment_date ? r.last_payment_date.slice(0, 10) : <span className="text-muted-foreground">Never</span>}</TableCell>
                    <TableCell className="text-right">
                      <span className={r.days_overdue > 30 ? "font-bold text-destructive" : r.days_overdue > 7 ? "font-semibold text-warning-foreground" : ""}>
                        {r.days_overdue}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.eff_status === "expired" ? "destructive" : r.eff_status === "grace" ? "secondary" : "outline"} className="capitalize">{r.eff_status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => setPayFor(r)}><IndianRupee className="h-3 w-3 mr-1" />Record</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RecordPaymentModal
        row={payFor}
        defaultAmount={planPrice}
        onClose={() => setPayFor(null)}
        onSaved={() => {
          setPayFor(null);
          qc.invalidateQueries({ queryKey: ["dues-list"] });
          qc.invalidateQueries({ queryKey: ["dues-collected-month"] });
        }}
      />
    </div>
  );
}

function RecordPaymentModal({ row, defaultAmount, onClose, onSaved }: {
  row: Row | null; defaultAmount: number; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState<string>(String(defaultAmount));
  const [mode, setMode] = useState("cash");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // reset on open
  useMemo(() => {
    if (row) { setAmount(String(defaultAmount)); setMode("cash"); setDate(todayISO()); setNote(""); }
  }, [row, defaultAmount]);

  async function save() {
    if (!row) return;
    if (!amount || Number(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const razorpayRef = mode === "razorpay" && note.trim() ? { razorpay_payment_id: note.trim() } : {};
    const { error } = await supabase.from("payments").insert({
      student_id: row.student_id,
      subscription_id: row.sub_id,
      amount: Number(amount),
      mode: mode as "cash" | "upi" | "card" | "razorpay",
      status: "success",
      recorded_by: userRes.user?.id,
      created_at: new Date(date + "T" + new Date().toTimeString().slice(0, 8)).toISOString(),
      ...razorpayRef,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment recorded");
    onSaved();
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-3">
            <div className="text-sm bg-muted/40 rounded-md px-3 py-2">
              <div className="font-semibold">{row.full_name}</div>
              <div className="text-xs text-muted-foreground">{row.roll_number} · {row.unit_name ?? "—"}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (₹)</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Mode</Label>
              <RadioGroup value={mode} onValueChange={setMode} className="grid grid-cols-4 gap-2">
                {["cash", "upi", "card", "razorpay"].map((m) => (
                  <label key={m} className={`flex items-center gap-1 border rounded-md px-2 py-1.5 cursor-pointer text-sm capitalize ${mode === m ? "border-primary bg-primary/5" : ""}`}>
                    <RadioGroupItem value={m} />{m}
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1">
              <Label>Reference / Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="UPI txn ID, receipt no." />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
