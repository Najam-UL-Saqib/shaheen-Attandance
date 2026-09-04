import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Coffee, Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { naturalCompare } from "@/lib/utils";

type Klass = { id: string; name: string };
type Break = { id: string; name: string; after_period: number };
type BreakClass = { break_id: string; class_id: string };

export function BreaksCard({ periods, defaultAfter, onDefaultChange, onSaveDefault, canSave }: {
  periods: number;
  defaultAfter: number;
  onDefaultChange: (v: number) => void;
  onSaveDefault: () => void;
  canSave: boolean;
}) {
  const qc = useQueryClient();
  const classesQ = useQuery({ queryKey: ["classes"], queryFn: async () => (await supabase.from("classes").select("id,name")).data as Klass[] });
  const breaksQ = useQuery({ queryKey: ["breaks"], queryFn: async () => (await supabase.from("breaks").select("*").order("after_period")).data as Break[] });
  const bcQ = useQuery({ queryKey: ["break_classes"], queryFn: async () => (await supabase.from("break_classes").select("*")).data as BreakClass[] });

  const classes = [...(classesQ.data ?? [])].sort((a, b) => naturalCompare(a.name, b.name));
  const breaks = breaksQ.data ?? [];
  const breakClasses = bcQ.data ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Break | null>(null);
  const [name, setName] = useState("");
  const [after, setAfter] = useState(3);
  const [classIds, setClassIds] = useState<Set<string>>(new Set());

  const openNew = () => { setEditing(null); setName(""); setAfter(3); setClassIds(new Set()); setOpen(true); };
  const openEdit = (b: Break) => {
    setEditing(b);
    setName(b.name);
    setAfter(b.after_period);
    setClassIds(new Set(breakClasses.filter((x) => x.break_id === b.id).map((x) => x.class_id)));
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name the break");
    if (classIds.size === 0) return toast.error("Pick at least one class");
    let id = editing?.id;
    if (editing) {
      const { error } = await supabase.from("breaks").update({ name: name.trim(), after_period: after }).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase.from("breaks").insert({ name: name.trim(), after_period: after }).select().single();
      if (error) return toast.error(error.message);
      id = data.id;
    }
    await supabase.from("break_classes").delete().eq("break_id", id!);
    const rows = [...classIds].map((class_id) => ({ break_id: id!, class_id }));
    if (rows.length) {
      const { error } = await supabase.from("break_classes").insert(rows);
      if (error) return toast.error(error.message);
    }
    toast.success("Break saved");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["breaks"] });
    qc.invalidateQueries({ queryKey: ["break_classes"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this break?")) return;
    const { error } = await supabase.from("breaks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["breaks"] });
    qc.invalidateQueries({ queryKey: ["break_classes"] });
  };

  const classesInACustomBreak = new Set(breakClasses.map((x) => x.class_id));
  const defaultClasses = classes.filter((c) => !classesInACustomBreak.has(c.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Coffee className="h-5 w-5 text-muted-foreground" />Breaks</CardTitle>
        <CardDescription>
          Different classes can break at different times. Make a break, choose the classes it covers, set when it falls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          {breaks.length === 0 && <p className="text-sm text-muted-foreground">No custom breaks yet.</p>}
          {breaks.map((b) => {
            const bClasses = classes.filter((c) => breakClasses.some((x) => x.break_id === b.id && x.class_id === c.id));
            return (
              <div key={b.id} className="flex items-start justify-between gap-3 rounded-md border p-2.5">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{b.name} <span className="text-muted-foreground font-normal">· after period {b.after_period}</span></div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {bClasses.map((c) => <Badge key={c.id} variant="secondary" className="font-normal">Class {c.name}</Badge>)}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            );
          })}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add break</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit break" : "New break"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Junior break" /></div>
                <div>
                  <Label>After period</Label>
                  <Input type="number" min={1} max={periods} value={after} onChange={(e) => setAfter(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Classes</Label>
                  <div className="mt-1 grid grid-cols-3 gap-1.5 max-h-48 overflow-auto">
                    {classes.map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5 text-sm rounded p-1 hover:bg-accent/50 cursor-pointer">
                        <Checkbox
                          checked={classIds.has(c.id)}
                          onCheckedChange={(v) => setClassIds((s) => { const n = new Set(s); v ? n.add(c.id) : n.delete(c.id); return n; })}
                        />
                        Class {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="border-t pt-4">
          <Label htmlFor="break-after">Default break — after period (0 = none)</Label>
          <Input id="break-after" type="number" min={0} max={periods} value={defaultAfter} onChange={(e) => onDefaultChange(Number(e.target.value))} />
          <p className="text-xs text-muted-foreground mt-1">
            {defaultClasses.length === classes.length
              ? "Applies to every class."
              : defaultClasses.length === 0
                ? "Every class is in a custom break — this is unused."
                : `Applies to the ${defaultClasses.length} class${defaultClasses.length === 1 ? "" : "es"} not in a custom break.`}
          </p>
          <Button className="mt-3" onClick={onSaveDefault} disabled={!canSave}>Save default</Button>
        </div>
      </CardContent>
    </Card>
  );
}
