import { createFileRoute } from "@tanstack/react-router";
import { STALE } from "@/lib/query-cache";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pageAll } from "@/lib/fetch-all";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Download, FileText, Send, Users, UserCheck, UserX, Clock, EyeOff,
  Wallet, CalendarRange, AlertCircle, PiggyBank, PieChart as PieIcon,
  ClipboardCheck, BarChart2, LineChart as LineIcon, ClipboardList, Fingerprint,
  Activity, TrendingUp, RefreshCcw, BookOpen, Receipt, Printer,
} from "lucide-react";
import { exportPdf, exportExcel } from "@/lib/report-export";
import { toast } from "sonner";
import { StudentPicker, type StudentOption } from "@/components/student-picker";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/due-status";
import { fetchLedgerRows } from "@/lib/dues";
import { applyLedgerFilter, defaultLedgerFilter, LedgerFilterControls, type LedgerFilterState } from "@/components/ledger-filters";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Vrindavan Meals" }] }),
  component: ReportsPage,
});

type ReportKey =
  | "s.master" | "s.active" | "s.inactive" | "s.expiring" | "s.noshow"
  | "p.collection" | "p.monthly" | "p.outstanding" | "p.advance" | "p.mode"
  | "a.daily" | "a.monthly" | "a.trend" | "a.manual" | "a.unmapped"
  | "sub.status" | "sub.enrol" | "sub.renew"
  | "ledger" | "fin.gst" | "fin.rev" | "reprint"
  | "pos.items";

interface NavGroup { label: string; icon: React.ComponentType<{ className?: string }>; items: { key: ReportKey; label: string }[]; }
// 7 key reports the canteen owner actually uses day to day.
const NAV: NavGroup[] = [
  { label: "Students", icon: Users, items: [
    { key: "s.master", label: "Student Master List" },
    { key: "s.expiring", label: "Expiring Soon" },
  ]},
  { label: "Money", icon: Wallet, items: [
    { key: "p.collection", label: "Collection Report" },
    { key: "p.outstanding", label: "Outstanding Dues" },
    { key: "ledger", label: "📒 Student Ledger" },
    { key: "fin.gst", label: "🧾 GST Report (5%)" },
  ]},
  { label: "Operations", icon: ClipboardCheck, items: [
    { key: "a.daily", label: "Daily Attendance" },
  ]},
];

// ------------ helpers ------------
const fmtINR = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const dISO = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return dISO(new Date(d.getFullYear(), d.getMonth(), 1)); };

