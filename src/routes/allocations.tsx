import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { naturalCompare } from "@/lib/utils";

export const Route = createFileRoute("/allocations")({ component: AllocPage });

type Teacher = { id: string; name: string };
type Klass = { id: string; name: string };
type Section = { id: string; class_id: string; section_name: string };
type Subject = { id: string; name: string };
type ClassSubject = { id: string; class_id: string; subject_id: string };
type Allocation = { id: string; teacher_id: string; class_id: string; section_id: string; total_periods: number };
type AllocSubject = { id: string; allocation_id: string; subject_id: string; periods: number };
type Slot = { teacher_id: string; class_id: string; section_id: string };

function AllocPage() {
  const qc = useQueryClient();

  const teachersQ = useQuery({ queryKey: ["teachers"], queryFn: async () => (await supabase.from("teachers").select("*").order("name")).data as Teacher[] });
  const classesQ = useQuery({ queryKey: ["classes"], queryFn: async () => (await supabase.from("classes").select("*").order("name")).data as Klass[] });
  const sectionsQ = useQuery({ queryKey: ["sections"], queryFn: async () => (await supabase.from("sections").select("*").order("section_name")).data as Section[] });
  const subjectsQ = useQuery({ queryKey: ["subjects"], queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data as Subject[] });
  const csQ = useQuery({ queryKey: ["class_subjects"], queryFn: async () => (await supabase.from("class_subjects").select("*")).data as ClassSubject[] });
  const allocsQ = useQuery({ queryKey: ["teacher_allocations"], queryFn: async () => (await supabase.from("teacher_allocations").select("*")).data as Allocation[] });
  const allocSubsQ = useQuery({ queryKey: ["teacher_allocation_subjects"], queryFn: async () => (await supabase.from("teacher_allocation_subjects").select("*")).data as AllocSubject[] });
  const slotsQ = useQuery({ queryKey: ["timetable_slots"], queryFn: async () => (await supabase.from("timetable_slots").select("teacher_id,class_id,section_id")).data as Slot[] });

  const teachers = teachersQ.data ?? [];
  const classes = [...(classesQ.data ?? [])].sort((a, b) => naturalCompare(a.name, b.name));
  const sections = sectionsQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const cs = csQ.data ?? [];
  const allocs = allocsQ.data ?? [];
  const allocSubs = allocSubsQ.data ?? [];
  const slots = slotsQ.data ?? [];

  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [total, setTotal] = useState(0);
  const [perSubject, setPerSubject] = useState<Record<string, number>>({});

  const availableSubjects = useMemo(() => {
    const ids = new Set(cs.filter((x) => x.class_id === classId).map((x) => x.subject_id));
    return subjects.filter((s) => ids.has(s.id));
  }, [cs, subjects, classId]);

  const sectionsForClass = useMemo(() => sections.filter((s) => s.class_id === classId), [sections, classId]);

  const sumAssigned = Object.values(perSubject).reduce((a, b) => a + (Number(b) || 0), 0);
  const remaining = total - sumAssigned;

  const existing = allocs.find((a) => a.teacher_id === teacherId && a.class_id === classId && a.section_id === sectionId);

  const visibleAllocs = useMemo(() => {
    const filtered = teacherId ? allocs.filter((a) => a.teacher_id === teacherId) : allocs;
    return [...filtered].sort((a, b) => {
      const cA = classes.find((c) => c.id === a.class_id)?.name ?? "";
      const cB = classes.find((c) => c.id === b.class_id)?.name ?? "";
      const byClass = naturalCompare(cA, cB);
      if (byClass !== 0) return byClass;
      const sA = sections.find((s) => s.id === a.section_id)?.section_name ?? "";
      const sB = sections.find((s) => s.id === b.section_id)?.section_name ?? "";
      return naturalCompare(sA, sB);
    });
  }, [allocs, classes, sections, teacherId]);

  const teacherTotalPeriods = useMemo(
    () => (teacherId ? visibleAllocs.reduce((sum, a) => sum + a.total_periods, 0) : 0),
    [visibleAllocs, teacherId],
  );

  const selectedTeacherName = teachers.find((t) => t.id === teacherId)?.name;

  const loadAllocationIntoForm = (a: Allocation) => {
    setTeacherId(a.teacher_id);
    setClassId(a.class_id);
    setSectionId(a.section_id);
  };

  // auto-fill total & per-subject periods once teacher, class & section are all selected
  useEffect(() => {
    if (!teacherId || !classId || !sectionId) return;
    if (!existing) { setTotal(0); setPerSubject({}); return; }
    setTotal(existing.total_periods);
    const map: Record<string, number> = {};
    allocSubs.filter((x) => x.allocation_id === existing.id).forEach((x) => { map[x.subject_id] = x.periods; });
    setPerSubject(map);
  }, [teacherId, classId, sectionId, existing, allocSubs]);

  const save = async () => {
    if (!teacherId || !classId || !sectionId) return toast.error("Pick teacher, class, section");
    if (total < 0) return toast.error("Total must be ≥ 0");
    if (sumAssigned !== total) return toast.error(`Subject periods (${sumAssigned}) must equal total (${total}).`);

    // R5: check timetable usage if reducing
    const used = slots.filter((s) => s.teacher_id === teacherId && s.class_id === classId && s.section_id === sectionId).length;
    if (total < used) {
      return toast.error(`Cannot reduce: ${used} periods already in timetable. Remove timetable slots first.`);
    }

    // upsert allocation
    let allocId = existing?.id;
    if (existing) {
      const { error } = await supabase.from("teacher_allocations").update({ total_periods: total }).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase.from("teacher_allocations").insert({ teacher_id: teacherId, class_id: classId, section_id: sectionId, total_periods: total }).select().single();
      if (error) return toast.error(error.message);
      allocId = data.id;
    }
    // replace subject splits
    await supabase.from("teacher_allocation_subjects").delete().eq("allocation_id", allocId!);
    const rows = Object.entries(perSubject).filter(([, v]) => Number(v) > 0).map(([subject_id, periods]) => ({ allocation_id: allocId!, subject_id, periods: Number(periods) }));
    if (rows.length) {
      const { error } = await supabase.from("teacher_allocation_subjects").insert(rows);
      if (error) return toast.error(error.message);
    }
    toast.success("Allocation saved");
    qc.invalidateQueries({ queryKey: ["teacher_allocations"] });
    qc.invalidateQueries({ queryKey: ["teacher_allocation_subjects"] });
  };

  const removeAllocation = async (id: string) => {
    const alloc = allocs.find((a) => a.id === id);
    if (!alloc) return;
    const used = slots.filter((s) => s.teacher_id === alloc.teacher_id && s.class_id === alloc.class_id && s.section_id === alloc.section_id).length;
    if (used > 0) return toast.error(`Cannot delete: ${used} timetable slots exist. Remove them first.`);
    if (!confirm("Delete allocation?")) return;
    const { error } = await supabase.from("teacher_allocations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["teacher_allocations"] });
  };

  return (
    <AdminLayout>
      <PageHeader title="Teacher Workload Allocation" description="Assign weekly periods per teacher for each class & section, split across subjects." />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>New / Edit Allocation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Teacher</Label>
                <Select value={teacherId} onValueChange={setTeacherId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Class</Label>
                <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId(""); setTotal(0); setPerSubject({}); }}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Section</Label>
                <Select value={sectionId} onValueChange={setSectionId} disabled={!classId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{sectionsForClass.map((s) => <SelectItem key={s.id} value={s.id}>{s.section_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Total weekly periods</Label>
              <Input type="number" min={0} value={total} onChange={(e) => setTotal(Number(e.target.value))} />
            </div>

            {classId && availableSubjects.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>Periods per subject</Label>
                  <span className={remaining === 0 ? "text-emerald-600" : remaining < 0 ? "text-destructive" : "text-muted-foreground"}>
                    Assigned {sumAssigned} / {total} · Remaining {remaining}
                  </span>
                </div>
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {availableSubjects.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="flex-1 text-sm">{s.name}</span>
                      <Input
                        type="number"
                        min={0}
                        className="w-24"
                        value={perSubject[s.id] ?? 0}
                        onChange={(e) => setPerSubject((p) => ({ ...p, [s.id]: Number(e.target.value) }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={save} disabled={!teacherId || !classId || !sectionId}>
              {existing ? "Update allocation" : "Create allocation"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {selectedTeacherName ? (
                    <>
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {selectedTeacherName}'s Workload
                    </>
                  ) : (
                    "All Allocations"
                  )}
                </CardTitle>
                <CardDescription>
                  {selectedTeacherName
                    ? `${visibleAllocs.length} class${visibleAllocs.length === 1 ? "" : "es"} assigned · ${teacherTotalPeriods} periods/week total`
                    : "Select a teacher above to see just their allocations."}
                </CardDescription>
              </div>
              {selectedTeacherName && (
                <Button variant="ghost" size="sm" onClick={() => { setTeacherId(""); setClassId(""); setSectionId(""); }}>
                  <X className="h-4 w-4 mr-1" />
                  Show all teachers
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto max-h-[600px]">
              <Table>
                <TableHeader><TableRow>{!selectedTeacherName && <TableHead>Teacher</TableHead>}<TableHead>Class / Sec</TableHead><TableHead>Subjects</TableHead><TableHead className="text-right">Total</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {visibleAllocs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={selectedTeacherName ? 4 : 5} className="py-6 text-center text-muted-foreground">
                        {selectedTeacherName ? "No allocations yet for this teacher." : "No allocations yet."}
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleAllocs.map((a) => {
                    const t = teachers.find((x) => x.id === a.teacher_id)?.name ?? "?";
                    const c = classes.find((x) => x.id === a.class_id)?.name ?? "?";
                    const sec = sections.find((x) => x.id === a.section_id)?.section_name ?? "?";
                    const subs = allocSubs.filter((x) => x.allocation_id === a.id);
                    const isEditing = a.id === existing?.id;
                    return (
                      <TableRow
                        key={a.id}
                        onClick={() => loadAllocationIntoForm(a)}
                        className={`cursor-pointer ${isEditing ? "bg-accent" : ""}`}
                        title="Click to load into the edit form"
                      >
                        {!selectedTeacherName && <TableCell className="font-medium">{t}</TableCell>}
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">{c} / {sec}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {subs.map((s) => `${subjects.find((x) => x.id === s.subject_id)?.name ?? "?"} (${s.periods})`).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">{a.total_periods}</TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); removeAllocation(a.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
