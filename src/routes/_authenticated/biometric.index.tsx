import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Upload, Fingerprint, AlertTriangle, CheckCircle2 } from "lucide-react";
import { StudentPicker, type StudentOption } from "@/components/student-picker";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/biometric/")({
  head: () => ({ meta: [{ title: "Biometric Mapping — Vrindavan Meals" }] }),
  component: BiometricMappingPage,
});

interface MappingRow {
  id: string; device_user_id: string; device_name: string | null; unit_id: string;
  is_active: boolean; mapped_at: string | null; mapped_by: string | null;
  student_id: string | null;
  students?: { id: string; full_name: string; roll_number: string | null } | null;
  units?: { name: string } | null;
}

function BiometricMappingPage() {
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("all");
  const [status, setStatus] = useState<"all" | "mapped" | "unmapped">("all");
  const [importOpen, setImportOpen] = useState(false);
  const [mapRow, setMapRow] = useState<MappingRow | null>(null);

  const { data: units } = useQuery({
    queryKey: ["units"],
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });

  const { data: mappings, isLoading } = useQuery({
    queryKey: ["biometric-mappings", unit],
    queryFn: async () => {
      let query = supabase.from("biometric_mappings")
        .select("id, device_user_id, device_name, unit_id, is_active, mapped_at, mapped_by, student_id, students(id, full_name, roll_number), units(name)")
        .order("device_user_id");
      if (unit !== "all") query = query.eq("unit_id", unit);
      const { data } = await query;
      return (data ?? []) as unknown as MappingRow[];
    },
  });

  const filtered = useMemo(() => (mappings ?? []).filter((r) => {
    const mapped = !!r.student_id && r.is_active;
    if (status === "mapped" && !mapped) return false;
    if (status === "unmapped" && mapped) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!(r.device_name?.toLowerCase().includes(s)
        || r.device_user_id.toLowerCase().includes(s)
        || r.students?.full_name?.toLowerCase().includes(s)
        || r.students?.roll_number?.toLowerCase().includes(s))) return false;
    }
    return true;
  }), [mappings, status, q]);

  const totals = useMemo(() => {
    const total = mappings?.length ?? 0;
    const mapped = (mappings ?? []).filter((r) => r.student_id && r.is_active).length;
    return { total, mapped, unmapped: total - mapped };
  }, [mappings]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Biometric Mapping</h1>
          <p className="text-muted-foreground">Link ZKTeco device users to students.</p>
        </div>
        <Button onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-2" />Import Machine Records</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total records</div><div className="text-2xl font-bold">{totals.total}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Mapped ✅</div><div className="text-2xl font-bold text-success">{totals.mapped}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Unmapped ⚠️</div><div className="text-2xl font-bold text-destructive">{totals.unmapped}</div></Card>
      </div>

      <Tabs defaultValue="mappings">
        <TabsList>
          <TabsTrigger value="mappings">Mappings</TabsTrigger>
          <TabsTrigger value="unmapped">Unmapped Scans</TabsTrigger>
        </TabsList>
        <TabsContent value="mappings" className="space-y-4">
          <Card className="p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search device, Mess No or name" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Units</SelectItem>
                {units?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="mapped">Mapped</SelectItem>
                <SelectItem value="unmapped">Unmapped</SelectItem>
              </SelectContent>
            </Select>
          </Card>

          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Device ID</TableHead><TableHead>Device Name</TableHead>
                <TableHead>Unit</TableHead><TableHead>Mapped Student</TableHead>
                <TableHead>Mapped At</TableHead><TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10">
                    <Fingerprint className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No records. Import machine records to begin.</p>
                  </TableCell></TableRow>
                ) : filtered.map((r) => {
                  const mapped = !!r.student_id && r.is_active;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.device_user_id}</TableCell>
                      <TableCell>{r.device_name ?? "—"}</TableCell>
                      <TableCell>{r.units?.name ?? "—"}</TableCell>
                      <TableCell>{r.students ? <span><span className="font-mono text-xs mr-1">{r.students.roll_number ?? "—"}</span>{r.students.full_name}</span> : <span className="text-muted-foreground">Unmapped</span>}</TableCell>
                      <TableCell>{r.mapped_at ? new Date(r.mapped_at).toLocaleDateString("en-IN") : "—"}</TableCell>
                      <TableCell>
                        {mapped
                          ? <Badge className="bg-success text-success-foreground">Mapped ✅</Badge>
                          : <Badge variant="destructive">Unmapped ⚠️</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant={mapped ? "ghost" : "default"} onClick={() => setMapRow(r)}>
                            {mapped ? "Change" : "Map Student"}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this device mapping?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Device {r.device_user_id}
                                  {r.students ? ` (mapped to ${r.students.full_name})` : ""} will be removed permanently.
                                  Past attendance records are not affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    const { error } = await supabase.from("biometric_mappings").delete().eq("id", r.id);
                                    if (error) return toast.error(error.message);
                                    toast.success("Mapping deleted");
                                    qc.invalidateQueries({ queryKey: ["biometric-mappings"] });
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>

                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="unmapped">
          <UnmappedScansTab />
        </TabsContent>
      </Tabs>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} units={units ?? []} />
      <MapDialog row={mapRow} onClose={() => setMapRow(null)} />
    </div>
  );
}

