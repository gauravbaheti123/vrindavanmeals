import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, UserPlus, Clock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/students/")({
  head: () => ({ meta: [{ title: "Students — Vrindavan Meals" }] }),
  component: StudentList,
});

function StudentList() {
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState<string>("all");

  const { data: units } = useQuery({
    queryKey: ["units"],
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });

  const { data: students, isLoading } = useQuery({
    queryKey: ["students", q, unit],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("id, full_name, mobile, roll_number, unit_id, is_approved, units(name)")
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(200);
      if (q) query = query.or(`full_name.ilike.%${q}%,mobile.ilike.%${q}%,roll_number.ilike.%${q}%`);
      if (unit !== "all") query = query.eq("unit_id", unit);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: pendingCount } = useQuery({
    queryKey: ["students-pending-count"],
    queryFn: async () =>
      (await supabase.from("students").select("id", { count: "exact", head: true }).eq("is_approved", false)).count ?? 0,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-muted-foreground">Manage student records across units.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/students/pending">
              <Clock className="h-4 w-4 mr-2" />
              Pending Approvals
              {pendingCount ? <Badge variant="secondary" className="ml-2">{pendingCount}</Badge> : null}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/students/new"><Plus className="h-4 w-4 mr-2" />Add Student</Link>
          </Button>
        </div>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, mobile or roll no." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Units</SelectItem>
            {units?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Roll No.</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : students?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <UserPlus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No students yet. Add your first student to get started.</p>
                </TableCell>
              </TableRow>
            ) : students?.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.full_name}</TableCell>
                <TableCell>{s.mobile}</TableCell>
                <TableCell>{s.roll_number || "—"}</TableCell>
                <TableCell>{(s as unknown as { units?: { name: string } }).units?.name || "—"}</TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost"><Link to="/students/$id" params={{ id: s.id }}>View</Link></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
