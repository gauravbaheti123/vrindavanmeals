import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Plus, Save, Upload, Fingerprint, Users, ChevronRight, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, roleFlags } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Vrindavan Meals" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { roles } = useCurrentUser();
  const flags = roleFlags(roles);
  if (!flags.isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-2">
        <h2 className="text-xl font-semibold">Restricted</h2>
        <p className="text-muted-foreground">Only Super Admins can access Settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage system-wide preferences.</p>
      </div>
      <PortalModulesCard />
      <GeneralSettings />
      <BrandingCard />
      <MealWindowsCard />
      <UnitsCard />
      <IntegrationsCard />
    </div>
  );
}



function BrandingCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key,value");
      return Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
    },
  });
  const [form, setForm] = useState({
    brand_org_name: "",
    brand_address: "",
    brand_contact: "",
    brand_signature_line: "",
    brand_logo_url: "",
    brand_stamp_url: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      brand_org_name: data.brand_org_name ?? "Vrindavan Meals",
      brand_address: data.brand_address ?? "",
      brand_contact: data.brand_contact ?? "",
      brand_signature_line: data.brand_signature_line ?? "Authorised Signatory",
      brand_logo_url: data.brand_logo_url ?? "",
      brand_stamp_url: data.brand_stamp_url ?? "",
    });
  }, [data]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function fileToDataUrl(file: File): Promise<string> {
    if (file.size > 500 * 1024) throw new Error("Image must be under 500 KB");
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Could not read image"));
      r.readAsDataURL(file);
    });
  }

  async function onUpload(key: "brand_logo_url" | "brand_stamp_url", file: File | null) {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      set(key, url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function save() {
    setSaving(true);
    const rows = Object.entries(form).map(([key, value]) => ({ key, value }));
    const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Branding updated");
    qc.invalidateQueries({ queryKey: ["system-settings"] });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Branding (NOC & Letterhead)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Organisation Name</Label>
            <Input value={form.brand_org_name} onChange={(e) => set("brand_org_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Contact Number</Label>
            <Input value={form.brand_contact} onChange={(e) => set("brand_contact", e.target.value)} placeholder="+91 …" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Address</Label>
            <Input value={form.brand_address} onChange={(e) => set("brand_address", e.target.value)} placeholder="Street, City, State, PIN" />
          </div>
          <div className="space-y-2">
            <Label>Signature / Authority Line</Label>
            <Input value={form.brand_signature_line} onChange={(e) => set("brand_signature_line", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <Label>Logo (PNG/JPG, ≤ 500 KB)</Label>
            <Input type="file" accept="image/png,image/jpeg" onChange={(e) => onUpload("brand_logo_url", e.target.files?.[0] ?? null)} />
            {form.brand_logo_url && (
              <div className="flex items-center gap-3 pt-1">
                <img src={form.brand_logo_url} alt="Logo preview" className="h-14 w-14 object-contain border rounded bg-white p-1" />
                <Button size="sm" variant="ghost" onClick={() => set("brand_logo_url", "")}>Remove</Button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Signature / Stamp Image (optional)</Label>
            <Input type="file" accept="image/png,image/jpeg" onChange={(e) => onUpload("brand_stamp_url", e.target.files?.[0] ?? null)} />
            {form.brand_stamp_url && (
              <div className="flex items-center gap-3 pt-1">
                <img src={form.brand_stamp_url} alt="Stamp preview" className="h-14 w-24 object-contain border rounded bg-white p-1" />
                <Button size="sm" variant="ghost" onClick={() => set("brand_stamp_url", "")}>Remove</Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save Branding"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationsCard() {
  const [phone, setPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [backing, setBacking] = useState(false);
  const { data: settings } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key,value");
      return Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
    },
  });
  async function sendTest() {
    if (!phone) return toast.error("Enter test phone number");
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: { phone, template_name: "test_message", params: ["Test from Vrindavan Meals"] },
    });
    setTesting(false);
    if (error) return toast.error(error.message);
    if (data?.error === "NOT_CONFIGURED") return toast.warning("AISENSY_API_KEY not configured — add it in secrets.");
    toast.success("Test message sent");
  }
  async function runBackup() {
    setBacking(true);
    const { data, error } = await supabase.functions.invoke("backup-to-drive", { body: {} });
    setBacking(false);
    if (error) return toast.error(error.message);
    if (data?.error === "NOT_CONFIGURED") return toast.warning("Google Drive keys not configured — add secrets.");
    if (data?.success) toast.success(`Backup uploaded: ${data.uploaded?.length ?? 0} files`);
    else toast.error(data?.message ?? "Backup failed");
  }
  return (
    <Card>
      <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="font-semibold">WhatsApp (AiSensy)</Label>
          <div className="flex gap-2">
            <Input placeholder="+91…" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button onClick={sendTest} disabled={testing}>{testing ? "Sending…" : "Send Test WhatsApp"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Requires <code>AISENSY_API_KEY</code> in edge function secrets.</p>
        </div>
        <div className="space-y-2 pt-4 border-t">
          <Label className="font-semibold">Google Drive Backup</Label>
          <div className="text-sm text-muted-foreground">
            Last backup: {settings?.last_backup_at ? new Date(settings.last_backup_at).toLocaleString("en-IN") : "Never"}
          </div>
          <Button onClick={runBackup} disabled={backing} variant="outline">
            {backing ? "Running…" : "Run Manual Backup Now"}
          </Button>
          <p className="text-xs text-muted-foreground">Requires <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> and <code>GOOGLE_DRIVE_FOLDER_ID</code> in secrets. Scheduled every Sunday 2:00 AM.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PortalModulesCard() {
  const items = [
    { title: "Import Data", desc: "Bulk upload students, subscriptions, payments, attendance", icon: Upload, to: "/import" },
    { title: "Biometric Mapping", desc: "Map biometric IDs to students", icon: Fingerprint, to: "/biometric" },
    { title: "Users & Roles", desc: "Manage staff and role permissions", icon: Users, to: "/users" },
    { title: "POS Masters", desc: "Manage categories, items, payment modes & tax", icon: ShoppingBag, to: "/pos-masters" },
  ];
  return (
    <Card>
      <CardHeader><CardTitle>Portal Modules</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted/50 transition-colors"
          >
            <div className="bg-primary/10 p-2 rounded-md">
              <item.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-medium">{item.title}</div>
              <div className="text-xs text-muted-foreground">{item.desc}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function GeneralSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key,value");
      return Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
    },
  });
  const [price, setPrice] = useState("");
  const [grace, setGrace] = useState("");
  const [warn, setWarn] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setPrice(data.subscription_price ?? "3000");
    setGrace(data.grace_period_days ?? "5");
    setWarn(data.expiry_warning_days ?? "5");
  }, [data]);

  async function save() {
    setSaving(true);
    const updates = [
      { key: "subscription_price", value: price },
      { key: "grace_period_days", value: grace },
      { key: "expiry_warning_days", value: warn },
    ];
    const { error } = await supabase.from("system_settings").upsert(updates, { onConflict: "key" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Settings updated");
    qc.invalidateQueries({ queryKey: ["system-settings"] });
  }

  return (
    <Card>
      <CardHeader><CardTitle>General</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Subscription Price (₹)</Label>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Grace Period (days)</Label>
            <Input type="number" value={grace} onChange={(e) => setGrace(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Expiry Warning (days)</Label>
            <Input type="number" value={warn} onChange={(e) => setWarn(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface Window { id: string; unit_id: string; meal_type: "lunch" | "dinner"; start_time: string; end_time: string; }

function MealWindowsCard() {
  const { data: units } = useQuery({
    queryKey: ["units"],
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });

  return (
    <Card>
      <CardHeader><CardTitle>Meal Windows</CardTitle></CardHeader>
      <CardContent>
        {units && units.length > 0 ? (
          <Tabs defaultValue={units[0].id}>
            <TabsList>
              {units.map((u) => <TabsTrigger key={u.id} value={u.id}>{u.name}</TabsTrigger>)}
            </TabsList>
            {units.map((u) => (
              <TabsContent key={u.id} value={u.id} className="mt-4">
                <UnitMealWindows unitId={u.id} />
              </TabsContent>
            ))}
          </Tabs>
        ) : <p className="text-muted-foreground text-sm">No units configured.</p>}
      </CardContent>
    </Card>
  );
}

function UnitMealWindows({ unitId }: { unitId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["meal-windows", unitId],
    queryFn: async () => (await supabase.from("meal_windows").select("*").eq("unit_id", unitId)).data ?? [],
  });
  const [state, setState] = useState<Record<"lunch" | "dinner", { start: string; end: string }>>({
    lunch: { start: "10:00", end: "14:00" },
    dinner: { start: "18:00", end: "23:30" },
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const next = { ...state };
    (data as Window[]).forEach((w) => {
      next[w.meal_type] = { start: w.start_time.slice(0, 5), end: w.end_time.slice(0, 5) };
    });
    setState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function save() {
    setSaving(true);
    for (const meal of ["lunch", "dinner"] as const) {
      const { start, end } = state[meal];
      await supabase.from("meal_windows").upsert(
        { unit_id: unitId, meal_type: meal, start_time: start, end_time: end },
        { onConflict: "unit_id,meal_type" },
      );
    }
    setSaving(false);
    toast.success("Meal windows updated");
    qc.invalidateQueries({ queryKey: ["meal-windows", unitId] });
  }

  return (
    <div className="space-y-4">
      {(["lunch", "dinner"] as const).map((meal) => (
        <div key={meal} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="capitalize font-medium">{meal}</div>
          <div className="space-y-2">
            <Label>Start</Label>
            <Input type="time" value={state[meal].start} onChange={(e) => setState({ ...state, [meal]: { ...state[meal], start: e.target.value } })} />
          </div>
          <div className="space-y-2">
            <Label>End</Label>
            <Input type="time" value={state[meal].end} onChange={(e) => setState({ ...state, [meal]: { ...state[meal], end: e.target.value } })} />
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

function UnitsCard() {
  const qc = useQueryClient();
  const { data: units } = useQuery({
    queryKey: ["units"],
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function addUnit() {
    if (!newName.trim()) return;
    const { error } = await supabase.from("units").insert({ name: newName.trim() });
    if (error) { toast.error(error.message); return; }
    setNewName("");
    toast.success("Unit added");
    qc.invalidateQueries({ queryKey: ["units"] });
  }

  async function saveEdit() {
    if (!editId || !editName.trim()) return;
    const { error } = await supabase.from("units").update({ name: editName.trim() }).eq("id", editId);
    if (error) { toast.error(error.message); return; }
    setEditId(null);
    toast.success("Unit updated");
    qc.invalidateQueries({ queryKey: ["units"] });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Units</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {units?.map((u) => (
            <div key={u.id} className="flex items-center gap-2 border rounded-md px-3 py-2">
              {editId === u.id ? (
                <>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" />
                  <Button size="sm" onClick={saveEdit}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium">{u.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(u.id); setEditName(u.name); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <Input placeholder="New unit name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={addUnit}><Plus className="h-4 w-4 mr-2" />Add Unit</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- POS Masters ----------------
interface PosCategory { id: string; name: string; sort_order: number; is_active: boolean }
interface PosItem { id: string; name: string; category_id: string | null; price: number; is_active: boolean }
interface PosPayMode { id: string; label: string; is_active: boolean; sort_order: number }

function PosMastersCard() {
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
    <Card>
      <CardHeader><CardTitle>POS Masters</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {/* Tax */}
        <div className="flex items-end gap-2 max-w-sm">
          <div className="flex-1 space-y-2">
            <Label>POS Tax Rate (%)</Label>
            <Input type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
          </div>
          <Button onClick={saveTax}><Save className="h-4 w-4 mr-2" />Save</Button>
        </div>

        {/* Categories */}
        <div className="space-y-2 pt-4 border-t">
          <Label className="font-semibold">Categories</Label>
          <div className="space-y-1">
            {cats.map((c) => (
              <div key={c.id} className="flex items-center gap-2 border rounded-md px-3 py-2">
                <span className="flex-1">{c.name}</span>
                <Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                <Button size="sm" variant="ghost" onClick={() => toggleCat(c)}>{c.is_active ? "Deactivate" : "Activate"}</Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Input placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <Button onClick={addCat}><Plus className="h-4 w-4 mr-2" />Add</Button>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2 pt-4 border-t">
          <Label className="font-semibold">Items</Label>
          <div className="space-y-1 max-h-64 overflow-y-auto">
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-1">
            <Input placeholder="Item name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
            <select
              className="border rounded-md px-2 text-sm bg-background"
              value={newItem.category_id}
              onChange={(e) => setNewItem({ ...newItem, category_id: e.target.value })}
            >
              <option value="">— Category —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Input type="number" placeholder="Price" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} />
            <Button onClick={addItem}><Plus className="h-4 w-4 mr-2" />Add Item</Button>
          </div>
        </div>

        {/* Payment modes */}
        <div className="space-y-2 pt-4 border-t">
          <Label className="font-semibold">Payment Modes</Label>
          <div className="space-y-1">
            {modes.map((m) => (
              <div key={m.id} className="flex items-center gap-2 border rounded-md px-3 py-2">
                <span className="flex-1">{m.label}</span>
                <Badge variant={m.is_active ? "default" : "secondary"}>{m.is_active ? "Active" : "Inactive"}</Badge>
                <Button size="sm" variant="ghost" onClick={() => toggleMode(m)}>{m.is_active ? "Deactivate" : "Activate"}</Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Input placeholder="New payment mode (e.g. Wallet)" value={newMode} onChange={(e) => setNewMode(e.target.value)} />
            <Button onClick={addMode}><Plus className="h-4 w-4 mr-2" />Add</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

