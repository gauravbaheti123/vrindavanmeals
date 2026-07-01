import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Send } from "lucide-react";
import { exportPdf, exportExcel } from "@/lib/report-export";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Vrindavan Meals" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [unit, setUnit] = useState("all");
  const { data: units } = useQuery({
    queryKey: ["units"],
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Filter, export, and share operational reports.</p>
      </div>
      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div><div className="text-xs mb-1">From</div><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><div className="text-xs mb-1">To</div><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
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

      <Tabs defaultValue="attendance">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="attendance">Daily Attendance</TabsTrigger>
          <TabsTrigger value="revenue">Monthly Revenue</TabsTrigger>
          <TabsTrigger value="expiring">Expiring Subs</TabsTrigger>
          <TabsTrigger value="noshow">No-Show</TabsTrigger>
          <TabsTrigger value="manual">Manual Log</TabsTrigger>
          <TabsTrigger value="reprint">Reprint Log</TabsTrigger>
          <TabsTrigger value="unmapped">Unmapped Scans</TabsTrigger>
        </TabsList>
        <TabsContent value="attendance"><AttendanceReport date={to} unit={unit} /></TabsContent>
        <TabsContent value="revenue"><RevenueReport from={from} to={to} unit={unit} /></TabsContent>
        <TabsContent value="expiring"><ExpiringReport unit={unit} /></TabsContent>
        <TabsContent value="noshow"><NoShowReport from={from} to={to} unit={unit} /></TabsContent>
        <TabsContent value="manual"><ManualLog from={from} to={to} unit={unit} /></TabsContent>
        <TabsContent value="reprint"><ReprintLog from={from} to={to} /></TabsContent>
        <TabsContent value="unmapped"><UnmappedLog from={from} to={to} unit={unit} /></TabsContent>
      </Tabs>
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

function AttendanceReport({ date, unit }: { date: string; unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-attendance", date, unit],
    queryFn: async () => {
      let q = supabase.from("attendance")
        .select("token_number, meal_type, scan_time, scan_type, is_override, students(full_name, roll_number), units(name)")
        .eq("scan_date", date).order("scan_time");
      if (unit !== "all") q = q.eq("unit_id", unit);
      return (await q).data ?? [];
    },
  });
  const rows = (data ?? []).map((r) => {
    const x = r as { token_number: number; meal_type: string; scan_time: string; scan_type: string; is_override: boolean; students?: { full_name: string; roll_number: string | null }; units?: { name: string } };
    return [x.token_number, x.students?.full_name ?? "", x.students?.roll_number ?? "", x.units?.name ?? "",
      x.meal_type, new Date(x.scan_time).toLocaleTimeString("en-IN"), x.scan_type, x.is_override ? "Yes" : "No"];
  });
  const cols = ["Token", "Student", "Roll", "Unit", "Meal", "Time", "Type", "Override"];
  const lunch = (data ?? []).filter((r) => r.meal_type === "lunch").length;
  const dinner = (data ?? []).filter((r) => r.meal_type === "dinner").length;
  const manual = (data ?? []).filter((r) => r.scan_type === "manual").length;
  const overrides = (data ?? []).filter((r) => r.is_override).length;
  return (
    <div className="space-y-3 mt-4">
      <div className="grid grid-cols-4 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Lunch</div><div className="text-xl font-bold">{lunch}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Dinner</div><div className="text-xl font-bold">{dinner}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Manual</div><div className="text-xl font-bold">{manual}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Overrides</div><div className="text-xl font-bold">{overrides}</div></Card>
      </div>
      <ExportBar
        onPdf={() => exportPdf({ title: "Daily Attendance", subtitle: `Date: ${date}`, columns: cols, rows, filename: `attendance-${date}` })}
        onExcel={() => exportExcel({ title: "Attendance", columns: cols, rows, filename: `attendance-${date}` })}
      />
      <Card><Table>
        <TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.length === 0
            ? <TableRow><TableCell colSpan={cols.length} className="text-center py-8 text-muted-foreground">No data.</TableCell></TableRow>
            : rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}
        </TableBody>
      </Table></Card>
    </div>
  );
}

