import { createFileRoute, Link } from "@tanstack/react-router";
import { STALE } from "@/lib/query-cache";
import { useEffect, useState } from "react";
import { useHydratedState } from "@/hooks/use-hydrated-state";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Save, Plus, ArrowLeft, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, roleFlags } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/pos-masters")({
  head: () => ({ meta: [{ title: "POS Masters — Vrindavan Meals" }] }),
  component: PosMastersPage,
});

interface PosCategory { id: string; name: string; sort_order: number; is_active: boolean }
interface PosItem { id: string; name: string; category_id: string | null; price: number; is_active: boolean }
interface PosPayMode { id: string; label: string; is_active: boolean; sort_order: number }

function PosMastersPage() {
  const { roles } = useCurrentUser();
  const flags = roleFlags(roles);

  const qc = useQueryClient();

  const { data: cats = [] } = useQuery({
    queryKey: ["settings-pos-cats"],
    staleTime: STALE.MASTER,
    queryFn: async () => ((await supabase.from("pos_categories").select("*").order("sort_order")).data ?? []) as unknown as PosCategory[],
  });
  const { data: items = [] } = useQuery({
    queryKey: ["settings-pos-items"],
    staleTime: STALE.MASTER,
    queryFn: async () => ((await supabase.from("pos_items").select("*").order("name")).data ?? []) as unknown as PosItem[],
  });
  const { data: modes = [] } = useQuery({
    queryKey: ["settings-pos-modes"],
    staleTime: STALE.MASTER,
    queryFn: async () => ((await supabase.from("pos_payment_modes").select("*").order("sort_order")).data ?? []) as unknown as PosPayMode[],
  });
  const { data: settings } = useQuery({
    queryKey: ["system-settings"],
    staleTime: STALE.MASTER,
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key,value");
      return Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
    },
  });

  const { value: tax, set: setTax, hydrate: hydrateTax, resetDirty: resetTax } = useHydratedState("");
  // Seeds only while untouched, so a tab-switch refetch can't wipe an edited rate.
  useEffect(() => { if (settings) hydrateTax(settings.pos_tax_rate ?? "0"); }, [settings, hydrateTax]);

  const [newCat, setNewCat] = useState("");
  const [newItem, setNewItem] = useState({ name: "", category_id: "", price: "" });
  const [newMode, setNewMode] = useState("");

  // Inline edit state
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editModeId, setEditModeId] = useState<string | null>(null);
  const [editModeLabel, setEditModeLabel] = useState("");
  const [editItem, setEditItem] = useState<PosItem | null>(null);

  // Delete confirmation state
  const [confirmDel, setConfirmDel] = useState<
    | { kind: "cat"; id: string; label: string }
    | { kind: "item"; id: string; label: string }
    | { kind: "mode"; id: string; label: string }
    | null
  >(null);

  async function saveTax() {
    const { error } = await supabase.from("system_settings").upsert({ key: "pos_tax_rate", value: tax }, { onConflict: "key" });
    if (error) return toast.error(error.message);
    toast.success("Tax rate saved");
    resetTax();
    qc.invalidateQueries({ queryKey: ["system-settings"] });

  }

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["settings-pos-cats"] });
    qc.invalidateQueries({ queryKey: ["settings-pos-items"] });
    qc.invalidateQueries({ queryKey: ["settings-pos-modes"] });
    qc.invalidateQueries({ queryKey: ["pos-cats"] });
    qc.invalidateQueries({ queryKey: ["pos-items"] });
    qc.invalidateQueries({ queryKey: ["pos-modes"] });
  }

  // ---------- Categories ----------
  async function addCat() {
    if (!newCat.trim()) return;
    const { error } = await supabase.from("pos_categories").insert({ name: newCat.trim(), sort_order: cats.length + 1 });
    if (error) return toast.error(error.message);
    setNewCat(""); toast.success("Category added"); invalidateAll();
  }
  async function toggleCat(c: PosCategory) {
    const { error } = await supabase.from("pos_categories").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) return toast.error(error.message);
    invalidateAll();
  }
  async function saveCatName(c: PosCategory) {
    const name = editCatName.trim();
    if (!name) return toast.error("Name required");
    const { error } = await supabase.from("pos_categories").update({ name }).eq("id", c.id);
    if (error) return toast.error(error.message);
    setEditCatId(null); toast.success("Category updated"); invalidateAll();
  }
  async function deleteCat(id: string) {
    // Block if any item references this category (past sales would rely on those items)
    const { count } = await supabase.from("pos_items").select("id", { count: "exact", head: true }).eq("category_id", id);
    if ((count ?? 0) > 0) {
      toast.error("Is category ke items pehle se maujood hain, delete nahi kar sakte — Deactivate karo.");
      return;
    }
    const { error } = await supabase.from("pos_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Category deleted"); invalidateAll();
  }

  // ---------- Items ----------
  async function addItem() {
    if (!newItem.name.trim() || !newItem.price) return toast.error("Name and price required");
    const { error } = await supabase.from("pos_items").insert({
      name: newItem.name.trim(),
      category_id: newItem.category_id || null,
      price: Number(newItem.price),
    });
    if (error) return toast.error(error.message);
    setNewItem({ name: "", category_id: "", price: "" });
    toast.success("Item added"); invalidateAll();
  }
  async function toggleItem(i: PosItem) {
    const { error } = await supabase.from("pos_items").update({ is_active: !i.is_active }).eq("id", i.id);
    if (error) return toast.error(error.message);
    invalidateAll();
  }
  async function saveItemEdit() {
    if (!editItem) return;
    const name = editItem.name.trim();
    const price = Number(editItem.price);
    if (!name) return toast.error("Name required");
    if (!Number.isFinite(price) || price < 0) return toast.error("Valid price required");
    const { error } = await supabase.from("pos_items").update({
      name, category_id: editItem.category_id || null, price,
    }).eq("id", editItem.id);
    if (error) return toast.error(error.message);
    setEditItem(null); toast.success("Item updated"); invalidateAll();
  }
  async function deleteItem(id: string) {
    const { count } = await supabase.from("pos_sale_items").select("id", { count: "exact", head: true }).eq("item_id", id);
    if ((count ?? 0) > 0) {
      toast.error("Ye item pehle se sales mein use ho chuka hai, delete nahi kar sakte — Deactivate karo.");
      return;
    }
    const { error } = await supabase.from("pos_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Item deleted"); invalidateAll();
  }

  // ---------- Payment Modes ----------
  async function addMode() {
    if (!newMode.trim()) return;
    const { error } = await supabase.from("pos_payment_modes").insert({ label: newMode.trim(), sort_order: modes.length + 1 });
    if (error) return toast.error(error.message);
    setNewMode(""); toast.success("Payment mode added"); invalidateAll();
  }
  async function toggleMode(m: PosPayMode) {
    const { error } = await supabase.from("pos_payment_modes").update({ is_active: !m.is_active }).eq("id", m.id);
    if (error) return toast.error(error.message);
    invalidateAll();
  }
  async function saveModeLabel(m: PosPayMode) {
    const label = editModeLabel.trim();
    if (!label) return toast.error("Label required");
    const { error } = await supabase.from("pos_payment_modes").update({ label }).eq("id", m.id);
    if (error) return toast.error(error.message);
    setEditModeId(null); toast.success("Payment mode updated"); invalidateAll();
  }
  async function deleteMode(m: PosPayMode) {
    const { count } = await supabase.from("pos_sales").select("id", { count: "exact", head: true }).eq("payment_mode", m.label);
    if ((count ?? 0) > 0) {
      toast.error("Ye payment mode pehle se sales mein use ho chuka hai, delete nahi kar sakte — Deactivate karo.");
      return;
    }
    const { error } = await supabase.from("pos_payment_modes").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Payment mode deleted"); invalidateAll();
  }

  async function runConfirmedDelete() {
    if (!confirmDel) return;
    if (confirmDel.kind === "cat") await deleteCat(confirmDel.id);
    else if (confirmDel.kind === "item") await deleteItem(confirmDel.id);
    else {
      const m = modes.find((x) => x.id === confirmDel.id);
      if (m) await deleteMode(m);
    }
    setConfirmDel(null);
  }

  if (!flags.isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-2">
        <h2 className="text-xl font-semibold">Restricted</h2>
        <p className="text-muted-foreground">Only Super Admins can access POS Masters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link to="/settings" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to Settings
        </Link>
        <h1 className="text-3xl font-bold mt-2">POS Masters</h1>
        <p className="text-muted-foreground">Manage categories, items, payment modes and tax.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Tax</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 max-w-sm">
            <div className="flex-1 space-y-2">
              <Label>POS Tax Rate (%)</Label>
              <Input type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
            </div>
            <Button onClick={saveTax}><Save className="h-4 w-4 mr-2" />Save</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Categories</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-1">
            {cats.map((c) => {
              const isEditing = editCatId === c.id;
              return (
                <div key={c.id} className="flex items-center gap-2 border rounded-md px-3 py-2">
                  {isEditing ? (
                    <>
                      <Input className="flex-1 h-8" value={editCatName} onChange={(e) => setEditCatName(e.target.value)} />
                      <Button size="sm" variant="ghost" onClick={() => saveCatName(c)}><Check className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditCatId(null)}><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1">{c.name}</span>
                      <Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => { setEditCatId(c.id); setEditCatName(c.name); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleCat(c)}>{c.is_active ? "Deactivate" : "Activate"}</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmDel({ kind: "cat", id: c.id, label: c.name })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Input placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <Button onClick={addCat}><Plus className="h-4 w-4 mr-2" />Add</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Items</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {items.map((i) => (
              <div key={i.id} className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm">
                <span className="flex-1">{i.name}</span>
                <span className="text-muted-foreground text-xs">{cats.find((c) => c.id === i.category_id)?.name ?? "—"}</span>
                <span className="w-20 text-right font-medium">₹{Number(i.price).toLocaleString("en-IN")}</span>
                <Button size="sm" variant="ghost" onClick={() => setEditItem({ ...i })}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleItem(i)}>{i.is_active ? "Deactivate" : "Activate"}</Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDel({ kind: "item", id: i.id, label: i.name })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {items.length === 0 && <div className="text-sm text-muted-foreground px-1">No items yet.</div>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-2 border-t">
            <Input placeholder="Item name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
            <select
              className="border rounded-md px-2 text-sm bg-background h-9"
              value={newItem.category_id}
              onChange={(e) => setNewItem({ ...newItem, category_id: e.target.value })}
            >
              <option value="">— Category —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Input type="number" placeholder="Price" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} />
            <Button onClick={addItem}><Plus className="h-4 w-4 mr-2" />Add Item</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payment Modes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-1">
            {modes.map((m) => {
              const isEditing = editModeId === m.id;
              return (
                <div key={m.id} className="flex items-center gap-2 border rounded-md px-3 py-2">
                  {isEditing ? (
                    <>
                      <Input className="flex-1 h-8" value={editModeLabel} onChange={(e) => setEditModeLabel(e.target.value)} />
                      <Button size="sm" variant="ghost" onClick={() => saveModeLabel(m)}><Check className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditModeId(null)}><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1">{m.label}</span>
                      <Badge variant={m.is_active ? "default" : "secondary"}>{m.is_active ? "Active" : "Inactive"}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => { setEditModeId(m.id); setEditModeLabel(m.label); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleMode(m)}>{m.is_active ? "Deactivate" : "Activate"}</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmDel({ kind: "mode", id: m.id, label: m.label })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Input placeholder="New payment mode (e.g. Wallet)" value={newMode} onChange={(e) => setNewMode(e.target.value)} />
            <Button onClick={addMode}><Plus className="h-4 w-4 mr-2" />Add</Button>
          </div>
        </CardContent>
      </Card>

      {/* Edit Item Dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Item</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={editItem.name} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <select
                  className="border rounded-md px-2 text-sm bg-background h-9 w-full"
                  value={editItem.category_id ?? ""}
                  onChange={(e) => setEditItem({ ...editItem, category_id: e.target.value || null })}
                >
                  <option value="">— None —</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Price (₹)</Label>
                <Input type="number" step="0.01" value={editItem.price}
                  onChange={(e) => setEditItem({ ...editItem, price: Number(e.target.value) })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={saveItemEdit}><Save className="h-4 w-4 mr-2" />Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDel?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Ye action permanent hai. Agar record kisi past sale mein use hua hai to delete block ho jayega.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirmedDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
