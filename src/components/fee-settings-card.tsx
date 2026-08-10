import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { fetchFeeSlabs, formatMonth, prevMonthKey, MONTH_NAMES, type FeeSlab } from "@/lib/fees";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function FeeSettingsCard() {
  const qc = useQueryClient();
  const { data: slabs } = useQuery({ queryKey: ["fee-settings"], queryFn: fetchFeeSlabs });
  const [open, setOpen] = useState(false);
  const [editSlab, setEditSlab] = useState<FeeSlab | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["fee-settings"] });

  async function removeSlab(s: FeeSlab) {
    const { error } = await supabase.from("fee_settings").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    await logAudit({
      action: "delete", entity: "fee_slab", entityId: s.id,
      label: `${inr(Number(s.monthly_fee))} from ${formatMonth(s.effective_month)}`,
      oldValues: { monthly_fee: s.monthly_fee, effective_month: s.effective_month, effective_to_month: s.effective_to_month },
    });
    // If the deleted slab was the ongoing one, re-open the most recent earlier slab.
    const rest = (slabs ?? []).filter((x) => x.id !== s.id);
    if (s.effective_to_month === null && rest.length > 0) {
      const prev = rest.slice().sort((a, b) => (a.effective_month > b.effective_month ? -1 : 1))[0];
      await supabase.from("fee_settings").update({ effective_to_month: null, is_active: true }).eq("id", prev.id);
    }
    toast.success("Fee slab deleted");
    refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Fee Settings</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Month-wise monthly fee slabs. A new slab automatically closes the previous one.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Add New Fee Slab</Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Monthly Fee</TableHead>
              <TableHead>From Month</TableHead>
              <TableHead>To Month</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(slabs ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No fee slabs configured.</TableCell></TableRow>
            ) : (slabs ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-semibold">{inr(Number(s.monthly_fee))}</TableCell>
                <TableCell>{formatMonth(s.effective_month)}</TableCell>
                <TableCell>{s.effective_to_month ? formatMonth(s.effective_to_month) : "Ongoing"}</TableCell>
                <TableCell>
                  {s.is_active ? <Badge className="bg-success text-success-foreground">Active</Badge> : <Badge variant="secondary">Ended</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditSlab(s)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this fee slab?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {inr(Number(s.monthly_fee))} from {formatMonth(s.effective_month)} will be removed.
                            Months covered by this slab will fall back to the previous slab — re-run “Rebuild All Billing” afterwards.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeSlab(s)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {open && (
        <AddSlabModal
          slabs={slabs ?? []}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); refresh(); }}
        />
      )}
      {editSlab && (
        <EditSlabModal
          slab={editSlab}
          onClose={() => setEditSlab(null)}
          onSaved={() => { setEditSlab(null); refresh(); }}
        />
      )}
    </Card>
  );
}

function EditSlabModal({ slab, onClose, onSaved }: { slab: FeeSlab; onClose: () => void; onSaved: () => void }) {
  const [fee, setFee] = useState(String(Number(slab.monthly_fee)));
  const [saving, setSaving] = useState(false);

  async function save() {
    const amount = Number(fee);
    if (!amount || amount <= 0) return toast.error("Monthly fee must be a positive number");
    setSaving(true);
    const { error } = await supabase.from("fee_settings").update({ monthly_fee: amount }).eq("id", slab.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    await logAudit({
      action: "update", entity: "fee_slab", entityId: slab.id,
      label: `Fee slab from ${formatMonth(slab.effective_month)}`,
      oldValues: { monthly_fee: Number(slab.monthly_fee) }, newValues: { monthly_fee: amount },
    });
    toast.success("Fee slab updated — re-run Rebuild All Billing to apply");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit Fee Slab — {formatMonth(slab.effective_month)}</DialogTitle></DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">Monthly Fee (₹)</Label>
          <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
          <p className="text-xs text-muted-foreground pt-1">
            Period stays {formatMonth(slab.effective_month)} → {slab.effective_to_month ? formatMonth(slab.effective_to_month) : "Ongoing"}.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function AddSlabModal({ slabs, onClose, onSaved }: { slabs: FeeSlab[]; onClose: () => void; onSaved: () => void }) {
  const now = new Date();
  const [fee, setFee] = useState("");
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [saving, setSaving] = useState(false);

  const years = Array.from({ length: 9 }, (_, i) => now.getFullYear() - 2 + i);
  const current = slabs.find((s) => s.is_active) ?? null;

  async function save() {
    const amount = Number(fee);
    if (!amount || amount <= 0) return toast.error("Monthly fee must be a positive number");
    const from = `${year}-${String(Number(month)).padStart(2, "0")}-01`;
    if (current && from <= current.effective_month) {
      return toast.error(`From Month must be after ${formatMonth(current.effective_month)}`);
    }
    if (slabs.some((s) => s.effective_month === from)) {
      return toast.error("A fee slab already exists for that month");
    }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (current) {
        const { error } = await supabase
          .from("fee_settings")
          .update({ effective_to_month: prevMonthKey(from), is_active: false })
          .eq("id", current.id);
        if (error) throw new Error(error.message);
      }
      const { error: insErr } = await supabase.from("fee_settings").insert({
        monthly_fee: amount,
        effective_month: from,
        effective_to_month: null,
        is_active: true,
        created_by: userRes.user?.id ?? null,
      });
      if (insErr) throw new Error(insErr.message);
      await logAudit({
        action: "create", entity: "fee_slab",
        label: `${inr(amount)} from ${formatMonth(from)}`,
        newValues: { monthly_fee: amount, effective_month: from },
      });
      toast.success(`Fee slab added — ${inr(amount)} from ${formatMonth(from)}`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save fee slab");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add New Fee Slab</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Monthly Fee (₹)</Label>
            <Input type="number" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="2700" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {current && (
            <p className="text-xs text-muted-foreground">
              Current slab {inr(Number(current.monthly_fee))} from {formatMonth(current.effective_month)} will be closed automatically.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Slab"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