function RevenueReport({ from, to, unit }: { from: string; to: string; unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-revenue", from, to, unit],
    queryFn: async () => {
      let q = supabase.from("payments")
        .select("amount, mode, status, created_at, subscriptions(unit_id), students(full_name)")
        .eq("status", "success")
        .gte("created_at", from + "T00:00:00").lte("created_at", to + "T23:59:59")
        .order("created_at", { ascending: false });
      const { data } = await q;
      let rows = data ?? [];
      if (unit !== "all") {
        rows = rows.filter((r) => {
          const sub = (r as { subscriptions?: { unit_id: string } }).subscriptions;
          return sub?.unit_id === unit;
        });
      }
      return rows;
    },
  });
  const totals = useMemo(() => {
    const acc = { total: 0, cash: 0, upi: 0, card: 0, razorpay: 0 } as Record<string, number>;
    (data ?? []).forEach((r) => {
      const amt = Number(r.amount) || 0;
      acc.total += amt;
      if (acc[r.mode] !== undefined) acc[r.mode] += amt;
    });
    return acc as { total: number; cash: number; upi: number; card: number; razorpay: number };
  }, [data]);
  const cols = ["Date", "Student", "Amount", "Mode"];
  const rows = (data ?? []).map((r) => {
    const x = r as { created_at: string; amount: number; mode: string; students?: { full_name: string } };
    return [new Date(x.created_at).toLocaleDateString("en-IN"), x.students?.full_name ?? "", `₹${Number(x.amount).toLocaleString("en-IN")}`, x.mode];
  });
  return (
    <div className="space-y-3 mt-4">
      <div className="grid grid-cols-5 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Total</div><div className="text-xl font-bold text-primary">₹{totals.total.toLocaleString("en-IN")}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Cash</div><div className="text-lg">₹{totals.cash.toLocaleString("en-IN")}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">UPI</div><div className="text-lg">₹{totals.upi.toLocaleString("en-IN")}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Card</div><div className="text-lg">₹{totals.card.toLocaleString("en-IN")}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Razorpay</div><div className="text-lg">₹{totals.razorpay.toLocaleString("en-IN")}</div></Card>
      </div>
      <ExportBar
        onPdf={() => exportPdf({ title: "Revenue", subtitle: `${from} → ${to}`, columns: cols, rows, filename: `revenue-${from}_${to}` })}
        onExcel={() => exportExcel({ title: "Revenue", columns: cols, rows, filename: `revenue-${from}_${to}` })}
      />
      <Card><Table>
        <TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 ? <TableRow><TableCell colSpan={cols.length} className="text-center py-8 text-muted-foreground">No payments in range.</TableCell></TableRow>
            : rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}
        </TableBody>
      </Table></Card>
    </div>
  );
}

async function sendReminder(student_id: string, mobile: string, params: string[]) {
  const { error } = await supabase.functions.invoke("send-whatsapp", {
    body: { phone: mobile, template_name: "subscription_expiry_warning", student_id, params },
  });
  if (error) toast.error(error.message); else toast.success("Reminder queued");
}

