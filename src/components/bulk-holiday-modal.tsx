import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE } from "@/lib/query-cache";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { computeHolidayDeduction, fetchFeeSlabs, formatDMY, formatMonth, missingSlabMessage } from "@/lib/fees";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";

export type BulkHolidayStudent = {
  student_id: string;
  full_name: string;
  roll_number: string | null;
  unit_name: string | null;
  status: string;
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const BATCH = 100;

export function BulkHolidayModal({
  students, onClose, onSaved,
}: {
  students: BulkHolidayStudent[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  const [remarks, setRemarks] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);

  const { data: slabs } = useQuery({
    queryKey: ["fee-slabs"],
    staleTime: STALE.MASTER,
    queryFn: fetchFeeSlabs,
  });

  const valid = Boolean(fromDate && toDate && toDate >= fromDate);
  const calc = useMemo(
    () => (valid ? computeHolidayDeduction(slabs ?? [], fromDate, toDate) : null),
    [valid, slabs, fromDate, toDate],
  );

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return students;
    return students.filter(
      (r) => r.full_name.toLowerCase().includes(s) || (r.roll_number ?? "").toLowerCase().includes(s),
    );
  }, [students, q]);

  const selectedCount = selected.size;
  const totalCredit = (calc?.amount ?? 0) * selectedCount;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(visible.map((r) => r.student_id)));
  }
  function selectAllActive() {
    setSelected(new Set(visible.filter((r) => r.status !== "inactive").map((r) => r.student_id)));
  }

  async function apply() {
    if (!valid) return toast.error("To Date must be on or after From Date");
    if (!calc || calc.missingMonths.length > 0) {
      return toast.error(missingSlabMessage(calc?.missingMonths[0] ?? fromDate));
    }
    if (calc.amount <= 0) return toast.error("Deduction works out to ₹0 — check the fee slab");
    if (selectedCount === 0) return toast.error("Select at least one student");

    setRunning(true);
    setDone(0);
    const ids = [...selected];
    const { data: userRes } = await supabase.auth.getUser();
    const createdBy = userRes.user?.id ?? null;
    let failed = 0;

    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const rows = chunk.map((student_id) => ({
          student_id,
          created_by: createdBy,
          amount: -calc.amount,
          entry_date: fromDate,
          from_date: fromDate,
          to_date: toDate,
          kind: "holiday",
          remarks: remarks.trim() || null,
        }));
        const { error } = await supabase.from("ledger_adjustments").insert(rows);
        if (error) failed += chunk.length;
        setDone(Math.min(i + chunk.length, ids.length));
      }

      const applied = ids.length - failed;
      await logAudit({
        action: "create",
        entity: "holiday",
        label: `Bulk holiday ${formatDMY(fromDate)} → ${formatDMY(toDate)} (${calc.days} days) for ${applied} students`,
        newValues: {
          students: applied,
          per_student_credit: calc.amount,
          total_credit: calc.amount * applied,
          from_date: fromDate,
          to_date: toDate,
          remarks: remarks.trim() || null,
        },
      });

      if (failed > 0) toast.error(`${applied} applied, ${failed} failed`);
      else toast.success(`Holiday credit of ${inr(calc.amount)} applied to ${applied} students`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk holiday failed");
    } finally {
      setRunning(false);
    }
  }

  const pct = selectedCount ? Math.round((done / selectedCount) * 100) : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Holiday / Leave</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <DateInput value={fromDate} onChange={setFromDate} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <DateInput value={toDate} onChange={setToDate} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Remarks (optional)</Label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Diwali closure" />
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            {!valid ? (
              <p className="text-destructive">To Date must be on or after From Date.</p>
            ) : calc && calc.missingMonths.length > 0 ? (
              <p className="text-destructive">{missingSlabMessage(calc.missingMonths[0])}</p>
            ) : calc ? (
              <>
                {calc.segments.map((seg) => (
                  <div key={seg.month} className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {formatMonth(seg.month)} — {seg.days} day{seg.days === 1 ? "" : "s"} × {inr(seg.monthlyFee)}/{seg.daysInMonth}
                    </span>
                    <span>−{inr(seg.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold pt-1 border-t">
                  <span>
                    {calc.days} day{calc.days === 1 ? "" : "s"} × {selectedCount} student{selectedCount === 1 ? "" : "s"}
                  </span>
                  <span className="text-success">−{inr(totalCredit)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This will apply a Holiday Deduction of {inr(calc.amount)} each to {selectedCount} student
                  {selectedCount === 1 ? "" : "s"}, totalling {inr(totalCredit)} in credits.
                </p>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs">Search students (current list filters apply)</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or Mess No" />
            </div>
            <Button type="button" size="sm" variant="outline" onClick={selectAllActive}>Select All Active</Button>
            <Button type="button" size="sm" variant="outline" onClick={selectAllVisible}>Select All Shown</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>

          <div className="max-h-[240px] overflow-y-auto rounded-md border divide-y">
            {visible.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No students match.</p>
            ) : visible.map((r) => (
              <label key={r.student_id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                <Checkbox checked={selected.has(r.student_id)} onCheckedChange={() => toggle(r.student_id)} />
                <span className="font-mono text-xs w-20 shrink-0">{r.roll_number || "—"}</span>
                <span className="flex-1 truncate">{r.full_name}</span>
                <span className="text-xs text-muted-foreground">{r.unit_name || "—"}</span>
                <span className="text-xs capitalize text-muted-foreground w-16 text-right">{r.status}</span>
              </label>
            ))}
          </div>

          {running && (
            <div className="space-y-1">
              <Progress value={pct} />
              <p className="text-xs text-muted-foreground">Applying {done} / {selectedCount}…</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>Cancel</Button>
          <Button onClick={apply} disabled={running || !valid || selectedCount === 0}>
            {running ? "Applying…" : `Apply to ${selectedCount} student${selectedCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
