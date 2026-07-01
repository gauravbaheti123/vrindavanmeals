import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, roleFlags } from "@/hooks/use-current-user";
import { createUser, updateUser, resetPassword } from "@/lib/users.functions";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];
const ROLES: Role[] = ["super_admin", "manager", "counter_staff", "accountant"];
const MODULES = [
  "dashboard", "students_view", "students_manage", "students_approve",
  "biometric", "subscriptions_view", "subscriptions_manage",
  "payments_view", "payments_record",
  "attendance_view", "attendance_manual", "attendance_override",
  "reprint_queue", "reports", "settings", "users_roles", "import",
];

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users & Roles — Vrindavan Meals" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { roles } = useCurrentUser();
  const flags = roleFlags(roles);
  if (!flags.isSuperAdmin) {
    return <div className="max-w-md mx-auto mt-16 text-center"><h2 className="text-xl font-semibold">Restricted</h2><p className="text-muted-foreground">Only Super Admins can access this page.</p></div>;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Users & Roles</h1>
        <p className="text-muted-foreground">Manage portal staff and permissions.</p>
      </div>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="permissions">Role Permissions</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="permissions" className="mt-4"><PermissionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: units } = useQuery({
    queryKey: ["units"],
    queryFn: async () => (await supabase.from("units").select("id,name")).data ?? [],
  });

  const { data: users, refetch, isFetching } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,name,email,mobile,unit_id,is_active,created_at"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const roleMap = new Map<string, Role[]>();
      (roles ?? []).forEach((r) => {
        const arr = roleMap.get(r.user_id) ?? [];
        arr.push(r.role as Role);
        roleMap.set(r.user_id, arr);
      });
      return (profiles ?? []).map((p) => ({ ...p, roles: roleMap.get(p.id) ?? [] }));
    },
  });

  const filtered = useMemo(() => {
    return (users ?? []).filter((u) => {
      if (search && !`${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (roleFilter !== "all" && !u.roles.includes(roleFilter as Role)) return false;
      if (unitFilter !== "all" && u.unit_id !== unitFilter) return false;
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      return true;
    });
  }, [users, search, roleFilter, unitFilter, statusFilter]);

  const unitName = (id: string | null) => units?.find((u) => u.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]"><Label>Search</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" /></div>
        <div><Label>Role</Label>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Unit</Label>
          <Select value={unitFilter} onValueChange={setUnitFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All units</SelectItem>
              {(units ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" />Add User</Button>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Mobile</TableHead>
            <TableHead>Role</TableHead><TableHead>Unit</TableHead><TableHead>Status</TableHead>
            <TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isFetching ? <TableRow><TableCell colSpan={8} className="text-center">Loading…</TableCell></TableRow>
              : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No users found</TableCell></TableRow>
              : filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name || "—"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.mobile || "—"}</TableCell>
                  <TableCell>{u.roles.map((r) => <RoleBadge key={r} role={r} />)}</TableCell>
                  <TableCell>{unitName(u.unit_id)}</TableCell>
                  <TableCell>{u.is_active ? <Badge variant="default">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(u); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        units={units ?? []}
        onSaved={() => { refetch(); setDialogOpen(false); }}
      />
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    super_admin: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    manager: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    counter_staff: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    accountant: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  };
  return <Badge variant="outline" className={`mr-1 capitalize ${styles[role]}`}>{role.replace("_", " ")}</Badge>;
}

function UserDialog({ open, onOpenChange, editing, units, onSaved }: any) {
  const [form, setForm] = useState<any>({});
  const isEdit = !!editing;

  const createFn = useServerFn(createUser);
  const updateFn = useServerFn(updateUser);
  const resetFn = useServerFn(resetPassword);

  const saveM = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        return updateFn({ data: {
          user_id: editing.id,
          full_name: form.full_name || editing.name,
          mobile: form.mobile ?? editing.mobile ?? "",
          role: form.role || editing.roles?.[0] || "counter_staff",
          unit_id: form.unit_id ?? editing.unit_id ?? "",
          is_active: form.is_active ?? editing.is_active,
        }});
      }
      return createFn({ data: {
        full_name: form.full_name, email: form.email, mobile: form.mobile || "",
        role: form.role || "counter_staff", unit_id: form.unit_id || "",
        password: form.password,
      }});
    },
    onSuccess: () => { toast.success(isEdit ? "User updated" : "User created"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  const resetM = useMutation({
    mutationFn: async () => resetFn({ data: { user_id: editing.id } }),
    onSuccess: (res: any) => toast.success(`New password: ${res.temp_password}`, { duration: 30000 }),
    onError: (e: any) => toast.error(e.message),
  });

  // reset form when opening
  useMemo(() => {
    setForm(isEdit ? {
      full_name: editing.name, mobile: editing.mobile, role: editing.roles?.[0],
      unit_id: editing.unit_id, is_active: editing.is_active,
    } : { role: "counter_staff", is_active: true });
  }, [editing, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? "Edit User" : "Add User"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Full Name *</Label><Input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          {!isEdit && <div><Label>Email *</Label><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>}
          <div><Label>Mobile</Label><Input value={form.mobile ?? ""} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div><Label>Role *</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Assigned Unit</Label>
            <Select value={form.unit_id ?? "__none"} onValueChange={(v) => setForm({ ...form, unit_id: v === "__none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Both / None</SelectItem>
                {units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!isEdit && <div><Label>Password * (min 8 chars)</Label><Input type="password" value={form.password ?? ""} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>}
          {isEdit && (
            <div className="flex items-center justify-between border rounded-md p-3">
              <div><Label>Active</Label><p className="text-xs text-muted-foreground">Inactive users cannot login.</p></div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          )}
          {isEdit && (
            <Button variant="outline" onClick={() => resetM.mutate()} disabled={resetM.isPending} className="w-full">
              <KeyRound className="h-4 w-4 mr-2" />{resetM.isPending ? "Resetting…" : "Reset Password"}
            </Button>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            {saveM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save Changes" : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsTab() {
  const qc = useQueryClient();
  const { data: perms, isFetching } = useQuery({
    queryKey: ["role_permissions"],
    queryFn: async () => (await supabase.from("role_permissions").select("*")).data ?? [],
  });

  const [local, setLocal] = useState<Record<string, boolean>>({});
  useMemo(() => {
    const map: Record<string, boolean> = {};
    (perms ?? []).forEach((p) => { map[`${p.role}:${p.module_name}`] = p.can_access; });
    setLocal(map);
  }, [perms]);

  const editableRoles = ROLES.filter((r) => r !== "super_admin");

  const saveM = useMutation({
    mutationFn: async () => {
      const rows = editableRoles.flatMap((role) =>
        MODULES.map((module_name) => ({
          role, module_name, can_access: !!local[`${role}:${module_name}`],
        })),
      );
      // delete old for these roles then insert
      await supabase.from("role_permissions").delete().in("role", editableRoles);
      const { error } = await supabase.from("role_permissions").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Permissions saved"); qc.invalidateQueries({ queryKey: ["role_permissions"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Role × Module Permissions</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Module</TableHead>
              <TableHead className="text-center">Super Admin</TableHead>
              {editableRoles.map((r) => <TableHead key={r} className="text-center capitalize">{r.replace("_", " ")}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {isFetching ? <TableRow><TableCell colSpan={5}>Loading…</TableCell></TableRow>
                : MODULES.map((mod) => (
                <TableRow key={mod}>
                  <TableCell className="font-medium capitalize">{mod.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-center">🔒 ✅</TableCell>
                  {editableRoles.map((r) => (
                    <TableCell key={r} className="text-center">
                      <Checkbox
                        checked={!!local[`${r}:${mod}`]}
                        onCheckedChange={(v) => setLocal({ ...local, [`${r}:${mod}`]: !!v })}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
          {saveM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Permissions
        </Button>
      </CardContent>
    </Card>
  );
}
