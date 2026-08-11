import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pageAll } from "@/lib/fetch-all";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, CalendarClock, IndianRupee, AlertTriangle, Wallet,
  Utensils, RefreshCw, ArrowRight,
} from "lucide-react";
import { fetchLedgerRows } from "@/lib/dues";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Vrindavan Meals" }] }),
  component: Dashboard,
});

const REFRESH_MS = 60_000;

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAhead = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

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

  const thresholds = useDueThresholds();
  const dueAmountThreshold = thresholds.amount;
  const daysOverdueThreshold = thresholds.days;



  const { data: agg } = useQuery({
    queryKey: ["dashboard-agg-v3", unitId, planPrice, dueAmountThreshold, daysOverdueThreshold],
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const today = todayISO();
      const monthStart = monthStartISO();

      const unitFilter = <T,>(q: T, col = "unit_id"): T => {
        if (unitId === "all") return q;
        // @ts-expect-error dynamic .eq
        return q.eq(col, unitId);
      };

      const [monthPaymentRows, attendanceRows, studentsCount] = await Promise.all([
        pageAll((f, t) =>
          unitFilter(
            supabase
              .from("payments")
              .select("amount, mode, student_id, status, created_at, students!inner(unit_id)")
              .eq("status", "success")
              .gte("created_at", monthStart),
            "students.unit_id",
          ).range(f, t),
        ),
        pageAll((f, t) =>
          unitFilter(
            supabase
              .from("attendance")
              .select("id, meal_type, unit_id, scan_date")
              .eq("scan_date", today),
          ).range(f, t),
        ),
        unitFilter(
          supabase
            .from("students")
            .select("id", { count: "exact", head: true })
            .eq("is_approved", true),
        ),
      ]);


      type Pay = { amount: number; mode: string; student_id: string };
      const pays = monthPaymentRows as unknown as Pay[];
      const totalCollection = pays.reduce((s, p) => s + Number(p.amount), 0);
      const byMode = pays.reduce<Record<string, number>>((acc, p) => {
        acc[p.mode] = (acc[p.mode] ?? 0) + Number(p.amount);
        return acc;
      }, {});
      




      // Single source of truth — same formula as /dues page
      const ledgerRows = await fetchLedgerRows(planPrice);
      const scopedLedger = unitId === "all" ? ledgerRows : ledgerRows.filter((r) => r.unit_id === unitId);
      const scopedDues = scopedLedger.filter((r) => r.due_amount > 0);
      const outstandingAmount = scopedDues.reduce((s, r) => s + r.due_amount, 0);
      const uniqUnpaidStudents = new Set(scopedDues.map((r) => r.student_id));

      const activeStudents = scopedLedger.filter((r) => r.status === "active");
      const activeDue = activeStudents.reduce((s, r) => s + Math.max(0, r.due_amount), 0);
      const highDue = scopedDues.filter(
        (r) => r.due_amount >= dueAmountThreshold || r.days_overdue >= daysOverdueThreshold,
      );


      type Att = { meal_type: string };
      const atts = attendanceRows as unknown as Att[];
      const lunchCount = atts.filter((a) => a.meal_type === "lunch").length;
      const dinnerCount = atts.filter((a) => a.meal_type === "dinner").length;

      return {
        collection: { total: totalCollection, byMode },
        outstanding: { amount: outstandingAmount, students: uniqUnpaidStudents.size },
        highDue: { count: highDue.length, amount: highDue.reduce((s, r) => s + r.due_amount, 0) },
        subs: { active: activeStudents.length, inactive: scopedLedger.length - activeStudents.length, activeDue, total: scopedLedger.length },

        attendance: { total: atts.length, lunch: lunchCount, dinner: dinnerCount },
        studentsTotal: studentsCount.count ?? 0,
      };
    },
  });

  useEffect(() => { if (agg) setLastUpdated(new Date()); }, [agg]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <Select value={unitId} onValueChange={setUnitId}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All units" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Units</SelectItem>
            {units?.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* PRIMARY — Outstanding Dues (largest, top) */}
      <Link to="/dues" className="block">
        <Card className="border-l-8 border-l-destructive hover:shadow-lg transition-shadow bg-gradient-to-br from-destructive/5 to-transparent">
          <CardContent className="pt-6 pb-6 flex items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-xl bg-destructive/10 grid place-items-center shrink-0">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Total Outstanding Dues</div>
                <div className="text-5xl font-bold text-destructive leading-tight">{inr(agg?.outstanding.amount ?? 0)}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  <b className="text-foreground">{agg?.outstanding.students ?? 0}</b> students overdue
                </div>
              </div>
            </div>
            <div className="text-sm text-primary flex items-center gap-1 font-medium">
              View Details <ArrowRight className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* SECONDARY ROW — money cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          to="/reports"
          tone="success"
          icon={<Wallet className="h-5 w-5" />}
          label="This Month Collection"
          value={inr(agg?.collection.total ?? 0)}
          sub={`Cash ${inr(agg?.collection.byMode.cash ?? 0)} · UPI ${inr(agg?.collection.byMode.upi ?? 0)} · Card ${inr(agg?.collection.byMode.card ?? 0)}`}
        />
        <StatCard
          to="/dues"
          tone={agg && agg.highDue.count > 0 ? "warning" : "muted"}
          icon={<AlertTriangle className="h-5 w-5" />}
          label="High Due Alert"
          value={String(agg?.highDue.count ?? 0)}
          sub={`Over ${inr(dueAmountThreshold)} or ${daysOverdueThreshold}+ days · ${inr(agg?.highDue.amount ?? 0)}`}
          alert={agg ? agg.highDue.count > 0 : false}
        />
        <StatCard
          to="/subscriptions"
          tone="primary"
          icon={<IndianRupee className="h-5 w-5" />}
          label="Active Students"
          value={String(agg?.subs.active ?? 0)}
          sub={`Inactive ${agg?.subs.inactive ?? 0} · Active due ${inr(agg?.subs.activeDue ?? 0)}`}
        />

      </div>

      {/* TERTIARY ROW — operational (smaller, muted) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          to="/attendance"
          tone="muted"
          size="sm"
          icon={<Utensils className="h-4 w-4" />}
          label="Today's Attendance"
          value={String(agg?.attendance.total ?? 0)}
          sub={`Lunch ${agg?.attendance.lunch ?? 0} · Dinner ${agg?.attendance.dinner ?? 0}`}
        />
        <StatCard
          to="/students"
          tone="muted"
          size="sm"
          icon={<Users className="h-4 w-4" />}
          label="Students"
          value={String(agg?.studentsTotal ?? 0)}
          sub="Total active"
        />
      </div>
    </div>
  );
}

function StatCard({
  to, tone, icon, label, value, sub, size = "md", alert = false,
}: {
  to: string;
  tone: "success" | "warning" | "primary" | "destructive" | "muted";
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  size?: "sm" | "md";
  alert?: boolean;
}) {
  const border = {
    success: "border-l-success",
    warning: "border-l-warning",
    primary: "border-l-primary",
    destructive: "border-l-destructive",
    muted: "border-l-muted-foreground/30",
  }[tone];
  const iconColor = {
    success: "text-success",
    warning: "text-warning-foreground",
    primary: "text-primary",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];
  const valueSize = size === "sm" ? "text-2xl" : "text-3xl";
  return (
    <Link to={to} className="block">
      <Card className={`border-l-4 ${border} hover:shadow-md transition-shadow h-full ${alert ? "bg-warning/5" : ""}`}>
        <CardContent className={`${size === "sm" ? "pt-3 pb-3" : "pt-4 pb-4"} flex items-start justify-between gap-3`}>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
              <span className={iconColor}>{icon}</span>{label}
            </div>
            <div className={`${valueSize} font-bold mt-0.5`}>{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1 truncate">{sub}</div>}
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        </CardContent>
      </Card>
    </Link>
  );
}
