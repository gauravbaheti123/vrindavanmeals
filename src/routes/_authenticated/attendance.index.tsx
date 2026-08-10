import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, AlertTriangle, Printer, Send, ListRestart } from "lucide-react";
import { StudentPicker, type StudentOption } from "@/components/student-picker";
import { printToken, sendTokenViaWhatsapp, type TokenData } from "@/lib/token-print";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/attendance/")({
  head: () => ({ meta: [{ title: "Attendance — Vrindavan Meals" }] }),
  component: AttendanceCounter,
});

type Screen = { kind: "idle" } | { kind: "success"; token: TokenData } | { kind: "warning"; token: TokenData } | { kind: "error"; message: string };

function AttendanceCounter() {
  const [unitId, setUnitId] = useState<string>("");
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });
  const [manualOpen, setManualOpen] = useState(false);
  const qc = useQueryClient();

  const { data: units } = useQuery({
    queryKey: ["units"],
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });
  useEffect(() => { if (!unitId && units?.[0]) setUnitId(units[0].id); }, [units, unitId]);

  const { data: stats } = useQuery({
    queryKey: ["attendance-stats", unitId],
    enabled: !!unitId,
    refetchInterval: 5000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("attendance").select("meal_type").eq("scan_date", today).eq("unit_id", unitId);
      const lunch = (data ?? []).filter((r) => r.meal_type === "lunch").length;
      const dinner = (data ?? []).filter((r) => r.meal_type === "dinner").length;
      return { lunch, dinner, total: lunch + dinner };
    },
  });

  const { data: feed } = useQuery({
    queryKey: ["attendance-feed", unitId],
    enabled: !!unitId,
    refetchInterval: 5000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("attendance")
        .select("id, meal_type, scan_time, token_number, students(full_name)")
        .eq("scan_date", today).eq("unit_id", unitId)
        .order("scan_time", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  function refetchAll() {
    qc.invalidateQueries({ queryKey: ["attendance-stats"] });
    qc.invalidateQueries({ queryKey: ["attendance-feed"] });
  }

  function handleResult(res: { success: boolean; error?: string; message?: string; token_data?: TokenData }) {
    if (res.success && res.token_data) {
      const token = res.token_data;
      if (token.warning_message) setScreen({ kind: "warning", token });
      else setScreen({ kind: "success", token });
      printToken(token);
      refetchAll();
    } else {
      setScreen({ kind: "error", message: res.message || res.error || "Unknown error" });
    }
    setTimeout(() => setScreen({ kind: "idle" }), 8000);
  }

  const bg = screen.kind === "success" ? "bg-success/20" : screen.kind === "warning" ? "bg-warning/20" : screen.kind === "error" ? "bg-destructive/20" : "bg-card";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Live Counter</h1>
          <p className="text-muted-foreground">Biometric scans stream in from the device.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Unit" /></SelectTrigger>
            <SelectContent>{units?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
          </Select>
          <Sheet open={manualOpen} onOpenChange={setManualOpen}>
            <SheetTrigger asChild><Button variant="outline">Manual Entry</Button></SheetTrigger>
            <ManualEntrySheet unitId={unitId} onDone={(res) => { setManualOpen(false); handleResult(res); }} />
          </Sheet>
          <Button asChild variant="ghost"><Link to="/attendance/reprint"><ListRestart className="h-4 w-4 mr-2" />Reprint Queue</Link></Button>
        </div>
      </div>

      <Card className="p-4 grid grid-cols-3 gap-4 text-center">
        <div><div className="text-xs text-muted-foreground">Lunch today</div><div className="text-3xl font-bold">{stats?.lunch ?? 0}</div></div>
        <div><div className="text-xs text-muted-foreground">Dinner today</div><div className="text-3xl font-bold">{stats?.dinner ?? 0}</div></div>
        <div><div className="text-xs text-muted-foreground">Total</div><div className="text-3xl font-bold text-primary">{stats?.total ?? 0}</div></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={`lg:col-span-2 p-8 min-h-[360px] flex items-center justify-center transition-colors ${bg}`}>
          {screen.kind === "idle" && (
            <div className="text-center text-muted-foreground">
              <div className="text-6xl mb-2">👋</div>
              <div className="text-lg">Waiting for scan…</div>
              <div className="text-xs mt-2">Device posts to <code>/functions/v1/attendance-scan</code></div>
            </div>
          )}
          {(screen.kind === "success" || screen.kind === "warning") && (
            <div className="text-center space-y-2">
              {screen.kind === "success"
                ? <CheckCircle2 className="h-16 w-16 text-success mx-auto" />
                : <AlertTriangle className="h-16 w-16 text-warning-foreground mx-auto" />}
              <div className="text-4xl font-black">{screen.token.token_label}</div>
              <div className="text-2xl font-semibold">{screen.token.student_name}</div>
              <Badge className="uppercase text-base">{screen.token.meal_type}</Badge>
              {screen.kind === "warning" && <div className="text-warning-foreground font-medium">{screen.token.warning_message}</div>}
              <div className="flex gap-2 justify-center pt-2">
                <Button size="sm" variant="outline" onClick={() => printToken(screen.token)}><Printer className="h-4 w-4 mr-1" />Reprint</Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  try { await sendTokenViaWhatsapp(screen.token); toast.success("WhatsApp sent"); }
                  catch (e) { toast.error((e as Error).message); }
                }}><Send className="h-4 w-4 mr-1" />WhatsApp</Button>
              </div>
            </div>
          )}
          {screen.kind === "error" && (
            <div className="text-center space-y-2">
              <XCircle className="h-16 w-16 text-destructive mx-auto" />
              <div className="text-2xl font-bold">{screen.message}</div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="font-semibold mb-2">Last 10 tokens</div>
          <div className="space-y-1 text-sm">
            {(feed ?? []).length === 0 ? <div className="text-muted-foreground text-xs">No tokens yet today.</div> :
              (feed ?? []).map((f) => {
                const r = f as { id: string; meal_type: string; scan_time: string; token_number: number; students?: { full_name: string } };
                return (
                  <div key={r.id} className="flex justify-between border-b py-1">
                    <span className="truncate">{r.students?.full_name}</span>
                    <span className="text-muted-foreground text-xs">#{r.token_number} {r.meal_type}</span>
                  </div>
                );
              })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ManualEntrySheet({ unitId, onDone }: { unitId: string; onDone: (r: { success: boolean; error?: string; message?: string; token_data?: TokenData }) => void }) {
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [reason, setReason] = useState("Biometric Not Recognized");
  const [override, setOverride] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { user } = useCurrentUser();

  async function submit() {
    if (!student || !unitId) return toast.error("Select a student and unit");
    setSaving(true);
    try {
      const now = new Date();
      const scanDate = now.toISOString().slice(0, 10);
      const istTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(now);
      const { data: windows } = await supabase.from("meal_windows").select("meal_type, start_time, end_time").eq("unit_id", unitId);
      const mw = (windows ?? []).find((w) => istTime >= w.start_time && istTime <= w.end_time);
      if (!mw) throw new Error("Outside meal time");
      const meal_type = mw.meal_type;

      // subscription
      const { data: sub } = await supabase.from("subscriptions")
        .select("end_date, grace_end_date, status").eq("student_id", student.id)
        .in("status", ["active", "grace", "pending"]).order("end_date", { ascending: false }).limit(1).maybeSingle();
      if (!sub && !override) throw new Error("No active subscription (use Override to force)");
      if (sub && scanDate > sub.grace_end_date && !override) throw new Error("Subscription expired (use Override to force)");

      // duplicate
      const { data: dup } = await supabase.from("attendance").select("id")
        .eq("student_id", student.id).eq("meal_type", meal_type).eq("scan_date", scanDate).maybeSingle();
      if (dup) throw new Error(`Already marked for ${meal_type} today`);

      // token number
      const { count } = await supabase.from("attendance").select("id", { count: "exact", head: true })
        .eq("unit_id", unitId).eq("meal_type", meal_type).eq("scan_date", scanDate);
      const token_number = (count ?? 0) + 1;

      const { data: unit } = await supabase.from("units").select("name").eq("id", unitId).maybeSingle();
      const unitPrefix = (unit?.name ?? "1").replace(/[^0-9]/g, "") || "1";
      const token_label = `U${unitPrefix}-${meal_type === "lunch" ? "L" : "D"}-${String(token_number).padStart(3, "0")}`;

      const { data: inserted, error } = await supabase.from("attendance").insert({
        student_id: student.id, unit_id: unitId, meal_type, scan_type: "manual",
        scan_time: now.toISOString(), scan_date: scanDate, token_number, token_printed: false,
        is_override: override, override_reason: `${reason}${note ? `: ${note}` : ""}`,
        marked_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;

      // Overdue warning — token still prints normally
      let warning_message: string | undefined;
      try {
        const [{ data: settingsRows }, dueInfo] = await Promise.all([
          supabase.from("system_settings").select("key,value"),
          fetchStudentDue(student.id),
        ]);
        const map = Object.fromEntries((settingsRows ?? []).map((s) => [s.key, s.value]));
        const amtLimit = Number(map["due_amount_threshold"] ?? 3000);
        const dayLimit = Number(map["days_overdue_threshold"] ?? 15);
        if (dueInfo.due_amount >= amtLimit || (dueInfo.due_amount > 0 && dueInfo.days_overdue >= dayLimit)) {
          warning_message = `Payment overdue — ₹${Math.round(dueInfo.due_amount).toLocaleString("en-IN")} pending for ${dueInfo.days_overdue} days`;
        }
      } catch { /* warning is best-effort */ }

      onDone({
        success: true,
        token_data: {
          attendance_id: inserted.id,
          student_name: student.full_name, roll_number: student.roll_number,
          unit: unit?.name ?? "", meal_type, token_number, token_label,
          scan_time: now.toISOString(),
          student_mobile: student.mobile, student_id: student.id,
          warning_message,
        },
      });

    } catch (e) {
      onDone({ success: false, message: (e as Error).message });
    } finally { setSaving(false); }
  }

  return (
    <SheetContent className="w-[420px] sm:max-w-md">
      <SheetHeader><SheetTitle>Manual Entry</SheetTitle></SheetHeader>
      <div className="space-y-4 mt-4">
        <div className="space-y-2"><Label>Student</Label><StudentPicker value={student} onChange={setStudent} /></div>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Machine Down">Machine Down</SelectItem>
              <SelectItem value="Biometric Not Recognized">Biometric Not Recognized</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Note (optional)</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={override} onCheckedChange={(v) => setOverride(!!v)} />
          Override (ignore subscription checks)
        </label>
        <Button onClick={submit} disabled={saving || !student} className="w-full">
          {saving ? "Saving…" : "Confirm & Print Token"}
        </Button>
      </div>
    </SheetContent>
  );
}
