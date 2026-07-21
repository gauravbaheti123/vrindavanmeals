import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Plus, ArrowLeft } from "lucide-react";
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
  const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };


  const { data: cats = [] } = useQuery({
    queryKey: ["settings-pos-cats"],
    queryFn: async () => ((await db.from("pos_categories").select("*").order("sort_order")).data ?? []) as unknown as PosCategory[],
  });
  const { data: items = [] } = useQuery({
    queryKey: ["settings-pos-items"],
    queryFn: async () => ((await db.from("pos_items").select("*").order("name")).data ?? []) as unknown as PosItem[],
  });
  const { data: modes = [] } = useQuery({
    queryKey: ["settings-pos-modes"],
    queryFn: async () => ((await db.from("pos_payment_modes").select("*").order("sort_order")).data ?? []) as unknown as PosPayMode[],
  });
  const { data: settings } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key,value");
      return Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
    },
  });

  const [tax, setTax] = useState("");
  useEffect(() => { if (settings) setTax(settings.pos_tax_rate ?? "0"); }, [settings]);

  const [newCat, setNewCat] = useState("");
  const [newItem, setNewItem] = useState({ name: "", category_id: "", price: "" });
  const [newMode, setNewMode] = useState("");

  async function saveTax() {
    const { error } = await supabase.from("system_settings").upsert({ key: "pos_tax_rate", value: tax }, { onConflict: "key" });
    if (error) return toast.error(error.message);
    toast.success("Tax rate saved");
    qc.invalidateQueries({ queryKey: ["system-settings"] });
  }
  async function addCat() {
    if (!newCat.trim()) return;
    const { error } = await db.from("pos_categories").insert({ name: newCat.trim(), sort_order: cats.length + 1 });
    if (error) return toast.error(error.message);
    setNewCat(""); toast.success("Category added");
    qc.invalidateQueries({ queryKey: ["settings-pos-cats"] });
    qc.invalidateQueries({ queryKey: ["pos-cats"] });
  }
  async function toggleCat(c: PosCategory) {
    const { error } = await db.from("pos_categories").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["settings-pos-cats"] });
    qc.invalidateQueries({ queryKey: ["pos-cats"] });
  }
  async function addItem() {
    if (!newItem.name.trim() || !newItem.price) return toast.error("Name and price required");
    const { error } = await db.from("pos_items").insert({
      name: newItem.name.trim(),
      category_id: newItem.category_id || null,
      price: Number(newItem.price),
    });
    if (error) return toast.error(error.message);
    setNewItem({ name: "", category_id: "", price: "" });
    toast.success("Item added");
    qc.invalidateQueries({ queryKey: ["settings-pos-items"] });
    qc.invalidateQueries({ queryKey: ["pos-items"] });
  }
  async function toggleItem(i: PosItem) {
    const { error } = await db.from("pos_items").update({ is_active: !i.is_active }).eq("id", i.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["settings-pos-items"] });
    qc.invalidateQueries({ queryKey: ["pos-items"] });
  }
  async function addMode() {
    if (!newMode.trim()) return;
    const { error } = await db.from("pos_payment_modes").insert({ label: newMode.trim(), sort_order: modes.length + 1 });
    if (error) return toast.error(error.message);
    setNewMode(""); toast.success("Payment mode added");
    qc.invalidateQueries({ queryKey: ["settings-pos-modes"] });
    qc.invalidateQueries({ queryKey: ["pos-modes"] });
  }
  async function toggleMode(m: PosPayMode) {
    const { error } = await db.from("pos_payment_modes").update({ is_active: !m.is_active }).eq("id", m.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["settings-pos-modes"] });
    qc.invalidateQueries({ queryKey: ["pos-modes"] });
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
            {cats.map((c) => (
              <div key={c.id} className="flex items-center gap-2 border rounded-md px-3 py-2">
                <span className="flex-1">{c.name}</span>
                <Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                <Button size="sm" variant="ghost" onClick={() => toggleCat(c)}>{c.is_active ? "Deactivate" : "Activate"}</Button>
              </div>
            ))}
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
                <Button size="sm" variant="ghost" onClick={() => toggleItem(i)}>{i.is_active ? "Deactivate" : "Activate"}</Button>
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
            {modes.map((m) => (
              <div key={m.id} className="flex items-center gap-2 border rounded-md px-3 py-2">
                <span className="flex-1">{m.label}</span>
                <Badge variant={m.is_active ? "default" : "secondary"}>{m.is_active ? "Active" : "Inactive"}</Badge>
                <Button size="sm" variant="ghost" onClick={() => toggleMode(m)}>{m.is_active ? "Deactivate" : "Activate"}</Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Input placeholder="New payment mode (e.g. Wallet)" value={newMode} onChange={(e) => setNewMode(e.target.value)} />
            <Button onClick={addMode}><Plus className="h-4 w-4 mr-2" />Add</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