function ExpiringReport({ unit }: { unit: string }) {
  const [days, setDays] = useState(5);
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const { data } = useQuery({
    queryKey: ["rpt-expiring", days, unit],
    queryFn: async () => {
      let q = supabase.from("subscriptions")
        .select("id, end_date, grace_end_date, status, unit_id, students(id, full_name, mobile), units(name)")
        .gte("end_date", today).lte("end_date", future).order("end_date");
      if (unit !== "all") q = q.eq("unit_id", unit);
      return (await q).data ?? [];
    },
  });
  const cols = ["Student", "Mobile", "Unit", "End Date", "Grace End", "Days Left"];
  const rows = (data ?? []).map((r) => {
    const x = r as { end_date: string; grace_end_date: string; students?: { full_name: string; mobile: string }; units?: { name: string } };
    const daysLeft = Math.ceil((new Date(x.end_date).getTime() - Date.now()) / 86400000);
    return [x.students?.full_name ?? "", x.students?.mobile ?? "", x.units?.name ?? "", x.end_date, x.grace_end_date, daysLeft];
  });
  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center gap-3">
        <div className="text-sm">Expiring in next</div>
        <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-20" />
        <div className="text-sm">days</div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={async () => {
          for (const r of data ?? []) {
            const x = r as { students?: { id: string; full_name: string; mobile: string }; end_date: string };
            if (x.students?.mobile) await sendReminder(x.students.id, x.students.mobile, [x.students.full_name, x.end_date, "3000"]);
          }
        }}><Send className="h-4 w-4 mr-1" />Send all reminders</Button>
      </div>
      <ExportBar
        onPdf={() => exportPdf({ title: "Expiring Subscriptions", columns: cols, rows, filename: `expiring-${today}` })}
        onExcel={() => exportExcel({ title: "Expiring", columns: cols, rows, filename: `expiring-${today}` })}
      />
      <Card><Table>
        <TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}<TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {(data ?? []).length === 0
            ? <TableRow><TableCell colSpan={cols.length + 1} className="text-center py-8 text-muted-foreground">No expiring subscriptions.</TableCell></TableRow>
            : (data ?? []).map((r, i) => {
              const x = r as { students?: { id: string; full_name: string; mobile: string }; end_date: string };
              return (
                <TableRow key={i}>{rows[i].map((c, j) => <TableCell key={j}>{c}</TableCell>)}
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => x.students?.mobile && sendReminder(x.students.id, x.students.mobile, [x.students.full_name, x.end_date, "3000"])}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table></Card>
    </div>
  );
}

function NoShowReport({ from, to, unit }: { from: string; to: string; unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-noshow", from, to, unit],
    queryFn: async () => {
      let sq = supabase.from("subscriptions")
        .select("student_id, unit_id, status, students(id, full_name, mobile), units(name)")
        .in("status", ["active", "grace"]);
      if (unit !== "all") sq = sq.eq("unit_id", unit);
      const subs = (await sq).data ?? [];
      const { data: att } = await supabase.from("attendance")
        .select("student_id").gte("scan_date", from).lte("scan_date", to);
      const attended = new Set((att ?? []).map((a) => a.student_id));
      return subs.filter((s) => !attended.has(s.student_id));
    },
  });
  const cols = ["Student", "Mobile", "Unit", "Subscription"];
  const rows = (data ?? []).map((r) => {
    const x = r as { status: string; students?: { full_name: string; mobile: string }; units?: { name: string } };
    return [x.students?.full_name ?? "", x.students?.mobile ?? "", x.units?.name ?? "", x.status];
  });
  return (
    <div className="space-y-3 mt-4">
      <ExportBar
        onPdf={() => exportPdf({ title: "No-Show Students", subtitle: `${from} → ${to}`, columns: cols, rows, filename: `noshow-${from}_${to}` })}
        onExcel={() => exportExcel({ title: "No-Show", columns: cols, rows, filename: `noshow-${from}_${to}` })}
      />
      <Card><Table>
        <TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 ? <TableRow><TableCell colSpan={cols.length} className="text-center py-8 text-muted-foreground">No no-shows.</TableCell></TableRow>
            : rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}
        </TableBody>
      </Table></Card>
    </div>
  );
}