function UnmappedScansTab() {
  const { data } = useQuery({
    queryKey: ["unmapped-scans"],
    queryFn: async () => (await supabase.from("unmapped_scans")
      .select("id, device_user_id, unit_id, scan_time, resolved, units(name)")
      .order("scan_time", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <Card>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Device ID</TableHead><TableHead>Unit</TableHead>
          <TableHead>Scan Time</TableHead><TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {(data ?? []).length === 0 ? (
            <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No unmapped scans.</TableCell></TableRow>
          ) : (data ?? []).map((r) => {
            const row = r as { id: string; device_user_id: string; scan_time: string; resolved: boolean; units?: { name: string } };
            return (
              <TableRow key={row.id} className={row.resolved ? "opacity-50" : ""}>
                <TableCell className="font-mono text-xs">{row.device_user_id}</TableCell>
                <TableCell>{row.units?.name ?? "—"}</TableCell>
                <TableCell>{new Date(row.scan_time).toLocaleString("en-IN")}</TableCell>
                <TableCell>{row.resolved ? <Badge variant="secondary">Resolved</Badge> : <Badge variant="destructive">Open</Badge>}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function ImportDialog({ open, onClose, units }: { open: boolean; onClose: () => void; units: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<{ device_user_id: string; device_name: string; unit_id: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  function handleFile(f: File) {
    Papa.parse<Record<string, string>>(f, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const parsed = res.data.map((r) => ({
          device_user_id: (r.device_user_id ?? r.DeviceUserId ?? r.deviceUserId ?? "").toString().trim(),
          device_name: (r.device_name ?? r.DeviceName ?? r.name ?? "").toString().trim(),
          unit_id: (r.unit_id ?? r.UnitId ?? r.unit ?? "").toString().trim(),
        })).filter((r) => r.device_user_id && r.unit_id);
        setRows(parsed);
      },
    });
  }

  async function doImport() {
    setImporting(true);
    const payload = rows.map((r) => ({
      device_user_id: r.device_user_id,
      device_name: r.device_name || null,
      unit_id: r.unit_id,
      is_active: false,
      student_id: null,
    }));
    const { error } = await supabase.from("biometric_mappings").upsert(payload, {
      onConflict: "device_user_id,unit_id", ignoreDuplicates: false,
    });
    setImporting(false);
    if (error) return toast.error(error.message);
    toast.success(`${payload.length} records imported`);
    qc.invalidateQueries({ queryKey: ["biometric-mappings"] });
    setRows([]); onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Import Machine Records</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            CSV columns: <code>device_user_id, device_name, unit_id</code>. Use one of these unit IDs:
          </p>
          <div className="text-xs bg-muted p-2 rounded font-mono">
            {units.map((u) => <div key={u.id}>{u.name}: {u.id}</div>)}
          </div>
          <Input ref={inputRef} type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {rows.length > 0 && (
            <div className="max-h-60 overflow-y-auto border rounded">
              <Table>
                <TableHeader><TableRow><TableHead>Device ID</TableHead><TableHead>Name</TableHead><TableHead>Unit</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}><TableCell>{r.device_user_id}</TableCell><TableCell>{r.device_name}</TableCell><TableCell className="font-mono text-xs">{r.unit_id.slice(0,8)}…</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={doImport} disabled={!rows.length || importing}>
            {importing ? "Importing…" : `Import ${rows.length} records`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MapDialog({ row, onClose }: { row: MappingRow | null; onClose: () => void }) {
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const { user } = useCurrentUser();

  async function save() {
    if (!row || !student) return;
    setSaving(true);
    const { error } = await supabase.from("biometric_mappings").update({
      student_id: student.id, is_active: true, mapped_by: user?.id ?? null,
      mapped_at: new Date().toISOString(),
    }).eq("id", row.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Mapping saved");
    qc.invalidateQueries({ queryKey: ["biometric-mappings"] });
    setStudent(null); onClose();
  }

  async function deactivate() {
    if (!row) return;
    const { error } = await supabase.from("biometric_mappings").update({ is_active: false }).eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Mapping deactivated");
    qc.invalidateQueries({ queryKey: ["biometric-mappings"] });
    onClose();
  }

  return (
    <Dialog open={!!row} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Map Student to Device</DialogTitle></DialogHeader>
        {row && (
          <div className="space-y-3">
            <div className="text-sm bg-muted p-3 rounded space-y-1">
              <div><b>Device ID:</b> {row.device_user_id}</div>
              <div><b>Device Name:</b> {row.device_name ?? "—"}</div>
              <div><b>Unit:</b> {row.units?.name}</div>
              {row.students?.full_name && <div><b>Currently:</b> {row.students.roll_number ?? "—"} · {row.students.full_name}</div>}
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Select student</div>
              <StudentPicker value={student} onChange={setStudent} />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 flex-wrap">
          {row?.is_active && <Button variant="outline" onClick={deactivate}>Deactivate</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!student || saving}>
            <CheckCircle2 className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Link Student"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// unused imports kept clean
void AlertTriangle;