function ReportsPage() {
  const today = dISO(new Date());
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today);
  const [unit, setUnit] = useState("all");
  const [active, setActive] = useState<ReportKey>("s.master");

  const { data: units } = useQuery({
    queryKey: ["units"],
    staleTime: STALE.MASTER,
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });

  return (
    <div className="flex gap-4 min-h-[calc(100vh-8rem)]">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 hidden lg:block">
        <Card className="p-3 sticky top-4">
          <div className="text-xs uppercase text-muted-foreground font-semibold px-2 pb-2">Reports</div>
          <div className="space-y-3">
            {NAV.map((g) => (
              <div key={g.label}>
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-muted-foreground">
                  <g.icon className="h-3.5 w-3.5" />{g.label}
                </div>
                <div className="space-y-0.5">
                  {g.items.map((it) => (
                    <button
                      key={it.key}
                      onClick={() => setActive(it.key)}
                      className={cn(
                        "w-full text-left text-sm px-3 py-1.5 rounded transition-colors",
                        active === it.key ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted",
                      )}
                    >{it.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </aside>

      {/* Main */}
      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reports</h1>
            <p className="text-sm text-muted-foreground">Real-time operational and financial reports.</p>
          </div>
          <div className="lg:hidden">
            <Select value={active} onValueChange={(v) => setActive(v as ReportKey)}>
              <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {NAV.flatMap((g) => g.items).map((it) => (
                  <SelectItem key={it.key} value={it.key}>{it.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="p-3 flex flex-wrap gap-3 items-end">
          <div><div className="text-xs mb-1">From</div><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" /></div>
          <div><div className="text-xs mb-1">To</div><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" /></div>
          <div>
            <div className="text-xs mb-1">Unit</div>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Units</SelectItem>
                {units?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <ReportRouter active={active} from={from} to={to} unit={unit} />
      </div>
    </div>
  );
}

function ReportRouter({ active, from, to, unit }: { active: ReportKey; from: string; to: string; unit: string }) {
  switch (active) {
    case "s.master": return <StudentMaster unit={unit} />;
    case "s.active": return <ActiveStudents unit={unit} />;
    case "s.inactive": return <InactiveStudents unit={unit} />;
    case "s.expiring": return <ExpiringReport unit={unit} />;
    case "s.noshow": return <NoShowReport from={from} to={to} unit={unit} />;
    case "p.collection": return <CollectionReport from={from} to={to} unit={unit} />;
    case "p.monthly": return <MonthlyCollection />;
    case "p.outstanding": return <OutstandingReport unit={unit} />;
    case "p.advance": return <AdvanceReport unit={unit} />;
    case "p.mode": return <ModeReport from={from} to={to} unit={unit} />;
    case "a.daily": return <DailyAttendance date={to} unit={unit} />;
    case "a.monthly": return <MonthlyAttendance unit={unit} />;
    case "a.trend": return <AttendanceTrend from={from} to={to} unit={unit} />;
    case "a.manual": return <ManualLog from={from} to={to} unit={unit} />;
    case "a.unmapped": return <UnmappedLog from={from} to={to} unit={unit} />;
    case "sub.status": return <SubStatusSummary unit={unit} />;
    case "sub.enrol": return <EnrollmentsReport />;
    case "sub.renew": return <RenewalsReport unit={unit} />;
    case "ledger": return <StudentLedger />;
    case "fin.gst": return <GSTReport from={from} to={to} />;
    case "fin.rev": return <RevenueReport />;
    case "reprint": return <ReprintLog from={from} to={to} />;
    case "pos.items": return <PosItemSales from={from} to={to} />;
  }
}

function PosItemSales({ from, to }: { from: string; to: string }) {
  const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
  const { data = [] } = useQuery({
    queryKey: ["pos-item-sales", from, to],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      const data = await pageAll((f2, t2) => db
        .from("pos_sale_items")
        .select("item_name, quantity, line_total, pos_sales!inner(sold_at)")
        .gte("pos_sales.sold_at", from)
        .lte("pos_sales.sold_at", to + "T23:59:59")
        .range(f2, t2));
      return (data ?? []) as unknown as { item_name: string; quantity: number; line_total: number }[];
    },
  });
  const agg = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    data.forEach((r) => {
      const cur = map.get(r.item_name) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(r.quantity); cur.revenue += Number(r.line_total);
      map.set(r.item_name, cur);
    });
    return Array.from(map.entries()).map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data]);
  const cols = ["Item", "Qty Sold", "Revenue"];
  const rows = agg.map((r) => [r.name, r.qty, fmtINR(r.revenue)]);
  const totalRev = agg.reduce((s, r) => s + r.revenue, 0);
  return (
    <div className="space-y-3">
      <ExportBar
        onPdf={() => exportPdf({ title: "POS Item Sales", subtitle: `${from} → ${to}`, columns: cols, rows, filename: "pos-item-sales" })}
        onExcel={() => exportExcel({ title: "POS Item Sales", columns: cols, rows, filename: "pos-item-sales" })}
      />
      <div className="text-sm text-muted-foreground">Total POS revenue: <b className="text-foreground">{fmtINR(totalRev)}</b></div>
      <DataTable cols={cols} rows={rows} empty="No POS sales in this range." />
    </div>
  );
}


function ExportBar({ onPdf, onExcel }: { onPdf: () => void; onExcel: () => void }) {
  return (
    <div className="flex gap-2 justify-end">
      <Button size="sm" variant="outline" onClick={onPdf}><FileText className="h-4 w-4 mr-1" />PDF</Button>
      <Button size="sm" variant="outline" onClick={onExcel}><Download className="h-4 w-4 mr-1" />Excel</Button>
    </div>
  );
}

function DataTable({ cols, rows, empty = "No data." }: { cols: string[]; rows: (string | number | React.ReactNode)[][]; empty?: string }) {
  return (
    <Card><Table>
      <TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
      <TableBody>
        {rows.length === 0
          ? <TableRow><TableCell colSpan={cols.length} className="text-center py-8 text-muted-foreground">{empty}</TableCell></TableRow>
          : rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}
      </TableBody>
    </Table></Card>
  );
}

function KPI({ label, value, icon: Icon, tone = "" }: { label: string; value: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className={cn("text-xl font-bold mt-1", tone)}>{value}</div>
    </Card>
  );
}

// ================== 1A. Student Master ==================
function StudentMaster({ unit }: { unit: string }) {
  const [q, setQ] = useState("");
  const [subStatus, setSubStatus] = useState("all");
  const [status, setStatus] = useState("all");

  const { data } = useQuery({
    queryKey: ["rpt-master", unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let query = supabase.from("students").select("id, full_name, mobile, roll_number, hostel_room, unit_id, created_at, is_approved, exit_date, units(name)").order("full_name");
      if (unit !== "all") query = query.eq("unit_id", unit);
      const students = await pageAll((f, t) => query.range(f, t));
      const ids = students.map((s) => s.id);
      const subs = ids.length ? await pageAll((f, t) => supabase.from("subscriptions").select("student_id, status, end_date, grace_end_date").in("student_id", ids).range(f, t)) : [];
      const latestByStudent = new Map<string, { status: string; end_date: string; grace_end_date: string }>();
      subs.forEach((s) => {
        const cur = latestByStudent.get(s.student_id);
        if (!cur || s.end_date > cur.end_date) latestByStudent.set(s.student_id, s);
      });
      const today = dISO(new Date());
      return students.map((s) => {
        const sub = latestByStudent.get(s.id);
        let ss: "active" | "grace" | "expired" | "pending" | "none" = "none";
        if (sub) {
          if (sub.status === "pending") ss = "pending";
          else if (today <= sub.end_date) ss = "active";
          else if (today <= sub.grace_end_date) ss = "grace";
          else ss = "expired";
        }
        return { ...s, subStatus: ss };
      });
    },
  });

  const filtered = useMemo(() => (data ?? []).filter((s) => {
    if (subStatus !== "all" && s.subStatus !== subStatus) return false;
    if (status === "active" && s.exit_date) return false;
    if (status === "inactive" && !s.exit_date) return false;
    if (q) { const l = q.toLowerCase(); if (!s.full_name.toLowerCase().includes(l) && !(s.roll_number ?? "").toLowerCase().includes(l)) return false; }
    return true;
  }), [data, subStatus, status, q]);

  const activeCount = filtered.filter((s) => !s.exit_date).length;
  const cols = ["Mess No", "Name", "Room", "Unit", "Joined", "Status", "Subscription", "Mobile"];
  const badge = (s: string) => ({ active: "bg-success text-success-foreground", grace: "bg-warning text-warning-foreground", expired: "bg-destructive text-destructive-foreground", pending: "bg-muted", none: "bg-muted" } as Record<string, string>)[s];
  const rows = filtered.map((s) => [
    s.roll_number ?? "—", s.full_name, s.hostel_room ?? "—", s.units?.name ?? "—",
    new Date(s.created_at).toLocaleDateString("en-IN"),
    <Badge key="st" className={!s.exit_date ? "bg-success text-success-foreground" : "bg-muted"}>{s.exit_date ? "Inactive" : "Active"}</Badge>,
    <Badge key="ss" className={badge(s.subStatus)}>{s.subStatus}</Badge>,
    s.mobile,
  ]);
  const exportRows = filtered.map((s) => [s.roll_number ?? "", s.full_name, s.hostel_room ?? "", s.units?.name ?? "", new Date(s.created_at).toLocaleDateString("en-IN"), s.exit_date ? "Inactive" : "Active", s.subStatus, s.mobile ?? ""]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total" value={filtered.length} icon={Users} />
        <KPI label="Active" value={activeCount} icon={UserCheck} tone="text-success" />
        <KPI label="Inactive" value={filtered.length - activeCount} icon={UserX} tone="text-muted-foreground" />
        <KPI label="With Active Sub" value={filtered.filter((s) => s.subStatus === "active").length} icon={Activity} tone="text-primary" />
      </div>
      <Card className="p-3 flex flex-wrap gap-2 items-end">
        <Input placeholder="Search name or mess no…" value={q} onChange={(e) => setQ(e.target.value)} className="w-[260px]" />
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="all">All Status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent></Select>
        <Select value={subStatus} onValueChange={setSubStatus}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="all">All Subs</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="grace">Grace</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="none">None</SelectItem>
        </SelectContent></Select>
        <div className="ml-auto"><ExportBar
          onPdf={() => exportPdf({ title: "Student Master List", columns: cols, rows: exportRows, filename: "student-master" })}
          onExcel={() => exportExcel({ title: "Master", columns: cols, rows: exportRows, filename: "student-master" })}
        /></div>
      </Card>
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 1B. Active Students ==================
function ActiveStudents({ unit }: { unit: string }) {
  const today = dISO(new Date());
  const { data } = useQuery({
    queryKey: ["rpt-active", unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let q = supabase.from("subscriptions").select("id, start_date, end_date, grace_end_date, status, students(id, full_name, roll_number, mobile, hostel_room, unit_id), units(name), subscription_plans(name, price)")
        .in("status", ["active", "grace"]).gte("grace_end_date", today).order("end_date");
      if (unit !== "all") q = q.eq("unit_id", unit);
      return await pageAll((f, t) => q.range(f, t));
    },
  });
  const cols = ["Mess No", "Name", "Room", "Unit", "Plan", "Start", "End", "Days Left", "Price"];
  const rows = (data ?? []).map((s) => {
    const daysLeft = Math.ceil((new Date(s.end_date).getTime() - Date.now()) / 86400000);
    const tone = daysLeft < 0 ? "text-destructive" : daysLeft <= 5 ? "text-warning" : "text-success";
    return [
      s.students?.roll_number ?? "—", s.students?.full_name ?? "", s.students?.hostel_room ?? "—", s.units?.name ?? "—",
      s.subscription_plans?.name ?? "—", s.start_date, s.end_date,
      <span key="d" className={tone}>{daysLeft} days</span>,
      fmtINR(Number(s.subscription_plans?.price ?? 0)),
    ];
  });
  const exportRows = (data ?? []).map((s) => {
    const daysLeft = Math.ceil((new Date(s.end_date).getTime() - Date.now()) / 86400000);
    return [s.students?.roll_number ?? "", s.students?.full_name ?? "", s.students?.hostel_room ?? "", s.units?.name ?? "", s.subscription_plans?.name ?? "", s.start_date, s.end_date, daysLeft, Number(s.subscription_plans?.price ?? 0)];
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <KPI label="Total Active" value={(data ?? []).length} icon={UserCheck} tone="text-success" />
        <KPI label="Grace Period" value={(data ?? []).filter((s) => s.status === "grace").length} icon={Clock} tone="text-warning" />
        <KPI label="Total Revenue (locked)" value={fmtINR((data ?? []).reduce((a, s) => a + Number(s.subscription_plans?.price ?? 0), 0))} icon={Wallet} tone="text-primary" />
      </div>
      <ExportBar onPdf={() => exportPdf({ title: "Active Students", columns: cols, rows: exportRows, filename: "active-students" })}
        onExcel={() => exportExcel({ title: "Active", columns: cols, rows: exportRows, filename: "active-students" })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 1C. Inactive / Exit ==================
function InactiveStudents({ unit }: { unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-inactive", unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let sq = supabase.from("students").select("id, full_name, roll_number, hostel_room, mobile, created_at, is_approved, exit_date, unit_id, units(name)").order("full_name");
      if (unit !== "all") sq = sq.eq("unit_id", unit);
      const students = await pageAll((f, t) => sq.range(f, t));
      const ids = students.map((s) => s.id);
      if (ids.length === 0) return [];
      const [subsRows, paysRows] = await Promise.all([
        pageAll((f, t) => supabase.from("subscriptions").select("student_id, start_date, end_date, grace_end_date, status").in("student_id", ids).range(f, t)),
        pageAll((f, t) => supabase.from("payments").select("student_id, amount, status").in("student_id", ids).eq("status", "success").range(f, t)),
      ]);
      const subs = { data: subsRows };
      const pays = { data: paysRows };
      const today = dISO(new Date());
      const paidByStudent = new Map<string, number>();
      (pays.data ?? []).forEach((p) => paidByStudent.set(p.student_id, (paidByStudent.get(p.student_id) ?? 0) + Number(p.amount)));
      const latestByStudent = new Map<string, { start_date: string; end_date: string; grace_end_date: string }>();
      const firstByStudent = new Map<string, string>();
      (subs.data ?? []).forEach((s) => {
        const cur = latestByStudent.get(s.student_id);
        if (!cur || s.end_date > cur.end_date) latestByStudent.set(s.student_id, s);
        const f = firstByStudent.get(s.student_id);
        if (!f || s.start_date < f) firstByStudent.set(s.student_id, s.start_date);
      });
      return students.map((s) => {
        const latest = latestByStudent.get(s.id);
        const exitedActiveSub = latest && today > latest.grace_end_date;
        const isInactive = !!s.exit_date || exitedActiveSub || !latest;
        const start = firstByStudent.get(s.id) ?? s.created_at.slice(0, 10);
        const months = latest ? Math.max(1, Math.round((new Date(latest.end_date).getTime() - new Date(start).getTime()) / (30 * 86400000))) : 0;
        return { ...s, isInactive, start, exit: s.exit_date ?? (exitedActiveSub && latest ? latest.grace_end_date : null), months, paid: paidByStudent.get(s.id) ?? 0 };
      }).filter((s) => s.isInactive);
    },
  });
  const cols = ["Mess No", "Name", "Room", "Unit", "Joined", "Exit", "Months", "Total Paid"];
  const rows = (data ?? []).map((s) => [s.roll_number ?? "—", s.full_name, s.hostel_room ?? "—", s.units?.name ?? "—", s.start, s.exit ?? "—", s.months, fmtINR(s.paid)]);
  const avg = data && data.length ? Math.round(data.reduce((a, s) => a + s.months, 0) / data.length) : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <KPI label="Total Exited" value={(data ?? []).length} icon={UserX} />
        <KPI label="Avg. Tenure" value={`${avg} months`} icon={CalendarRange} />
        <KPI label="Lifetime Collected" value={fmtINR((data ?? []).reduce((a, s) => a + s.paid, 0))} icon={Wallet} />
      </div>
      <ExportBar onPdf={() => exportPdf({ title: "Inactive / Exit Students", columns: cols, rows, filename: "inactive-students" })}
        onExcel={() => exportExcel({ title: "Inactive", columns: cols, rows, filename: "inactive-students" })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 1D. Expiring ==================
async function sendReminder(student_id: string, mobile: string, params: string[]) {
  const { error } = await supabase.functions.invoke("send-whatsapp", { body: { phone: mobile, template_name: "subscription_expiry_warning", student_id, params } });
  if (error) toast.error(error.message); else toast.success("Reminder queued");
}

function ExpiringReport({ unit }: { unit: string }) {
  const [days, setDays] = useState(7);
  const today = dISO(new Date());
  const future = dISO(new Date(Date.now() + days * 86400000));
  const { data } = useQuery({
    queryKey: ["rpt-expiring", days, unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let q = supabase.from("subscriptions").select("id, end_date, grace_end_date, status, unit_id, students(id, full_name, mobile, roll_number), units(name), subscription_plans(price)")
        .gte("end_date", today).lte("end_date", future).order("end_date");
      if (unit !== "all") q = q.eq("unit_id", unit);
      return await pageAll((f, t) => q.range(f, t));
    },
  });
  const cols = ["Mess No", "Name", "Mobile", "Unit", "End Date", "Grace End", "Days Left", "Amount Due"];
  const rows = (data ?? []).map((r) => {
    const daysLeft = Math.ceil((new Date(r.end_date).getTime() - Date.now()) / 86400000);
    return [r.students?.roll_number ?? "—", r.students?.full_name ?? "", r.students?.mobile ?? "", r.units?.name ?? "—", r.end_date, r.grace_end_date, daysLeft, fmtINR(Number(r.subscription_plans?.price ?? 0))];
  });
  return (
    <div className="space-y-3">
      <Card className="p-3 flex items-center gap-3 flex-wrap">
        <div className="text-sm">Expiring in next</div>
        <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-20" />
        <div className="text-sm">days · {(data ?? []).length} students</div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={async () => {
          for (const r of data ?? []) if (r.students?.mobile) await sendReminder(r.students.id, r.students.mobile, [r.students.full_name, r.end_date, "3000"]);
        }}><Send className="h-4 w-4 mr-1" />Send all reminders</Button>
      </Card>
      <ExportBar onPdf={() => exportPdf({ title: "Expiring Subscriptions", columns: cols, rows, filename: `expiring-${today}` })}
        onExcel={() => exportExcel({ title: "Expiring", columns: cols, rows, filename: `expiring-${today}` })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 1E. No-Show ==================
function NoShowReport({ from, to, unit }: { from: string; to: string; unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-noshow", from, to, unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let sq = supabase.from("subscriptions").select("student_id, unit_id, status, students(id, full_name, mobile, roll_number), units(name)").in("status", ["active", "grace"]);
      if (unit !== "all") sq = sq.eq("unit_id", unit);
      const subs = await pageAll((f, t) => sq.range(f, t));
      const att = await pageAll((f, t) => supabase.from("attendance").select("student_id, scan_date").gte("scan_date", from).lte("scan_date", to).range(f, t));
      const lastByStudent = new Map<string, string>();
      (att ?? []).forEach((a) => { if (!a.scan_date) return; const cur = lastByStudent.get(a.student_id); if (!cur || a.scan_date > cur) lastByStudent.set(a.student_id, a.scan_date); });
      const attended = new Set((att ?? []).map((a) => a.student_id));
      return subs.filter((s) => !attended.has(s.student_id)).map((s) => ({ ...s, last: lastByStudent.get(s.student_id) ?? null }));
    },
  });
  const cols = ["Mess No", "Name", "Mobile", "Unit", "Sub Status", "Last Attendance", "Days Absent"];
  const rows = (data ?? []).map((s) => {
    const daysAbsent = s.last ? Math.floor((Date.now() - new Date(s.last).getTime()) / 86400000) : "—";
    return [s.students?.roll_number ?? "—", s.students?.full_name ?? "", s.students?.mobile ?? "", s.units?.name ?? "—", s.status, s.last ?? "Never", daysAbsent];
  });
  return (
    <div className="space-y-3">
      <KPI label="No-Show Count" value={(data ?? []).length} icon={EyeOff} tone="text-destructive" />
      <ExportBar onPdf={() => exportPdf({ title: "No-Show", subtitle: `${from} → ${to}`, columns: cols, rows, filename: `noshow-${from}_${to}` })}
        onExcel={() => exportExcel({ title: "No-Show", columns: cols, rows, filename: `noshow-${from}_${to}` })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 2A. Collection Report ==================
function CollectionReport({ from, to, unit }: { from: string; to: string; unit: string }) {
  const [mode, setMode] = useState("all");
  const { data } = useQuery({
    queryKey: ["rpt-coll", from, to, unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      const q = supabase.from("payments").select("amount, mode, status, created_at, subscription_id, student_id, subscriptions(unit_id), students(full_name, roll_number, unit_id)")
        .eq("status", "success").gte("created_at", from + "T00:00:00").lte("created_at", to + "T23:59:59").order("created_at", { ascending: false });
      let rows = await pageAll((f, t) => q.range(f, t));
      if (unit !== "all") rows = rows.filter((r) => {
        const u1 = (r as { subscriptions?: { unit_id: string } }).subscriptions?.unit_id;
        const u2 = (r as { students?: { unit_id: string } }).students?.unit_id;
        return u1 === unit || u2 === unit;
      });
      return rows;
    },
  });
  const filtered = (data ?? []).filter((r) => mode === "all" || r.mode === mode);
  const totals = useMemo(() => {
    const acc = { total: 0, cash: 0, upi: 0, card: 0, razorpay: 0 } as Record<string, number>;
    filtered.forEach((r) => { const a = Number(r.amount) || 0; acc.total += a; if (acc[r.mode] !== undefined) acc[r.mode] += a; });
    return acc;
  }, [filtered]);
  const cols = ["Date", "Mess No", "Student", "Amount", "Mode"];
  const rows = filtered.map((r) => {
    const x = r as { created_at: string; amount: number; mode: string; students?: { full_name: string; roll_number: string | null } };
    return [new Date(x.created_at).toLocaleDateString("en-IN"), x.students?.roll_number ?? "—", x.students?.full_name ?? "", fmtINR(Number(x.amount)), <Badge key="m" variant="outline">{x.mode.toUpperCase()}</Badge>];
  });
  const exportRows = filtered.map((r) => {
    const x = r as { created_at: string; amount: number; mode: string; students?: { full_name: string; roll_number: string | null } };
    return [new Date(x.created_at).toLocaleDateString("en-IN"), x.students?.roll_number ?? "", x.students?.full_name ?? "", Number(x.amount), x.mode];
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Total" value={fmtINR(totals.total)} icon={Wallet} tone="text-primary" />
        <KPI label="Cash" value={fmtINR(totals.cash)} />
        <KPI label="UPI" value={fmtINR(totals.upi)} />
        <KPI label="Card" value={fmtINR(totals.card)} />
        <KPI label="Razorpay" value={fmtINR(totals.razorpay)} />
      </div>
      <Card className="p-3 flex gap-3 items-center">
        <div className="text-sm">Mode:</div>
        <Select value={mode} onValueChange={setMode}><SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="all">All</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="razorpay">Razorpay</SelectItem>
        </SelectContent></Select>
        <div className="text-sm ml-2">{filtered.length} transactions</div>
        <div className="ml-auto"><ExportBar onPdf={() => exportPdf({ title: "Payment Collection", subtitle: `${from} → ${to}`, columns: cols, rows: exportRows, filename: `collection-${from}_${to}` })}
          onExcel={() => exportExcel({ title: "Collection", columns: cols, rows: exportRows, filename: `collection-${from}_${to}` })} /></div>
      </Card>
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 2B. Monthly Collection ==================
function MonthlyCollection() {
  const { data } = useQuery({
    queryKey: ["rpt-monthly-coll"],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      const since = dISO(new Date(Date.now() - 365 * 86400000));
      const pays = await pageAll((f, t) => supabase.from("payments").select("amount, created_at, status").eq("status", "success").gte("created_at", since).range(f, t));
      const map = new Map<string, number>();
      (pays ?? []).forEach((p) => { const k = p.created_at.slice(0, 7); map.set(k, (map.get(k) ?? 0) + Number(p.amount)); });
      const months: { month: string; amount: number }[] = [];
      for (let i = 11; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); const k = dISO(d).slice(0, 7); months.push({ month: k, amount: map.get(k) ?? 0 }); }
      return months;
    },
  });
  const cols = ["Month", "Collected", "Transactions", "% of Total"];
  const total = (data ?? []).reduce((a, m) => a + m.amount, 0);
  const rows = (data ?? []).map((m) => [m.month, fmtINR(m.amount), "—", total ? ((m.amount / total) * 100).toFixed(1) + "%" : "—"]);
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">Monthly Collection Trend (last 12 months)</div>
        <div className="h-72"><ResponsiveContainer><BarChart data={data ?? []}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} />
          <Tooltip formatter={(v: number) => fmtINR(v)} /><Bar dataKey="amount" fill="hsl(var(--primary))" />
        </BarChart></ResponsiveContainer></div>
      </Card>
      <ExportBar onPdf={() => exportPdf({ title: "Monthly Collection", columns: cols, rows, filename: "monthly-collection" })}
        onExcel={() => exportExcel({ title: "Monthly", columns: cols, rows, filename: "monthly-collection" })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 2C. Outstanding ==================
function OutstandingReport({ unit }: { unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-outstanding", unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      const monthStartD = monthStart();
      let sq = supabase.from("subscriptions").select("student_id, end_date, grace_end_date, status, unit_id, students(id, full_name, mobile, roll_number), units(name), subscription_plans(price)").in("status", ["active", "grace"]);
      if (unit !== "all") sq = sq.eq("unit_id", unit);
      const subs = await pageAll((f, t) => sq.range(f, t));
      const ids = subs.map((s) => s.student_id);
      if (ids.length === 0) return [];
      const pays = await pageAll((f, t) => supabase.from("payments").select("student_id, amount, created_at, status").in("student_id", ids).eq("status", "success").gte("created_at", monthStartD + "T00:00:00").range(f, t));
      const paidThisMonth = new Set((pays ?? []).map((p) => p.student_id));
      const allPays = await pageAll((f, t) => supabase.from("payments").select("student_id, amount, created_at, status").in("student_id", ids).eq("status", "success").order("created_at", { ascending: false }).range(f, t));
      const lastByStudent = new Map<string, { amount: number; date: string }>();
      (allPays ?? []).forEach((p) => { if (!lastByStudent.has(p.student_id)) lastByStudent.set(p.student_id, { amount: Number(p.amount), date: p.created_at }); });
      return subs.filter((s) => !paidThisMonth.has(s.student_id)).map((s) => ({ ...s, last: lastByStudent.get(s.student_id) ?? null }));
    },
  });
  const cols = ["Mess No", "Name", "Mobile", "Unit", "Last Payment", "Last Amount", "Amount Due"];
  const rows = (data ?? []).map((s) => [
    s.students?.roll_number ?? "—", s.students?.full_name ?? "", s.students?.mobile ?? "", s.units?.name ?? "—",
    s.last ? new Date(s.last.date).toLocaleDateString("en-IN") : "Never", s.last ? fmtINR(s.last.amount) : "—",
    fmtINR(Number(s.subscription_plans?.price ?? 0)),
  ]);
  const totalDue = (data ?? []).reduce((a, s) => a + Number(s.subscription_plans?.price ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <KPI label="Students with Dues" value={(data ?? []).length} icon={AlertCircle} tone="text-destructive" />
        <KPI label="Total Outstanding" value={fmtINR(totalDue)} icon={Wallet} tone="text-destructive" />
      </div>
      <ExportBar onPdf={() => exportPdf({ title: "Outstanding Fees", columns: cols, rows, filename: "outstanding" })}
        onExcel={() => exportExcel({ title: "Outstanding", columns: cols, rows, filename: "outstanding" })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 2D. Advance ==================
function AdvanceReport({ unit }: { unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-advance", unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let sq = supabase.from("students").select("id, full_name, roll_number, unit_id, units(name)");
      if (unit !== "all") sq = sq.eq("unit_id", unit);
      const students = await pageAll((f, t) => sq.range(f, t));
      const ids = students.map((s) => s.id);
      if (ids.length === 0) return [];
      const [pays, subs] = await Promise.all([
        pageAll((f, t) => supabase.from("payments").select("student_id, amount, status").in("student_id", ids).eq("status", "success").range(f, t)),
        pageAll((f, t) => supabase.from("subscriptions").select("student_id, start_date, end_date, subscription_plans(price)").in("student_id", ids).range(f, t)),
      ]);
      const paidBy = new Map<string, number>(); (pays ?? []).forEach((p) => paidBy.set(p.student_id, (paidBy.get(p.student_id) ?? 0) + Number(p.amount)));
      const dueBy = new Map<string, number>(); (subs ?? []).forEach((s) => { const price = Number(s.subscription_plans?.price ?? 0); dueBy.set(s.student_id, (dueBy.get(s.student_id) ?? 0) + price); });
      return students.map((s) => ({ ...s, paid: paidBy.get(s.id) ?? 0, due: dueBy.get(s.id) ?? 0 })).filter((s) => s.paid > s.due && s.paid > 0);
    },
  });
  const cols = ["Mess No", "Name", "Unit", "Total Paid", "Total Due", "Advance"];
  const rows = (data ?? []).map((s) => [s.roll_number ?? "—", s.full_name, s.units?.name ?? "—", fmtINR(s.paid), fmtINR(s.due), <span key="a" className="text-success font-semibold">{fmtINR(s.paid - s.due)}</span>]);
  const total = (data ?? []).reduce((a, s) => a + (s.paid - s.due), 0);
  return (
    <div className="space-y-3">
      <KPI label="Total Advance Pool" value={fmtINR(total)} icon={PiggyBank} tone="text-success" />
      <ExportBar onPdf={() => exportPdf({ title: "Advance Payments", columns: cols, rows: rows.map((r) => r.map((c) => (typeof c === "object" ? "" : c))) as (string | number)[][], filename: "advance" })}
        onExcel={() => exportExcel({ title: "Advance", columns: cols, rows: (data ?? []).map((s) => [s.roll_number ?? "", s.full_name, s.units?.name ?? "", s.paid, s.due, s.paid - s.due]), filename: "advance" })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 2E. Mode-wise ==================
const MODE_COLORS = ["hsl(var(--primary))", "#3b82f6", "#8b5cf6", "#f59e0b"];
function ModeReport({ from, to, unit }: { from: string; to: string; unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-mode", from, to, unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      const data = await pageAll((f2, t2) => supabase.from("payments").select("amount, mode, status, students(unit_id)").eq("status", "success")
        .gte("created_at", from + "T00:00:00").lte("created_at", to + "T23:59:59").range(f2, t2));
      let rows = data ?? [];
      if (unit !== "all") rows = rows.filter((r) => (r as { students?: { unit_id: string } }).students?.unit_id === unit);
      const agg = new Map<string, { count: number; amount: number }>();
      rows.forEach((r) => { const cur = agg.get(r.mode) ?? { count: 0, amount: 0 }; cur.count += 1; cur.amount += Number(r.amount); agg.set(r.mode, cur); });
      return Array.from(agg.entries()).map(([mode, v]) => ({ mode, ...v }));
    },
  });
  const total = (data ?? []).reduce((a, x) => a + x.amount, 0);
  const cols = ["Mode", "Transactions", "Amount", "% Share"];
  const rows = (data ?? []).map((x) => [x.mode.toUpperCase(), x.count, fmtINR(x.amount), total ? ((x.amount / total) * 100).toFixed(1) + "%" : "—"]);
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="text-sm font-semibold mb-2 flex items-center gap-2"><PieIcon className="h-4 w-4" />Mode Breakdown</div>
        <div className="h-72"><ResponsiveContainer><PieChart>
          <Pie data={data ?? []} dataKey="amount" nameKey="mode" outerRadius={100} label={(e) => `${e.mode} ${((e.amount / (total || 1)) * 100).toFixed(0)}%`}>
            {(data ?? []).map((_, i) => <Cell key={i} fill={MODE_COLORS[i % MODE_COLORS.length]} />)}
          </Pie><Tooltip formatter={(v: number) => fmtINR(v)} /><Legend />
        </PieChart></ResponsiveContainer></div>
      </Card>
      <ExportBar onPdf={() => exportPdf({ title: "Mode-wise Collection", columns: cols, rows, filename: "mode-wise" })}
        onExcel={() => exportExcel({ title: "Mode", columns: cols, rows, filename: "mode-wise" })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 3A. Daily Attendance ==================
function DailyAttendance({ date, unit }: { date: string; unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-daily-att", date, unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let q = supabase.from("attendance").select("token_number, meal_type, scan_time, scan_type, is_override, students(full_name, roll_number, hostel_room), units(name)")
        .eq("scan_date", date).order("scan_time");
      if (unit !== "all") q = q.eq("unit_id", unit);
      return await pageAll((f, t) => q.range(f, t));
    },
  });
  const [{ count: activeCount }] = [{ count: 0 }];
  void activeCount;
  const rows = (data ?? []).map((r) => {
    const x = r as { token_number: number; meal_type: string; scan_time: string; scan_type: string; is_override: boolean; students?: { full_name: string; roll_number: string | null; hostel_room: string | null }; units?: { name: string } };
    return [x.token_number, x.students?.roll_number ?? "—", x.students?.full_name ?? "", x.students?.hostel_room ?? "—", x.units?.name ?? "—", x.meal_type, new Date(x.scan_time).toLocaleTimeString("en-IN"), x.scan_type, x.is_override ? "Yes" : "No"];
  });
  const cols = ["Token", "Mess No", "Student", "Room", "Unit", "Meal", "Time", "Type", "Override"];
  const lunch = (data ?? []).filter((r) => r.meal_type === "lunch").length;
  const dinner = (data ?? []).filter((r) => r.meal_type === "dinner").length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Lunch" value={lunch} icon={ClipboardCheck} tone="text-primary" />
        <KPI label="Dinner" value={dinner} icon={ClipboardCheck} tone="text-warning" />
        <KPI label="Total" value={lunch + dinner} />
        <KPI label="Manual" value={(data ?? []).filter((r) => r.scan_type === "manual").length} />
        <KPI label="Overrides" value={(data ?? []).filter((r) => r.is_override).length} />
      </div>
      <ExportBar onPdf={() => exportPdf({ title: "Daily Attendance", subtitle: `Date: ${date}`, columns: cols, rows, filename: `attendance-${date}` })}
        onExcel={() => exportExcel({ title: "Attendance", columns: cols, rows, filename: `attendance-${date}` })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 3B. Monthly Attendance ==================
function MonthlyAttendance({ unit }: { unit: string }) {
  const [month, setMonth] = useState(dISO(new Date()).slice(0, 7));
  const monthEnd = useMemo(() => { const [y, m] = month.split("-").map(Number); return dISO(new Date(y, m, 0)); }, [month]);
  const monthFirst = month + "-01";
  const { data } = useQuery({
    queryKey: ["rpt-monthly-att", month, unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let q = supabase.from("attendance").select("student_id, meal_type, scan_date, students(full_name, roll_number, unit_id)").gte("scan_date", monthFirst).lte("scan_date", monthEnd);
      if (unit !== "all") q = q.eq("unit_id", unit);
      const rows = await pageAll((f, t) => q.range(f, t));
      const agg = new Map<string, { name: string; roll: string; lunch: Set<string>; dinner: Set<string> }>();
      rows.forEach((r) => {
        const x = r as { student_id: string; meal_type: string; scan_date: string; students?: { full_name: string; roll_number: string | null } };
        const cur = agg.get(x.student_id) ?? { name: x.students?.full_name ?? "", roll: x.students?.roll_number ?? "—", lunch: new Set(), dinner: new Set() };
        (x.meal_type === "lunch" ? cur.lunch : cur.dinner).add(x.scan_date);
        agg.set(x.student_id, cur);
      });
      const daysInMonth = Number(monthEnd.slice(-2));
      return Array.from(agg.entries()).map(([id, v]) => ({ id, name: v.name, roll: v.roll, lunch: v.lunch.size, dinner: v.dinner.size, total: v.lunch.size + v.dinner.size, pct: Math.round(((v.lunch.size + v.dinner.size) / (daysInMonth * 2)) * 100), daysInMonth }));
    },
  });
  const cols = ["Mess No", "Name", "Lunch", "Dinner", "Total", "%"];
  const rows = (data ?? []).map((s) => {
    const tone = s.pct >= 80 ? "text-success" : s.pct >= 50 ? "text-warning" : "text-destructive";
    return [s.roll, s.name, s.lunch, s.dinner, s.total, <span key="p" className={tone + " font-semibold"}>{s.pct}%</span>];
  });
  return (
    <div className="space-y-3">
      <Card className="p-3 flex items-end gap-3">
        <div><div className="text-xs mb-1">Month</div><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[160px]" /></div>
        <div className="text-sm text-muted-foreground">{(data ?? []).length} students</div>
      </Card>
      <ExportBar onPdf={() => exportPdf({ title: `Monthly Attendance ${month}`, columns: cols, rows: (data ?? []).map((s) => [s.roll, s.name, s.lunch, s.dinner, s.total, s.pct + "%"]), filename: `attendance-${month}` })}
        onExcel={() => exportExcel({ title: "Monthly", columns: cols, rows: (data ?? []).map((s) => [s.roll, s.name, s.lunch, s.dinner, s.total, s.pct]), filename: `attendance-${month}` })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 3C. Meal Trend ==================
function AttendanceTrend({ from, to, unit }: { from: string; to: string; unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-att-trend", from, to, unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let q = supabase.from("attendance").select("meal_type, scan_date").gte("scan_date", from).lte("scan_date", to);
      if (unit !== "all") q = q.eq("unit_id", unit);
      const rows = await pageAll((f, t) => q.range(f, t));
      const map = new Map<string, { date: string; lunch: number; dinner: number }>();
      rows.forEach((r) => { if (!r.scan_date) return; const cur = map.get(r.scan_date) ?? { date: r.scan_date, lunch: 0, dinner: 0 }; if (r.meal_type === "lunch") cur.lunch++; else cur.dinner++; map.set(r.scan_date, cur); });
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    },
  });
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="text-sm font-semibold mb-2 flex items-center gap-2"><LineIcon className="h-4 w-4" />Meal Attendance Trend</div>
        <div className="h-80"><ResponsiveContainer><LineChart data={data ?? []}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
          <Line type="monotone" dataKey="lunch" stroke="#f97316" strokeWidth={2} name="Lunch" />
          <Line type="monotone" dataKey="dinner" stroke="#78350f" strokeWidth={2} name="Dinner" />
        </LineChart></ResponsiveContainer></div>
      </Card>
    </div>
  );
}

// ================== 3D. Manual Log ==================
function ManualLog({ from, to, unit }: { from: string; to: string; unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-manual", from, to, unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let q = supabase.from("attendance").select("scan_date, scan_time, meal_type, override_reason, is_override, students(full_name), units(name)")
        .eq("scan_type", "manual").gte("scan_date", from).lte("scan_date", to).order("scan_date", { ascending: false });
      if (unit !== "all") q = q.eq("unit_id", unit);
      return await pageAll((f, t) => q.range(f, t));
    },
  });
  const cols = ["Date", "Time", "Student", "Unit", "Meal", "Reason", "Override"];
  const rows = (data ?? []).map((r) => {
    const x = r as { scan_date: string; scan_time: string; meal_type: string; override_reason: string | null; is_override: boolean; students?: { full_name: string }; units?: { name: string } };
    return [x.scan_date, new Date(x.scan_time).toLocaleTimeString("en-IN"), x.students?.full_name ?? "", x.units?.name ?? "—", x.meal_type, x.override_reason ?? "—", x.is_override ? "Yes" : "No"];
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <KPI label="Manual Entries" value={(data ?? []).length} icon={ClipboardList} />
        <KPI label="Overrides" value={(data ?? []).filter((r) => r.is_override).length} icon={AlertCircle} tone="text-warning" />
      </div>
      <ExportBar onPdf={() => exportPdf({ title: "Manual Entry Log", columns: cols, rows, filename: `manual-${from}_${to}` })}
        onExcel={() => exportExcel({ title: "Manual", columns: cols, rows, filename: `manual-${from}_${to}` })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 3E. Unmapped Scans ==================
function UnmappedLog({ from, to, unit }: { from: string; to: string; unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-unmapped", from, to, unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let q = supabase.from("unmapped_scans").select("device_user_id, scan_time, resolved, units(name)")
        .gte("scan_time", from + "T00:00:00").lte("scan_time", to + "T23:59:59").order("scan_time", { ascending: false });
      if (unit !== "all") q = q.eq("unit_id", unit);
      return await pageAll((f, t) => q.range(f, t));
    },
  });
  const cols = ["Device ID", "Unit", "Scan Time", "Resolved"];
  const rows = (data ?? []).map((r) => {
    const x = r as { device_user_id: string; scan_time: string; resolved: boolean; units?: { name: string } };
    return [x.device_user_id, x.units?.name ?? "—", new Date(x.scan_time).toLocaleString("en-IN"), x.resolved ? "Yes" : <span key="n" className="text-destructive font-semibold">No</span>];
  });
  const unresolved = (data ?? []).filter((r) => !r.resolved).length;
  return (
    <div className="space-y-3">
      {unresolved > 0 && <Card className="p-3 bg-destructive/10 text-destructive text-sm flex items-center gap-2"><Fingerprint className="h-4 w-4" />{unresolved} unresolved scans — go to Biometric Mapping to resolve.</Card>}
      <ExportBar onPdf={() => exportPdf({ title: "Unmapped Scans", columns: cols, rows: (data ?? []).map((r) => [r.device_user_id, r.units?.name ?? "", new Date(r.scan_time).toLocaleString("en-IN"), r.resolved ? "Yes" : "No"]), filename: `unmapped-${from}_${to}` })}
        onExcel={() => exportExcel({ title: "Unmapped", columns: cols, rows: (data ?? []).map((r) => [r.device_user_id, r.units?.name ?? "", new Date(r.scan_time).toLocaleString("en-IN"), r.resolved ? "Yes" : "No"]), filename: `unmapped-${from}_${to}` })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 4A. Sub Status Summary ==================
const STATUS_COLORS = { active: "hsl(var(--success))", grace: "hsl(var(--warning))", expired: "hsl(var(--destructive))", pending: "hsl(var(--muted-foreground))" };
function SubStatusSummary({ unit }: { unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-sub-status", unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let q = supabase.from("subscriptions").select("id, status, start_date, end_date, grace_end_date, students(full_name, roll_number), units(name)");
      if (unit !== "all") q = q.eq("unit_id", unit);
      return await pageAll((f, t) => q.range(f, t));
    },
  });
  const today = dISO(new Date());
  const withStatus = (data ?? []).map((s) => {
    let eff: keyof typeof STATUS_COLORS = "expired";
    if (s.status === "pending") eff = "pending";
    else if (today <= s.end_date) eff = "active";
    else if (today <= s.grace_end_date) eff = "grace";
    return { ...s, eff };
  });
  const counts = { active: 0, grace: 0, expired: 0, pending: 0 };
  withStatus.forEach((s) => { counts[s.eff]++; });
  const pieData = Object.entries(counts).map(([k, v]) => ({ name: k, value: v }));
  const cols = ["Mess No", "Name", "Unit", "Status", "Start", "End", "Grace"];
  const rows = withStatus.map((s) => [s.students?.roll_number ?? "—", s.students?.full_name ?? "", s.units?.name ?? "—", <Badge key="s" style={{ background: STATUS_COLORS[s.eff], color: "#fff" }}>{s.eff}</Badge>, s.start_date, s.end_date, s.grace_end_date]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <KPI label="Active" value={counts.active} tone="text-success" />
        <KPI label="Grace" value={counts.grace} tone="text-warning" />
        <KPI label="Expired" value={counts.expired} tone="text-destructive" />
        <KPI label="Pending" value={counts.pending} tone="text-muted-foreground" />
      </div>
      <Card className="p-4">
        <div className="h-60"><ResponsiveContainer><PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
            {pieData.map((e, i) => <Cell key={i} fill={STATUS_COLORS[e.name as keyof typeof STATUS_COLORS]} />)}
          </Pie><Tooltip /><Legend />
        </PieChart></ResponsiveContainer></div>
      </Card>
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 4B. Enrollments ==================
function EnrollmentsReport() {
  const { data } = useQuery({
    queryKey: ["rpt-enrol"],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      const since = dISO(new Date(Date.now() - 365 * 86400000));
      const subs = await pageAll((f, t) => supabase.from("subscriptions").select("start_date, end_date, student_id").gte("start_date", since).range(f, t));
      const map = new Map<string, { month: string; count: number }>();
      (subs ?? []).forEach((s) => { const k = s.start_date.slice(0, 7); const cur = map.get(k) ?? { month: k, count: 0 }; cur.count++; map.set(k, cur); });
      const months: { month: string; count: number }[] = [];
      for (let i = 11; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); const k = dISO(d).slice(0, 7); months.push(map.get(k) ?? { month: k, count: 0 }); }
      return months;
    },
  });
  const cols = ["Month", "New Enrollments"];
  const rows = (data ?? []).map((m) => [m.month, m.count]);
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="text-sm font-semibold mb-2 flex items-center gap-2"><BarChart2 className="h-4 w-4" />Month-wise Enrollments</div>
        <div className="h-72"><ResponsiveContainer><BarChart data={data ?? []}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="count" fill="hsl(var(--primary))" />
        </BarChart></ResponsiveContainer></div>
      </Card>
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 4C. Renewals ==================
function RenewalsReport({ unit }: { unit: string }) {
  const today = dISO(new Date());
  const monthEnd = useMemo(() => { const d = new Date(); return dISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }, []);
  const { data } = useQuery({
    queryKey: ["rpt-renewals", unit],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      let q = supabase.from("subscriptions").select("id, end_date, grace_end_date, status, students(id, full_name, mobile, roll_number), units(name), subscription_plans(price)")
        .gte("end_date", today).lte("end_date", monthEnd).order("end_date");
      if (unit !== "all") q = q.eq("unit_id", unit);
      return await pageAll((f, t) => q.range(f, t));
    },
  });
  const cols = ["Mess No", "Name", "Mobile", "Unit", "End Date", "Amount"];
  const rows = (data ?? []).map((r) => [r.students?.roll_number ?? "—", r.students?.full_name ?? "", r.students?.mobile ?? "", r.units?.name ?? "—", r.end_date, fmtINR(Number(r.subscription_plans?.price ?? 0))]);
  return (
    <div className="space-y-3">
      <Card className="p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm"><RefreshCcw className="h-4 w-4 inline mr-1" />{(data ?? []).length} subscriptions ending this month.</div>
        <Button size="sm" variant="outline" onClick={async () => {
          for (const r of data ?? []) if (r.students?.mobile) await sendReminder(r.students.id, r.students.mobile, [r.students.full_name, r.end_date, "3000"]);
        }}><Send className="h-4 w-4 mr-1" />Send All Renewal Reminders</Button>
      </Card>
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== 5. Student Ledger ==================
function StudentLedger() {
  const [mode, setMode] = useState<"bulk" | "single">("bulk");
  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold flex items-center gap-2 mr-2"><BookOpen className="h-4 w-4" />Student Ledger</div>
        <Button size="sm" variant={mode === "bulk" ? "default" : "outline"} onClick={() => setMode("bulk")}>Bulk Summary (all students)</Button>
        <Button size="sm" variant={mode === "single" ? "default" : "outline"} onClick={() => setMode("single")}>Single Student Detail</Button>
      </Card>
      {mode === "bulk" ? <BulkLedgerSummary /> : <SingleStudentLedger />}
    </div>
  );
}

function BulkLedgerSummary() {
  const [unit, setUnit] = useState("all");
  const [filter, setFilter] = useState<LedgerFilterState>(defaultLedgerFilter);
  const [minDue, setMinDue] = useState("");
  const [maxDue, setMaxDue] = useState("");

  const { data: units } = useQuery({
    queryKey: ["units"],
    staleTime: STALE.MASTER,
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });

  const { data: planPrice } = useQuery({
    queryKey: ["default-plan-price"],
    staleTime: STALE.MASTER,
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("price").eq("is_active", true)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      return Number(data?.price ?? 3000);
    },
  });

  const { data: ledger, isLoading } = useQuery({
    queryKey: ["bulk-ledger", planPrice],
    staleTime: STALE.REPORT,
    enabled: planPrice !== undefined,
    queryFn: () => fetchLedgerRows(planPrice ?? 3000),
  });

  const rows = useMemo(() => {
    const min = minDue.trim() === "" ? null : Number(minDue);
    const max = maxDue.trim() === "" ? null : Number(maxDue);
    const custom = min !== null || max !== null;
    const base = (ledger ?? []).filter((r) => {
      if (unit !== "all" && r.unit_id !== unit) return false;
      if (custom) {
        if (min !== null && r.due_amount < min) return false;
        if (max !== null && r.due_amount > max) return false;
      }
      return true;
    });
    return applyLedgerFilter(base, custom ? { ...filter, dueRange: "all" } : filter);
  }, [ledger, unit, filter, minDue, maxDue]);

  const COLS = ["Mess No", "Name", "Mobile", "Unit", "Status", "Total Billed", "Total Paid", "Adjustments", "Total Due", "Last Payment Date"];
  const exportRows = () =>
    rows.map((r) => [
      r.roll_number ?? "—",
      r.full_name,
      r.mobile ?? "—",
      r.unit_name ?? "—",
      r.status === "active" ? "Active" : "Inactive",
      Math.round(r.total_billed),
      Math.round(r.paid),
      Math.round(r.opening_balance + r.adjustments),
      Math.round(r.due_amount),
      r.last_payment_date ? new Date(r.last_payment_date).toLocaleDateString("en-IN") : "—",
    ]);
  const meta = () => ({
    title: "Student Ledger Summary",
    subtitle: `${rows.length} students · Unit: ${unit === "all" ? "All" : units?.find((u) => u.id === unit)?.name ?? "—"} · Status: ${filter.status}`,
    columns: COLS,
    rows: exportRows(),
    filename: `student-ledger-summary-${dISO(new Date())}`,
  });

  const totals = useMemo(() => rows.reduce((a, r) => ({
    billed: a.billed + r.total_billed, paid: a.paid + r.paid,
    adj: a.adj + r.opening_balance + r.adjustments, due: a.due + r.due_amount,
  }), { billed: 0, paid: 0, adj: 0, due: 0 }), [rows]);

  return (
    <div className="space-y-3">
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Unit</Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Units</SelectItem>
              {units?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <LedgerFilterControls value={filter} onChange={setFilter} />
        <div className="space-y-1">
          <Label className="text-xs">Custom due min</Label>
          <Input className="w-[110px]" type="number" placeholder="min" value={minDue} onChange={(e) => setMinDue(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Custom due max</Label>
          <Input className="w-[110px]" type="number" placeholder="max" value={maxDue} onChange={(e) => setMaxDue(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportExcel(meta())} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1" />Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportPdf(meta())} disabled={!rows.length}>
            <FileText className="h-4 w-4 mr-1" />PDF
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Students" value={rows.length} icon={Users} />
        <KPI label="Total Billed" value={fmtINR(totals.billed)} icon={Receipt} />
        <KPI label="Total Paid" value={fmtINR(totals.paid)} icon={Wallet} tone="text-success" />
        <KPI label="Adjustments" value={fmtINR(totals.adj)} icon={PiggyBank} />
        <KPI label="Total Due" value={fmtINR(totals.due)} icon={AlertCircle} tone="text-destructive" />
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>{COLS.map((c) => (
            <TableHead key={c} className={c.startsWith("Total") || c === "Adjustments" ? "text-right" : ""}>{c}</TableHead>
          ))}</TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={COLS.length} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={COLS.length} className="text-center py-8 text-muted-foreground">No students match the filters.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.student_id}>
                <TableCell className="font-mono text-xs">{r.roll_number ?? "—"}</TableCell>
                <TableCell className="font-medium">{r.full_name}</TableCell>
                <TableCell>{r.mobile ?? "—"}</TableCell>
                <TableCell>{r.unit_name ?? "—"}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-right">{fmtINR(r.total_billed)}</TableCell>
                <TableCell className="text-right text-success">{fmtINR(r.paid)}</TableCell>
                <TableCell className="text-right">{fmtINR(r.opening_balance + r.adjustments)}</TableCell>
                <TableCell className={cn("text-right font-semibold", r.due_amount > 0 ? "text-destructive" : "text-success")}>{fmtINR(r.due_amount)}</TableCell>
                <TableCell>{r.last_payment_date ? new Date(r.last_payment_date).toLocaleDateString("en-IN") : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function SingleStudentLedger() {

  const [student, setStudent] = useState<StudentOption | null>(null);
  const { data: ledger } = useQuery({
    queryKey: ["ledger", student?.id],
    staleTime: STALE.REPORT,
    enabled: !!student,
    queryFn: async () => {
      if (!student) return null;
      const [{ data: s }, { data: subs }, { data: pays }] = await Promise.all([
        supabase.from("students").select("*, units(name)").eq("id", student.id).single(),
        supabase.from("subscriptions").select("id, start_date, end_date, grace_end_date, status, subscription_plans(name, price)").eq("student_id", student.id).order("start_date"),
        supabase.from("payments").select("id, amount, mode, status, created_at, subscription_id").eq("student_id", student.id).order("created_at"),
      ]);
      return { student: s, subs: subs ?? [], payments: pays ?? [] };
    },
  });

  const summary = useMemo(() => {
    if (!ledger) return null;
    const paid = ledger.payments.filter((p) => p.status === "success").reduce((a, p) => a + Number(p.amount), 0);
    const due = ledger.subs.reduce((a, s) => a + Number(s.subscription_plans?.price ?? 0), 0);
    const lastPay = ledger.payments.filter((p) => p.status === "success").slice(-1)[0];
    const months = ledger.subs.length;
    return { paid, due, balance: paid - due, lastPay, months };
  }, [ledger]);

  const printLedger = () => window.print();

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="text-sm font-semibold mb-2 flex items-center gap-2"><BookOpen className="h-4 w-4" />Student Account Ledger</div>
        <StudentPicker value={student} onChange={setStudent} placeholder="Search student by name, mobile or mess no…" />
      </Card>

      {!ledger && <Card className="p-8 text-center text-muted-foreground">Select a student to view their complete ledger.</Card>}

      {ledger && ledger.student && (
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex justify-between items-start flex-wrap gap-3">
              <div className="flex gap-4">
                {ledger.student.photo_url && <img src={ledger.student.photo_url} alt="" className="h-16 w-16 rounded-full object-cover" />}
                <div>
                  <div className="text-lg font-bold">{ledger.student.full_name}</div>
                  <div className="text-sm text-muted-foreground">Mess No: <span className="font-mono">{ledger.student.roll_number ?? "—"}</span></div>
                  <div className="text-sm text-muted-foreground">Room: {ledger.student.hostel_room ?? "—"} · {ledger.student.units?.name ?? "—"}</div>
                  <div className="text-sm">📱 {ledger.student.mobile}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge className={!ledger.student.exit_date ? "bg-success text-success-foreground" : "bg-muted"}>{ledger.student.exit_date ? "Inactive" : "Active"}</Badge>
                <Button size="sm" variant="outline" onClick={printLedger}><Printer className="h-4 w-4 mr-1" />Print</Button>
              </div>
            </div>
          </Card>

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPI label="Subscriptions" value={summary!.months} icon={CalendarRange} />
            <KPI label="Total Due" value={fmtINR(summary!.due)} icon={Receipt} />
            <KPI label="Total Paid" value={fmtINR(summary!.paid)} icon={Wallet} tone="text-success" />
            <KPI label={summary!.balance >= 0 ? "Advance" : "Outstanding"} value={fmtINR(Math.abs(summary!.balance))} tone={summary!.balance >= 0 ? "text-success" : "text-destructive"} icon={PiggyBank} />
            <KPI label="Last Payment" value={summary!.lastPay ? fmtINR(Number(summary!.lastPay.amount)) : "—"} />
          </div>

          {/* Subscription timeline */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Subscription Timeline</div>
            <div className="space-y-2">
              {ledger.subs.length === 0 && <div className="text-sm text-muted-foreground">No subscriptions.</div>}
              {ledger.subs.map((s) => {
                const active = dISO(new Date()) <= s.end_date && s.status !== "pending";
                return (
                  <div key={s.id} className="flex items-center gap-3 text-sm border-l-2 pl-3" style={{ borderColor: active ? "hsl(var(--success))" : "hsl(var(--muted))" }}>
                    <div className="w-28 text-muted-foreground">{s.start_date}</div>
                    <TrendingUp className="h-3 w-3 text-muted-foreground" />
                    <div className="w-28">{s.end_date}</div>
                    <Badge variant="outline">{s.subscription_plans?.name ?? "Plan"}</Badge>
                    <div className="text-muted-foreground">{fmtINR(Number(s.subscription_plans?.price ?? 0))}</div>
                    <Badge className={active ? "bg-success text-success-foreground ml-auto" : "bg-muted ml-auto"}>{active ? "Active" : s.status}</Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Payment history */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3">Payment History</div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>#</TableHead><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Mode</TableHead><TableHead>Status</TableHead><TableHead>Running Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ledger.payments.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No payments.</TableCell></TableRow>}
                {(() => { let running = 0; return ledger.payments.map((p, i) => {
                  if (p.status === "success") running += Number(p.amount);
                  const success = p.status === "success";
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{new Date(p.created_at).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell className={success ? "text-success font-medium" : "text-muted-foreground"}>{fmtINR(Number(p.amount))}</TableCell>
                      <TableCell><Badge variant="outline">{p.mode.toUpperCase()}</Badge></TableCell>
                      <TableCell>{p.status}</TableCell>
                      <TableCell className="font-mono">{fmtINR(running)}</TableCell>
                    </TableRow>
                  );
                }); })()}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}

// ================== 6A. GST Report ==================
// GST is charged at 5% inclusive: every collected rupee already contains the tax.
// Taxable value = Gross / 1.05, GST = Gross − Taxable (split equally into CGST 2.5% + SGST 2.5%).
const GST_RATE = 0.05;
const GST_DIVISOR = 1 + GST_RATE;

function GSTReport({ from, to }: { from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-gst-5", from, to],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      const fromTs = from + "T00:00:00";
      const toTs = to + "T23:59:59";
      const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
      const [paysRows, posRows] = await Promise.all([
        pageAll((f2, t2) => supabase.from("payments").select("amount, created_at").eq("status", "success").gte("created_at", fromTs).lte("created_at", toTs).range(f2, t2)),
        pageAll((f2, t2) => db.from("pos_sales").select("total, sold_at").gte("sold_at", fromTs).lte("sold_at", toTs).range(f2, t2)),
      ]);
      const paysRes = { data: paysRows };
      const posRes = { data: posRows };
      const map = new Map<string, { mess: number; pos: number }>();
      const bump = (k: string, key: "mess" | "pos", amt: number) => {
        const cur = map.get(k) ?? { mess: 0, pos: 0 };
        cur[key] += amt;
        map.set(k, cur);
      };
      ((paysRes.data ?? []) as { amount: number; created_at: string }[])
        .forEach((p) => bump(p.created_at.slice(0, 7), "mess", Number(p.amount)));
      ((posRes.data ?? []) as unknown as { total: number; sold_at: string }[])
        .forEach((p) => bump(p.sold_at.slice(0, 7), "pos", Number(p.total)));

      return Array.from(map.entries())
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([month, v]) => {
          const gross = v.mess + v.pos;
          const taxable = gross / GST_DIVISOR;
          const gst = gross - taxable;
          return { month, mess: v.mess, pos: v.pos, gross, taxable, cgst: gst / 2, sgst: gst / 2, gst };
        });
    },
  });

  const months = data ?? [];
  const totals = months.reduce(
    (a, m) => ({ gross: a.gross + m.gross, taxable: a.taxable + m.taxable, gst: a.gst + m.gst }),
    { gross: 0, taxable: 0, gst: 0 },
  );

  const cols = ["Month", "Mess Collection", "POS Sales", "Gross (incl. GST)", "Taxable Value", "CGST 2.5%", "SGST 2.5%", "Total GST 5%"];
  const rows = months.map((m) => [
    m.month, fmtINR(m.mess), fmtINR(m.pos), fmtINR(m.gross), fmtINR(m.taxable), fmtINR(m.cgst), fmtINR(m.sgst), fmtINR(m.gst),
  ]);
  const exportRows = months.map((m) => [
    m.month, m.mess.toFixed(2), m.pos.toFixed(2), m.gross.toFixed(2), m.taxable.toFixed(2), m.cgst.toFixed(2), m.sgst.toFixed(2), m.gst.toFixed(2),
  ]);
  const subtitle = `Period ${from} to ${to} · GST 5% inclusive (Taxable = Gross ÷ 1.05)`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <KPI label="Gross Turnover (incl. GST)" value={fmtINR(totals.gross)} />
        <KPI label="Taxable Value" value={fmtINR(totals.taxable)} />
        <KPI label="GST Payable @5%" value={fmtINR(totals.gst)} tone="text-primary" />
      </div>
      <p className="text-xs text-muted-foreground">
        All amounts are GST-inclusive. Taxable value = Gross ÷ 1.05; GST is split as CGST 2.5% + SGST 2.5%.
        Covers mess payments and walk-in POS sales in the selected period.
      </p>
      <ExportBar
        onPdf={() => exportPdf({ title: "GST Report (5% inclusive)", subtitle, columns: cols, rows: exportRows, filename: "gst-report" })}
        onExcel={() => exportExcel({ title: "GST 5pct", columns: cols, rows: exportRows, filename: "gst-report" })}
      />
      <DataTable cols={cols} rows={rows} empty="No collections in this period." />
    </div>
  );
}


// ================== 6B. Revenue Dashboard ==================
function RevenueReport() {
  const { data } = useQuery({
    queryKey: ["rpt-revenue-dash"],
    staleTime: STALE.REPORT,
    queryFn: async () => {
      const since = dISO(new Date(Date.now() - 365 * 86400000));
      const [pays, subs] = await Promise.all([
        pageAll((f, t) => supabase.from("payments").select("amount, created_at, status").eq("status", "success").gte("created_at", since).range(f, t)),
        pageAll((f, t) => supabase.from("subscriptions").select("start_date, subscription_plans(price)").gte("start_date", since).range(f, t)),
      ]);
      const collected = new Map<string, number>();
      (pays ?? []).forEach((p) => { const k = p.created_at.slice(0, 7); collected.set(k, (collected.get(k) ?? 0) + Number(p.amount)); });
      const gross = new Map<string, { count: number; amount: number }>();
      (subs ?? []).forEach((s) => { const k = s.start_date.slice(0, 7); const cur = gross.get(k) ?? { count: 0, amount: 0 }; cur.count++; cur.amount += Number(s.subscription_plans?.price ?? 0); gross.set(k, cur); });
      const months: { month: string; students: number; gross: number; gst: number; net: number; collected: number; outstanding: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i); const k = dISO(d).slice(0, 7);
        const g = gross.get(k) ?? { count: 0, amount: 0 }; const c = collected.get(k) ?? 0;
        const gst = c - c / 1.18; const net = c / 1.18;
        months.push({ month: k, students: g.count, gross: g.amount, gst, net, collected: c, outstanding: Math.max(0, g.amount - c) });
      }
      return months;
    },
  });
  const totals = (data ?? []).reduce((a, m) => ({ gross: a.gross + m.gross, collected: a.collected + m.collected, outstanding: a.outstanding + m.outstanding, net: a.net + m.net }), { gross: 0, collected: 0, outstanding: 0, net: 0 });
  const eff = totals.gross ? ((totals.collected / totals.gross) * 100).toFixed(1) : "—";
  const cols = ["Month", "Students", "Gross Due", "Collected", "GST", "Net Revenue", "Outstanding"];
  const rows = (data ?? []).map((m) => [m.month, m.students, fmtINR(m.gross), fmtINR(m.collected), fmtINR(m.collected - m.net), fmtINR(m.net), fmtINR(m.outstanding)]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Gross Revenue" value={fmtINR(totals.gross)} tone="text-primary" />
        <KPI label="Net (after GST)" value={fmtINR(totals.net)} />
        <KPI label="Outstanding" value={fmtINR(totals.outstanding)} tone="text-destructive" />
        <KPI label="Collection Efficiency" value={eff + "%"} tone="text-success" />
      </div>
      <ExportBar onPdf={() => exportPdf({ title: "Revenue Dashboard", columns: cols, rows: (data ?? []).map((m) => [m.month, m.students, m.gross.toFixed(2), m.collected.toFixed(2), (m.collected - m.net).toFixed(2), m.net.toFixed(2), m.outstanding.toFixed(2)]), filename: "revenue-dashboard" })}
        onExcel={() => exportExcel({ title: "Revenue", columns: cols, rows: (data ?? []).map((m) => [m.month, m.students, m.gross, m.collected, m.collected - m.net, m.net, m.outstanding]), filename: "revenue-dashboard" })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}

// ================== Reprint ==================
function ReprintLog({ from, to }: { from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-reprint", from, to],
    staleTime: STALE.REPORT,
    queryFn: async () => (await supabase.from("token_reprints").select("created_at, reason, attendance:attendance_id(scan_date, meal_type, token_number, students(full_name), units(name))")
      .gte("created_at", from + "T00:00:00").lte("created_at", to + "T23:59:59").order("created_at", { ascending: false })).data ?? [],
  });
  const cols = ["Reprint Time", "Student", "Unit", "Meal", "Token", "Reason"];
  const rows = (data ?? []).map((r) => {
    const x = r as unknown as { created_at: string; reason: string | null; attendance?: { meal_type: string; token_number: number; students?: { full_name: string }; units?: { name: string } } };
    return [new Date(x.created_at).toLocaleString("en-IN"), x.attendance?.students?.full_name ?? "", x.attendance?.units?.name ?? "—", x.attendance?.meal_type ?? "", x.attendance?.token_number ?? "", x.reason ?? ""];
  });
  return (
    <div className="space-y-3">
      <ExportBar onPdf={() => exportPdf({ title: "Reprint Log", columns: cols, rows, filename: `reprint-${from}_${to}` })}
        onExcel={() => exportExcel({ title: "Reprint", columns: cols, rows, filename: `reprint-${from}_${to}` })} />
      <DataTable cols={cols} rows={rows} />
    </div>
  );
}