function ManualLog({ from, to, unit }: { from: string; to: string; unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-manual", from, to, unit],
    queryFn: async () => {
      let q = supabase.from("attendance")
        .select("scan_date, meal_type, override_reason, is_override, students(full_name), units(name)")
        .eq("scan_type", "manual").gte("scan_date", from).lte("scan_date", to).order("scan_date", { ascending: false });
      if (unit !== "all") q = q.eq("unit_id", unit);
      return (await q).data ?? [];
    },
  });
  const cols = ["Date", "Student", "Unit", "Meal", "Reason", "Override"];
  const rows = (data ?? []).map((r) => {
    const x = r as unknown as { scan_date: string; meal_type: string; override_reason: string | null; is_override: boolean; students?: { full_name: string }; units?: { name: string } };
    return [x.scan_date, x.students?.full_name ?? "", x.units?.name ?? "", x.meal_type, x.override_reason ?? "", x.is_override ? "Yes" : "No"];
  });
  return (
    <div className="space-y-3 mt-4">
      <ExportBar
        onPdf={() => exportPdf({ title: "Manual Entry Log", columns: cols, rows, filename: `manual-${from}_${to}` })}
        onExcel={() => exportExcel({ title: "Manual", columns: cols, rows, filename: `manual-${from}_${to}` })}
      />
      <Card><Table>
        <TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 ? <TableRow><TableCell colSpan={cols.length} className="text-center py-8 text-muted-foreground">No manual entries.</TableCell></TableRow>
            : rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}
        </TableBody>
      </Table></Card>
    </div>
  );
}

function ReprintLog({ from, to }: { from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-reprint", from, to],
    queryFn: async () => (await supabase.from("token_reprints")
      .select("created_at, reason, attendance:attendance_id(scan_date, meal_type, token_number, students(full_name), units(name))")
      .gte("created_at", from + "T00:00:00").lte("created_at", to + "T23:59:59")
      .order("created_at", { ascending: false })).data ?? [],
  });
  const cols = ["Reprint Time", "Student", "Unit", "Meal", "Token", "Reason"];
  const rows = (data ?? []).map((r) => {
    const x = r as unknown as { created_at: string; reason: string | null; attendance?: { meal_type: string; token_number: number; students?: { full_name: string }; units?: { name: string } } };
    return [new Date(x.created_at).toLocaleString("en-IN"), x.attendance?.students?.full_name ?? "", x.attendance?.units?.name ?? "",
      x.attendance?.meal_type ?? "", x.attendance?.token_number ?? "", x.reason ?? ""];
  });
  return (
    <div className="space-y-3 mt-4">
      <ExportBar
        onPdf={() => exportPdf({ title: "Reprint Log", columns: cols, rows, filename: `reprint-${from}_${to}` })}
        onExcel={() => exportExcel({ title: "Reprint", columns: cols, rows, filename: `reprint-${from}_${to}` })}
      />
      <Card><Table>
        <TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 ? <TableRow><TableCell colSpan={cols.length} className="text-center py-8 text-muted-foreground">No reprints.</TableCell></TableRow>
            : rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}
        </TableBody>
      </Table></Card>
    </div>
  );
}

function UnmappedLog({ from, to, unit }: { from: string; to: string; unit: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-unmapped", from, to, unit],
    queryFn: async () => {
      let q = supabase.from("unmapped_scans")
        .select("device_user_id, scan_time, resolved, units(name)")
        .gte("scan_time", from + "T00:00:00").lte("scan_time", to + "T23:59:59")
        .order("scan_time", { ascending: false });
      if (unit !== "all") q = q.eq("unit_id", unit);
      return (await q).data ?? [];
    },
  });
  const cols = ["Device ID", "Unit", "Scan Time", "Resolved"];
  const rows = (data ?? []).map((r) => {
    const x = r as { device_user_id: string; scan_time: string; resolved: boolean; units?: { name: string } };
    return [x.device_user_id, x.units?.name ?? "", new Date(x.scan_time).toLocaleString("en-IN"), x.resolved ? "Yes" : "No"];
  });
  return (
    <div className="space-y-3 mt-4">
      <ExportBar
        onPdf={() => exportPdf({ title: "Unmapped Scans", columns: cols, rows, filename: `unmapped-${from}_${to}` })}
        onExcel={() => exportExcel({ title: "Unmapped", columns: cols, rows, filename: `unmapped-${from}_${to}` })}
      />
      <Card><Table>
        <TableHeader><TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 ? <TableRow><TableCell colSpan={cols.length} className="text-center py-8 text-muted-foreground">No unmapped scans.</TableCell></TableRow>
            : rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{typeof c === "boolean" ? String(c) : c}</TableCell>)}</TableRow>)}
        </TableBody>
      </Table></Card>
    </div>
  );
}

void Badge;
