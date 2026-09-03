import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/teachers")({ component: TeachersPage });

type Teacher = { id: string; name: string; email: string | null; employee_id: string | null };
type Allocation = { teacher_id: string; section_id: string; total_periods: number };
type Section = { id: string; class_teacher_id: string | null };

function TeachersPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("*").order("name");
      if (error) throw error;
      return data as Teacher[];
    },
  });
  const { data: allocs = [] } = useQuery({
    queryKey: ["teacher_allocations"],
    queryFn: async () => (await supabase.from("teacher_allocations").select("teacher_id,section_id,total_periods")).data as Allocation[],
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => (await supabase.from("sections").select("id,class_teacher_id")).data as Section[],
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [empId, setEmpId] = useState("");

  const openNew = () => { setEditing(null); setName(""); setEmail(""); setEmpId(""); setOpen(true); };
  const openEdit = (t: Teacher) => { setEditing(t); setName(t.name); setEmail(t.email ?? ""); setEmpId(t.employee_id ?? ""); setOpen(true); };

  const workload = (teacherId: string) => {
    const mine = allocs.filter((a) => a.teacher_id === teacherId);
    const sectionCount = new Set(mine.map((a) => a.section_id)).size;
    const periods = mine.reduce((s, a) => s + a.total_periods, 0);
    const classTeacherOf = sections.filter((s) => s.class_teacher_id === teacherId).length;
    return { sectionCount, periods, classTeacherOf };
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    const payload = { name: name.trim(), email: email.trim() || null, employee_id: empId.trim() || null };
    const { error } = editing
      ? await supabase.from("teachers").update(payload).eq("id", editing.id)
      : await supabase.from("teachers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["teachers"] });
  };

  const remove = async (id: string) => {
    const t = rows.find((x) => x.id === id);
    const nAlloc = allocs.filter((a) => a.teacher_id === id).length;
    const nCT = sections.filter((s) => s.class_teacher_id === id).length;
    const { count } = await supabase.from("timetable_slots").select("*", { count: "exact", head: true }).eq("teacher_id", id);
    const nSlots = count ?? 0;

    const blockers: string[] = [];
    if (nAlloc) blockers.push(`${nAlloc} workload allocation${nAlloc === 1 ? "" : "s"}`);
    if (nSlots) blockers.push(`${nSlots} timetable lesson${nSlots === 1 ? "" : "s"}`);
    if (nCT) blockers.push(`class teacher of ${nCT} section${nCT === 1 ? "" : "s"}`);
    if (blockers.length) {
      return toast.error(
        `Can't delete ${t?.name ?? "this teacher"} — still ${blockers.join(", ")}. Reassign on the Workload Allocation, Timetable and Classes & Sections pages first.`,
        { duration: 9000 },
      );
    }

    if (!confirm(`Delete ${t?.name ?? "this teacher"}? This can't be undone.`)) return;
    const { error } = await supabase.from("teachers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Teacher deleted");
    qc.invalidateQueries();
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Teachers"
        description="A teacher can't be deleted while they hold allocations, timetable lessons, or a class-teacher role."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add teacher</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit teacher" : "New teacher"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label>Email (optional)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Employee ID (optional)</Label><Input value={empId} onChange={(e) => setEmpId(e.target.value)} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Employee ID</TableHead><TableHead>Workload</TableHead><TableHead className="w-32 text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No teachers yet.</TableCell></TableRow>
            ) : rows.map((t) => {
              const w = workload(t.id);
              const inUse = w.sectionCount > 0 || w.classTeacherOf > 0;
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">{t.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{t.employee_id ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {w.sectionCount > 0 ? `${w.sectionCount} section${w.sectionCount === 1 ? "" : "s"} · ${w.periods}/wk` : "—"}
                    {w.classTeacherOf > 0 && (
                      <Badge variant="outline" className="ml-2 font-normal">
                        Class teacher{w.classTeacherOf > 1 ? ` ×${w.classTeacherOf}` : ""}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(t.id)}
                      title={inUse ? "Reassign this teacher's work before deleting" : "Delete teacher"}
                    >
                      <Trash2 className={`h-4 w-4 ${inUse ? "text-muted-foreground/40" : ""}`} />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </AdminLayout>
  );
}
