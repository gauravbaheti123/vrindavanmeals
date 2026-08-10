import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Save, RefreshCcw, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { startRebuild, rebuildBillingBatch, rebuildSamples, accrueMonthlyBilling, type RebuildSummary } from "@/lib/billing.functions";

const BATCH_SIZE = 25;

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function BillingEngineCard() {
  const qc = useQueryClient();
  const runStart = useServerFn(startRebuild);
  const runBatch = useServerFn(rebuildBillingBatch);
  const runSamples = useServerFn(rebuildSamples);
  const runAccrue = useServerFn(accrueMonthlyBilling);
  const [busy, setBusy] = useState<"" | "rebuild" | "accrue">("");
  const [summary, setSummary] = useState<RebuildSummary | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const [amount, setAmount] = useState<string | null>(null);
  const [days, setDays] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["due-thresholds"],
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key,value");
      const map = Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
      return {
        amount: map["due_amount_threshold"] ?? "3000",
        days: map["days_overdue_threshold"] ?? "15",
      };
    },
  });

  const amountValue = amount ?? settings?.amount ?? "3000";
  const daysValue = days ?? settings?.days ?? "15";

  async function saveThresholds() {
    const { error } = await supabase.from("system_settings").upsert(
      [
        { key: "due_amount_threshold", value: String(Number(amountValue) || 0) },
        { key: "days_overdue_threshold", value: String(Number(daysValue) || 0) },
      ],
      { onConflict: "key" },
    );
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["due-thresholds"] });
    toast.success("Warning thresholds saved");
  }

  async function doRebuild() {
    if (!confirm("Recalculate month-by-month billing for every student from their joining date? Payments and adjustments are not touched.")) return;
    setBusy("rebuild");
    setFailure(null);
    setSummary(null);
    let done = 0, before = 0, after = 0, total = 0;
    try {
      const started = await runStart({} as never);
      total = started.total;
      setProgress({ done: 0, total });
      while (done < total) {
        const res = await runBatch({ data: { offset: done, limit: BATCH_SIZE } });
        if (res.processed === 0) break;
        done += res.processed;
        before += res.before;
        after += res.after;
        setProgress({ done, total });
      }
      const samples = await runSamples({} as never);
      setSummary({ students_processed: done, before_total: before, after_total: after, samples });
      qc.invalidateQueries();
      toast.success(`Recalculated billing for ${done} students. Total billed ${inr(before)} → ${inr(after)}`);
    } catch (e) {
      const msg = (e as Error).message || "Rebuild failed";
      setFailure(`Stopped after ${done} of ${total || "?"} students: ${msg}. Progress so far is saved — you can safely run it again.`);
      qc.invalidateQueries();
      toast.error(`Rebuild failed after ${done} students: ${msg}`);
    } finally { setBusy(""); }
  }

  async function doAccrue() {
    setBusy("accrue");
    try {
      const res = await runAccrue({} as never);
      qc.invalidateQueries();
      toast.success(res.created > 0 ? `Added ${res.created} monthly charges` : "All students are already billed up to date");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(""); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Billing Engine & Due Warnings</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3 items-end">
          <div className="space-y-2">
            <Label>Due Amount Threshold (₹)</Label>
            <Input type="number" value={amountValue} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Days Overdue Threshold</Label>
            <Input type="number" value={daysValue} onChange={(e) => setDays(e.target.value)} />
          </div>
          <Button onClick={saveThresholds}><Save className="h-4 w-4 mr-2" />Save Thresholds</Button>
        </div>
        <p className="text-xs text-muted-foreground -mt-3">
          Attendance counter shows an overdue warning when a student crosses either threshold. Tokens still print.
        </p>

        <div className="border-t pt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={doAccrue} disabled={busy !== ""}>
              <CalendarPlus className="h-4 w-4 mr-2" />{busy === "accrue" ? "Running…" : "Accrue Missing Months"}
            </Button>
            <Button variant="destructive" onClick={doRebuild} disabled={busy !== ""}>
              <RefreshCcw className="h-4 w-4 mr-2" />{busy === "rebuild" ? "Rebuilding…" : "Rebuild All Billing"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Active students are charged a full month on the 1st of every month. Joining and exit months use the 15th-pivot rule
            (1–15 = full month, 16–end = half month). Payments only reduce the due — they never create billing.
          </p>

          {busy === "rebuild" && progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Rebuilding billing…</span>
                <span className="font-mono">{progress.done} / {progress.total}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}

          {failure && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {failure}
            </div>
          )}

          {summary && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-2">
              <div className="font-semibold">
                {summary.students_processed} students · Billed {inr(summary.before_total)} → {inr(summary.after_total)}
              </div>
              <div className="space-y-1 max-h-56 overflow-auto">
                {summary.samples.slice(0, 20).map((s, i) => (
                  <div key={i} className="flex justify-between gap-2 text-xs">
                    <span className="truncate">{s.roll_number ?? "—"} · {s.full_name}</span>
                    <span className="font-mono">{inr(s.before)} → {inr(s.after)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
