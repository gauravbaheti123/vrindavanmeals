import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users, CalendarClock, IndianRupee, AlertTriangle, Wallet,
  Utensils, Clock, XCircle, CheckCircle2, RefreshCw, ArrowRight, Fingerprint,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { computeSubscriptionStatus } from "@/lib/subscription-status";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Vrindavan Meals" }] }),
  component: Dashboard,
});

const REFRESH_MS = 60_000;
const ATTENDANCE_REFRESH_MS = 30_000;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAhead(n: number) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}
function monthStartISO(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function inr(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function Dashboard() {
  const [unitId, setUnitId] = useState<string>("all");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const { data: units } = useQuery({
    queryKey: ["units-list"],
    queryFn: async () => {
      const { data } = await supabase.from("units").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: plan } = useQuery({
    queryKey: ["default-plan"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("price")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });
  const planPrice = Number(plan?.price ?? 3000);

  // Main aggregate query — all in parallel
  const { data: agg, refetch: refetchAgg } = useQuery({
    queryKey: ["dashboard-agg", unitId],
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const today = todayISO();
      const monthStart = monthStartISO();
      const in5 = daysAhead(5);

      // Filter helpers per unit
      const unitFilter = <T,>(q: T, col = "unit_id"): T => {
        if (unitId === "all") return q;
        // @ts-expect-error dynamic .eq
        return q.eq(col, unitId);
      };

      const [
        monthPayments,
        subsAll,
        attendanceToday,
        unmappedToday,
        pendingStudents,
        studentsCount,
      ] = await Promise.all([
        unitFilter(
          supabase
            .from("payments")
            .select("amount, mode, student_id, status, created_at, students!inner(unit_id)")
            .eq("status", "success")
            .gte("created_at", monthStart),
          "students.unit_id",
        ),
        unitFilter(
          supabase
            .from("subscriptions")
            .select("id, student_id, status, end_date, grace_end_date, unit_id"),
        ),
        unitFilter(
          supabase
            .from("attendance")
            .select("id, meal_type, scan_type, unit_id, scan_date")
            .eq("scan_date", today),
        ),
        supabase
          .from("unmapped_scans")
          .select("id", { count: "exact", head: true })
          .gte("scan_time", today + "T00:00:00"),
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("is_approved", false),
        unitFilter(
          supabase
            .from("students")
            .select("id", { count: "exact", head: true })
            .eq("is_approved", true),
        ),
      ]);

      // Payments
      type Pay = { amount: number; mode: string; student_id: string };
      const pays = (monthPayments.data ?? []) as unknown as Pay[];
      const totalCollection = pays.reduce((s, p) => s + Number(p.amount), 0);
      const byMode = pays.reduce<Record<string, number>>((acc, p) => {
        acc[p.mode] = (acc[p.mode] ?? 0) + Number(p.amount);
        return acc;
      }, {});
      const paidStudentIds = new Set(pays.map((p) => p.student_id));

      // Subscriptions — compute effective status
      type Sub = {
        id: string; student_id: string; status: "active" | "grace" | "expired" | "pending";
        end_date: string; grace_end_date: string; unit_id: string | null;
      };
      const subs = (subsAll.data ?? []) as Sub[];
      const eff = subs.map((s) => ({ ...s, eff: computeSubscriptionStatus(s) }));
      const active = eff.filter((s) => s.eff === "active").length;
      const grace = eff.filter((s) => s.eff === "grace").length;
      const expired = eff.filter((s) => s.eff === "expired").length;
      const pending = eff.filter((s) => s.eff === "pending").length;

      // Pending payments: active/grace subs whose student hasn't paid this month
      const unpaid = eff.filter(
        (s) => (s.eff === "active" || s.eff === "grace") && !paidStudentIds.has(s.student_id),
      );
      const pendingCount = unpaid.length;
      const pendingAmount = pendingCount * planPrice;

      // Expiring in next 5 days
      const expiring = eff.filter(
        (s) => s.eff === "active" && s.end_date >= today && s.end_date <= in5,
      ).length;

      // Attendance
      type Att = { meal_type: string; scan_type: string };
      const atts = (attendanceToday.data ?? []) as Att[];
      const lunchCount = atts.filter((a) => a.meal_type === "lunch").length;
      const dinnerCount = atts.filter((a) => a.meal_type === "dinner").length;
      const bio = atts.filter((a) => a.scan_type === "biometric").length;
      const manual = atts.filter((a) => a.scan_type !== "biometric").length;

      return {
        collection: { total: totalCollection, byMode },
        pendingPay: { count: pendingCount, amount: pendingAmount },
        attendance: { total: atts.length, lunch: lunchCount, dinner: dinnerCount, bio, manual },
        subs: { active, grace, expired, pending, total: eff.length },
        alerts: {
          expiring,
          grace,
          unmapped: unmappedToday.count ?? 0,
          pendingStudents: pendingStudents.count ?? 0,
        },
        activeStudents: studentsCount.count ?? 0,
        pendingList: unpaid.slice(0, 5).map((u) => u.student_id),
      };
    },
  });

  useEffect(() => {
    if (agg) setLastUpdated(new Date());
  }, [agg]);

  // Top pending students details
  const { data: pendingListData } = useQuery({
    queryKey: ["pending-list", agg?.pendingList?.join(",")],
    enabled: !!agg?.pendingList?.length,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, units(name)")
        .in("id", agg!.pendingList);
      return (data ?? []) as unknown as { id: string; full_name: string; units?: { name: string } }[];
    },
  });

  // Recent attendance
  const { data: recent } = useQuery({
    queryKey: ["dashboard-recent-attendance", unitId],
    refetchInterval: ATTENDANCE_REFRESH_MS,
    queryFn: async () => {
      let q = supabase
        .from("attendance")
        .select("id, token_number, meal_type, scan_type, scan_time, is_override, students(full_name), units(name)")
        .eq("scan_date", todayISO())
        .order("scan_time", { ascending: false })
        .limit(20);
      if (unitId !== "all") q = q.eq("unit_id", unitId);
      const { data } = await q;
      return data ?? [];
    },
  });

  // 6-month revenue trend
  const { data: trend } = useQuery({
    queryKey: ["revenue-trend", unitId],
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const start = new Date();
      start.setMonth(start.getMonth() - 5);
      start.setDate(1); start.setHours(0, 0, 0, 0);
      let q = supabase
        .from("payments")
        .select("amount, created_at, student_id, students!inner(unit_id)")
        .eq("status", "success")
        .gte("created_at", start.toISOString());
      if (unitId !== "all") q = q.eq("students.unit_id", unitId);
      const { data } = await q;
      const rows = (data ?? []) as unknown as { amount: number; created_at: string; student_id: string }[];
      const buckets: Record<string, { month: string; amount: number; students: Set<string> }> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
        const key = d.toISOString().slice(0, 7);
        buckets[key] = { month: d.toLocaleString("en-IN", { month: "short" }), amount: 0, students: new Set() };
      }
      for (const r of rows) {
        const key = r.created_at.slice(0, 7);
        if (buckets[key]) {
          buckets[key].amount += Number(r.amount);
          buckets[key].students.add(r.student_id);
        }
      }
      return Object.values(buckets).map((b) => ({
        month: b.month,
        amount: Math.round(b.amount),
        students: b.students.size,
      }));
    },
  });

  const fmtTime = (t: string) =>
    new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

  const subDonut = useMemo(() => [
    { label: "Active", value: agg?.subs.active ?? 0, color: "hsl(var(--success))" },
    { label: "Grace", value: agg?.subs.grace ?? 0, color: "hsl(var(--warning))" },
    { label: "Expired", value: agg?.subs.expired ?? 0, color: "hsl(var(--destructive))" },
    { label: "Pending", value: agg?.subs.pending ?? 0, color: "hsl(var(--muted-foreground))" },
  ], [agg]);
  const subTotal = subDonut.reduce((s, x) => s + x.value, 0) || 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Last updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={unitId} onValueChange={(v) => { setUnitId(v); refetchAgg(); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All units" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Units</SelectItem>
              {units?.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* SECTION 1: KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/payments">
          <Card className="border-l-4 border-l-success hover:shadow-md transition-shadow h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This Month Collection</CardTitle>
              <Wallet className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-3xl font-bold text-success">{inr(agg?.collection.total ?? 0)}</div>
              <div className="text-xs text-muted-foreground">
                Cash: {inr(agg?.collection.byMode.cash ?? 0)} · UPI: {inr(agg?.collection.byMode.upi ?? 0)}<br />
                Card: {inr(agg?.collection.byMode.card ?? 0)} · Razorpay: {inr(agg?.collection.byMode.razorpay ?? 0)}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/subscriptions">
          <Card className="border-l-4 border-l-destructive hover:shadow-md transition-shadow h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending Payments</CardTitle>
              <IndianRupee className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-3xl font-bold text-destructive">{agg?.pendingPay.count ?? 0} <span className="text-base font-normal text-muted-foreground">students</span></div>
              <div className="text-xs text-muted-foreground">{inr(agg?.pendingPay.amount ?? 0)} total pending</div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/attendance">
          <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today's Attendance</CardTitle>
              <Utensils className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-3xl font-bold text-blue-600">
                {agg?.attendance.total ?? 0} <span className="text-xs font-normal text-muted-foreground">total</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Lunch: {agg?.attendance.lunch ?? 0} · Dinner: {agg?.attendance.dinner ?? 0}<br />
                Biometric: {agg?.attendance.bio ?? 0} · Manual: {agg?.attendance.manual ?? 0}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/subscriptions">
          <Card className="border-l-4 border-l-primary hover:shadow-md transition-shadow h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Subscriptions</CardTitle>
              <CalendarClock className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-3xl font-bold text-primary">{agg?.subs.active ?? 0} <span className="text-xs font-normal text-muted-foreground">active</span></div>
              <div className="text-xs text-muted-foreground">
                Grace: {agg?.subs.grace ?? 0} ⚠️ · Expired: {agg?.subs.expired ?? 0} ❌ · Pending: {agg?.subs.pending ?? 0} 🕐
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* SECTION 2: Alert Banners */}
      {agg && (agg.alerts.expiring || agg.alerts.grace || agg.alerts.unmapped || agg.alerts.pendingStudents) ? (
        <div className="space-y-2">
          {agg.alerts.expiring > 0 && (
            <AlertStrip to="/reports" tone="destructive" icon={<AlertTriangle className="h-4 w-4" />}>
              <b>{agg.alerts.expiring}</b> student{agg.alerts.expiring > 1 ? "s'" : "'s"} subscription expires in next 5 days — Send Reminders
            </AlertStrip>
          )}
          {agg.alerts.grace > 0 && (
            <AlertStrip to="/subscriptions" tone="warning" icon={<Clock className="h-4 w-4" />}>
              <b>{agg.alerts.grace}</b> subscription{agg.alerts.grace > 1 ? "s" : ""} in Grace Period — collect payment soon
            </AlertStrip>
          )}
          {agg.alerts.unmapped > 0 && (
            <AlertStrip to="/biometric" tone="warning" icon={<Fingerprint className="h-4 w-4" />}>
              <b>{agg.alerts.unmapped}</b> unmapped biometric scan{agg.alerts.unmapped > 1 ? "s" : ""} today — resolve now
            </AlertStrip>
          )}
          {agg.alerts.pendingStudents > 0 && (
            <AlertStrip to="/students" tone="info" icon={<Users className="h-4 w-4" />}>
              <b>{agg.alerts.pendingStudents}</b> student{agg.alerts.pendingStudents > 1 ? "s" : ""} pending approval
            </AlertStrip>
          )}
        </div>
      ) : null}

      {/* SECTION 3: Two column */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Left: Recent Attendance */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-base">Recent Attendance</CardTitle>
            <Link to="/reports" className="text-xs text-primary hover:underline flex items-center gap-1">
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[380px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead className="w-16">Token</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Meal</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!recent?.length ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No scans yet today</TableCell></TableRow>
                  ) : recent.map((r) => {
                    const row = r as unknown as {
                      id: string; token_number: number; meal_type: string; scan_type: string;
                      scan_time: string; is_override: boolean;
                      students?: { full_name: string }; units?: { name: string };
                    };
                    const rowClass = row.is_override
                      ? "bg-warning/10"
                      : row.scan_type === "biometric"
                      ? "bg-success/5"
                      : "bg-blue-500/5";
                    return (
                      <TableRow key={row.id} className={rowClass}>
                        <TableCell className="font-mono text-xs">#{row.token_number}</TableCell>
                        <TableCell className="font-medium">{row.students?.full_name ?? "—"}</TableCell>
                        <TableCell className="text-xs">{row.units?.name ?? "—"}</TableCell>
                        <TableCell className="capitalize text-xs">{row.meal_type}</TableCell>
                        <TableCell className="text-xs">{fmtTime(row.scan_time)}</TableCell>
                        <TableCell>
                          <Badge variant={row.scan_type === "biometric" ? "default" : "secondary"} className="capitalize text-[10px]">
                            {row.scan_type === "biometric" ? "Bio" : "Manual"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Right: Quick stats */}
        <div className="lg:col-span-2 space-y-4">
          {/* Subscription breakdown */}
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Subscription Breakdown</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {subDonut.map((s) => (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="font-semibold">{s.value}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded overflow-hidden">
                    <div className="h-full transition-all" style={{ width: `${(s.value / subTotal) * 100}%`, background: s.color }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Today's serving */}
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Today's Serving</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <MealProgress label="Lunch" served={agg?.attendance.lunch ?? 0} total={agg?.subs.active ?? 0} icon={<CheckCircle2 className="h-3 w-3 text-success" />} />
              <MealProgress label="Dinner" served={agg?.attendance.dinner ?? 0} total={agg?.subs.active ?? 0} icon={<CheckCircle2 className="h-3 w-3 text-success" />} />
            </CardContent>
          </Card>

          {/* Top pending */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm">Top Pending Payments</CardTitle>
              <Link to="/subscriptions" className="text-xs text-primary hover:underline">View All</Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {!pendingListData?.length ? (
                <div className="text-xs text-muted-foreground text-center py-4 flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" /> All caught up
                </div>
              ) : pendingListData.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs border-b pb-1 last:border-0">
                  <div>
                    <div className="font-medium">{s.full_name}</div>
                    <div className="text-muted-foreground">{s.units?.name ?? "—"}</div>
                  </div>
                  <XCircle className="h-4 w-4 text-destructive" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SECTION 4: Trend */}
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base">Revenue Trend (Last 6 Months)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend ?? []}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => "₹" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v: number, _n, p) => [inr(v) + ` (${p.payload.students} students)`, "Revenue"]}
                  cursor={{ fill: "hsl(var(--muted))" }}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {(trend ?? []).map((_, i) => (
                    <Cell key={i} fill="hsl(var(--primary))" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AlertStrip({
  children, to, tone, icon,
}: { children: React.ReactNode; to: string; tone: "destructive" | "warning" | "info"; icon: React.ReactNode }) {
  const styles = {
    destructive: "border-destructive/40 bg-destructive/10 text-destructive",
    warning: "border-warning/40 bg-warning/10 text-warning-foreground",
    info: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  }[tone];
  return (
    <Link to={to} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:opacity-90 transition ${styles}`}>
      {icon}
      <span className="flex-1">{children}</span>
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function MealProgress({ label, served, total, icon }: { label: string; served: number; total: number; icon: React.ReactNode }) {
  const pct = total > 0 ? Math.min(100, (served / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="flex items-center gap-1">{icon}{label}</span>
        <span className="font-semibold">{served} / {total}</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
