import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Pencil, BookCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/classes")({ component: ClassesPage });

type Klass = { id: string; name: string };
type Section = { id: string; class_id: string; section_name: string };
type Subject = { id: string; name: string };
type ClassSubject = { id: string; class_id: string; subject_id: string };

function ClassesPage() {
  const qc = useQueryClient();

  const classesQ = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").order("name");
      if (error) throw error;
      return data as Klass[];
    },
  });
  const sectionsQ = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sections").select("*").order("section_name");
      if (error) throw error;
      return data as Section[];
    },
  });
  const subjectsQ = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("name");
      if (error) throw error;
      return data as Subject[];
    },
  });
  const csQ = useQuery({
    queryKey: ["class_subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_subjects").select("*");
      if (error) throw error;
      return data as ClassSubject[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Klass | null>(null);
  const [name, setName] = useState("");

  const [subjOpen, setSubjOpen] = useState(false);
  const [subjFor, setSubjFor] = useState<Klass | null>(null);

  const [secName, setSecName] = useState<Record<string, string>>({});

  const saveClass = async () => {
    if (!name.trim()) return toast.error("Name required");
    const { error } = editing
      ? await supabase.from("classes").update({ name: name.trim() }).eq("id", editing.id)
      : await supabase.from("classes").insert({ name: name.trim() });
    if (error) return toast.error(error.message.includes("unique") ? "Class name already exists." : error.message);
    toast.success("Saved");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["classes"] });
  };

  const removeClass = async (id: string) => {
    if (!confirm("Delete class? This removes its sections and timetable data.")) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries();
  };

  const addSection = async (classId: string) => {
    const sn = (secName[classId] || "").trim();
    if (!sn) return;
    const { error } = await supabase.from("sections").insert({ class_id: classId, section_name: sn });
    if (error) return toast.error(error.message.includes("unique") ? "Section already exists." : error.message);
    setSecName((p) => ({ ...p, [classId]: "" }));
    qc.invalidateQueries({ queryKey: ["sections"] });
  };

  const removeSection = async (id: string) => {
    if (!confirm("Delete section?")) return;
    const { error } = await supabase.from("sections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["sections"] });
  };

  const toggleSubject = async (classId: string, subjectId: string, on: boolean) => {
    if (on) {
      const { error } = await supabase.from("class_subjects").insert({ class_id: classId, subject_id: subjectId });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("class_subjects").delete().match({ class_id: classId, subject_id: subjectId });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["class_subjects"] });
  };

  const classes = classesQ.data ?? [];
  const sections = sectionsQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const cs = csQ.data ?? [];

  return (
    <AdminLayout>
      <PageHeader
        title="Classes & Sections"
        description="Create classes, add their sections, and map subjects (shared across all sections of a class)."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditing(null); setName(""); }}><Plus className="h-4 w-4 mr-2" />Add class</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit class" : "New class"}</DialogTitle></DialogHeader>
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 6, 7, O-Level" /></div>
              <DialogFooter><Button onClick={saveClass}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {classes.length === 0 && <p className="text-muted-foreground">No classes yet.</p>}
      <div className="grid gap-4">
        {classes.map((c) => {
          const secs = sections.filter((s) => s.class_id === c.id);
          const subjIds = new Set(cs.filter((x) => x.class_id === c.id).map((x) => x.subject_id));
          const classSubjects = subjects.filter((s) => subjIds.has(s.id));
          return (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Class {c.name}</CardTitle>
                <div className="space-x-1">
                  <Button size="sm" variant="outline" onClick={() => { setSubjFor(c); setSubjOpen(true); }}>
                    <BookCheck className="h-4 w-4 mr-1" /> Subjects ({classSubjects.length})
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setName(c.name); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => removeClass(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Sections</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {secs.length === 0 && <span className="text-sm text-muted-foreground">None yet.</span>}
                    {secs.map((s) => (
                      <Badge key={s.id} variant="secondary" className="gap-1 pr-1">
                        {s.section_name}
                        <button onClick={() => removeSection(s.id)} className="hover:text-destructive ml-1"><Trash2 className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 max-w-xs">
                  <Input
                    placeholder="Section name (A)"
                    value={secName[c.id] || ""}
                    onChange={(e) => setSecName((p) => ({ ...p, [c.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && addSection(c.id)}
                  />
                  <Button variant="outline" onClick={() => addSection(c.id)}>Add</Button>
                </div>
                {classSubjects.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2 border-t">
                    {classSubjects.map((s) => <Badge key={s.id} variant="outline">{s.name}</Badge>)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={subjOpen} onOpenChange={setSubjOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Subjects for class {subjFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-96 overflow-auto">
            {subjects.length === 0 && <p className="text-sm text-muted-foreground">No subjects exist. Create some first.</p>}
            {subjects.map((s) => {
              const checked = subjFor ? cs.some((x) => x.class_id === subjFor.id && x.subject_id === s.id) : false;
              return (
                <label key={s.id} className="flex items-center gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer">
                  <Checkbox checked={checked} onCheckedChange={(v) => subjFor && toggleSubject(subjFor.id, s.id, !!v)} />
                  <span>{s.name}</span>
                </label>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
