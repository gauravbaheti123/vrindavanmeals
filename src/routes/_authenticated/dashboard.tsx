import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, CalendarClock, IndianRupee, AlertTriangle, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Vrindavan Meals" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [students, active, expiring, unmapped] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_approved", true),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).lte("end_date", new Date(Date.now() + 5*86400000).toISOString().slice(0,10)).gte("end_date", today).eq("status", "active"),
        supabase.from("unmapped_scans").select("id", { count: "exact", head: true }).eq("resolved", false),
      ]);
      return {
        students: students.count ?? 0,
        active: active.count ?? 0,
        expiring: expiring.count ?? 0,
        unmapped: unmapped.count ?? 0,
      };
    },
  });

  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ["dashboard-recent-attendance"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("attendance")
        .select("id, meal_type, scan_type, scan_time, students(full_name), units(name)")
        .eq("scan_date", today)
        .order("scan_time", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: unmappedToday } = useQuery({
    queryKey: ["dashboard-unmapped-today"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await supabase.from("unmapped_scans")
        .select("id", { count: "exact", head: true })
        .gte("scan_time", today + "T00:00:00");
      return count ?? 0;
    },
  });

  const stats = [
    { label: "Approved Students", value: data?.students ?? "—", icon: Users, color: "text-primary" },
    { label: "Active Subscriptions", value: data?.active ?? "—", icon: CalendarClock, color: "text-success" },
    { label: "Expiring in 5 days", value: data?.expiring ?? "—", icon: AlertTriangle, color: "text-warning-foreground" },
    { label: "Unmapped Scans", value: data?.unmapped ?? "—", icon: IndianRupee, color: "text-destructive" },
  ];

  const fmtTime = (t: string) =>
    new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of canteen operations across all units.</p>
      </div>
      {(unmappedToday ?? 0) > 0 && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <div className="font-semibold text-destructive">{unmappedToday} unmapped scan(s) today</div>
              <div className="text-sm text-muted-foreground">Resolve them in Biometric Mapping.</div>
            </div>
            <a href="/biometric" className="text-sm text-primary underline">Resolve →</a>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student Name</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Meal Type</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : !recent?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No recent activity today
                  </TableCell>
                </TableRow>
              ) : recent.map((r) => {
                const row = r as unknown as { id: string; meal_type: string; scan_type: string; scan_time: string; students?: { full_name: string }; units?: { name: string } };
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.students?.full_name ?? "—"}</TableCell>
                    <TableCell>{row.units?.name ?? "—"}</TableCell>
                    <TableCell className="capitalize">{row.meal_type}</TableCell>
                    <TableCell>{fmtTime(row.scan_time)}</TableCell>
                    <TableCell>
                      <Badge variant={row.scan_type === "biometric" ? "default" : "secondary"} className="capitalize">
                        {row.scan_type === "biometric" ? "Biometric" : "Manual"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
