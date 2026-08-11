import { createFileRoute, Link } from "@tanstack/react-router";
import { STALE } from "@/lib/query-cache";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, History } from "lucide-react";
import { useCurrentUser, roleFlags } from "@/hooks/use-current-user";
import { ACTION_LABEL, ENTITY_LABEL, type AuditAction, type AuditEntity } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/activity-log")({
  head: () => ({
    meta: [
      { title: "Activity Log — Vrindavan Meals" },
      { name: "description", content: "Audit trail of every edit and deletion made across the Vrindavan Meals portal." },
      { property: "og:title", content: "Activity Log — Vrindavan Meals" },
      { property: "og:description", content: "Audit trail of every edit and deletion made across the Vrindavan Meals portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityLogPage,
});

type LogRow = {
  id: string;
  actor_id: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entity_id: string | null;
  student_id: string | null;
  label: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_STYLE: Record<AuditAction, string> = {
  create: "bg-success text-success-foreground",
  update: "bg-warning text-warning-foreground",
  delete: "bg-destructive text-destructive-foreground",
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  return String(v);
}

function ValueCell({ values }: { values: Record<string, unknown> | null }) {
  if (!values || Object.keys(values).length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5">
      {Object.entries(values).map(([k, v]) => (
        <div key={k} className="text-xs">
          <span className="text-muted-foreground">{k.replace(/_/g, " ")}: </span>
          <span className="font-medium">{fmtVal(v)}</span>
        </div>
      ))}
    </div>
  );
}

function ActivityLogPage() {
  const { roles } = useCurrentUser();
  const flags = roleFlags(roles);
  const [entity, setEntity] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log"],
    staleTime: STALE.LIST,
    queryFn: async () => {
      const { data: logs, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows = (logs ?? []) as unknown as LogRow[];
      const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
      const students = [...new Set(rows.map((r) => r.student_id).filter(Boolean))] as string[];
      const [profRes, stuRes] = await Promise.all([
        actorIds.length
          ? supabase.from("profiles").select("id, name").in("id", actorIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        students.length
          ? supabase.from("students").select("id, full_name, roll_number").in("id", students)
          : Promise.resolve({ data: [] as { id: string; full_name: string; roll_number: string | null }[] }),
      ]);
      const actorMap = new Map((profRes.data ?? []).map((p) => [p.id, p.name]));
      const stuMap = new Map(
        ((stuRes.data ?? []) as { id: string; full_name: string; roll_number: string | null }[]).map((s) => [
          s.id,
          s.roll_number ? `${s.roll_number} · ${s.full_name}` : s.full_name,
        ]),
      );
      return rows.map((r) => ({
        ...r,
        actor_name: (r.actor_id && actorMap.get(r.actor_id)) || "Unknown user",
        student_name: r.student_id ? stuMap.get(r.student_id) ?? null : null,
      }));
    },
    enabled: flags.isSuperAdmin,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (entity !== "all" && r.entity !== entity) return false;
      if (action !== "all" && r.action !== action) return false;
      if (!q) return true;
      return (
        (r.label ?? "").toLowerCase().includes(q) ||
        (r.student_name ?? "").toLowerCase().includes(q) ||
        r.actor_name.toLowerCase().includes(q)
      );
    });
  }, [data, entity, action, search]);

  if (!flags.isSuperAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-2">
        <h2 className="text-xl font-semibold">Restricted</h2>
        <p className="text-muted-foreground">Only Super Admins can view the Activity Log.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link to="/settings"><ArrowLeft className="h-4 w-4 mr-1" />Back to Settings</Link>
        </Button>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <History className="h-7 w-7 text-primary" />Activity Log
        </h1>
        <p className="text-muted-foreground">
          Every create, edit and delete on payments, adjustments, subscriptions, fee slabs and biometric mappings.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Record type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All record types</SelectItem>
              {Object.entries(ENTITY_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(ACTION_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Search student, user or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{rows.length} {rows.length === 1 ? "entry" : "entries"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Old value</TableHead>
                <TableHead>New value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No activity recorded yet.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="text-sm">{r.actor_name}</TableCell>
                  <TableCell><Badge className={ACTION_STYLE[r.action]}>{ACTION_LABEL[r.action]}</Badge></TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{ENTITY_LABEL[r.entity] ?? r.entity}</div>
                    {r.student_name && (
                      r.student_id ? (
                        <Link to="/students/$id" params={{ id: r.student_id }} className="text-xs text-primary hover:underline">
                          {r.student_name}
                        </Link>
                      ) : <span className="text-xs text-muted-foreground">{r.student_name}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm max-w-[16rem]">{r.label ?? "—"}</TableCell>
                  <TableCell><ValueCell values={r.old_values} /></TableCell>
                  <TableCell><ValueCell values={r.new_values} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
