import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sparkles, Trash2, AlertTriangle } from "lucide-react";
import { DAY_NAMES, wouldExceedConsecutiveTeachingLimit } from "@/lib/schedule";
import { naturalCompare } from "@/lib/utils";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/timetable")({ component: TimetablePage });

type Klass = { id: string; name: string };
type Section = { id: string; class_id: string; section_name: string };
type Teacher = { id: string; name: string };
type Subject = { id: string; name: string };
type Room = { id: string; name: string };
type Allocation = { id: string; teacher_id: string; class_id: string; section_id: string; total_periods: number };
type AllocSubject = { allocation_id: string; subject_id: string; periods: number };
type Slot = { id: string; class_id: string; section_id: string; day: number; period: number; teacher_id: string; subject_id: string; room_id: string | null };

function TimetablePage() {
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle()).data });
  const classesQ = useQuery({ queryKey: ["classes"], queryFn: async () => (await supabase.from("classes").select("*").order("name")).data as Klass[] });
  const sectionsQ = useQuery({ queryKey: ["sections"], queryFn: async () => (await supabase.from("sections").select("*").order("section_name")).data as Section[] });
  const teachersQ = useQuery({ queryKey: ["teachers"], queryFn: async () => (await supabase.from("teachers").select("*").order("name")).data as Teacher[] });
  const subjectsQ = useQuery({ queryKey: ["subjects"], queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data as Subject[] });
  const roomsQ = useQuery({ queryKey: ["rooms"], queryFn: async () => (await supabase.from("rooms").select("*").order("name")).data as Room[] });
  const allocsQ = useQuery({ queryKey: ["teacher_allocations"], queryFn: async () => (await supabase.from("teacher_allocations").select("*")).data as Allocation[] });
  const allocSubsQ = useQuery({ queryKey: ["teacher_allocation_subjects"], queryFn: async () => (await supabase.from("teacher_allocation_subjects").select("*")).data as AllocSubject[] });
  const slotsQ = useQuery({ queryKey: ["timetable_slots"], queryFn: async () => (await supabase.from("timetable_slots").select("*")).data as Slot[] });

  const days = settingsQ.data?.working_days ?? 5;
  const periods = settingsQ.data?.periods_per_day ?? 6;

  const classes = [...(classesQ.data ?? [])].sort((a, b) => naturalCompare(a.name, b.name));
  const sections = sectionsQ.data ?? [];
  const teachers = teachersQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const rooms = roomsQ.data ?? [];
  const allocs = allocsQ.data ?? [];
  const allocSubs = allocSubsQ.data ?? [];
  const allSlots = slotsQ.data ?? [];

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const sectionsForClass = useMemo(() => sections.filter((s) => s.class_id === classId), [sections, classId]);
  const slots = useMemo(() => allSlots.filter((s) => s.section_id === sectionId), [allSlots, sectionId]);

  const slotMap = useMemo(() => {
    const m = new Map<string, Slot>();
    slots.forEach((s) => m.set(`${s.day}-${s.period}`, s));
    return m;
  }, [slots]);

  // teacher allocations for this section
  const sectionAllocs = useMemo(() => allocs.filter((a) => a.section_id === sectionId), [allocs, sectionId]);

  const [edit, setEdit] = useState<{ day: number; period: number } | null>(null);
  const [editTeacher, setEditTeacher] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editRoom, setEditRoom] = useState("");

  const openCell = (day: number, period: number) => {
    const existing = slotMap.get(`${day}-${period}`);
    setEdit({ day, period });
    setEditTeacher(existing?.teacher_id ?? "");
    setEditSubject(existing?.subject_id ?? "");
    setEditRoom(existing?.room_id ?? "");
  };

  const availableForTeacher = (teacherId: string) => {
    const a = sectionAllocs.find((x) => x.teacher_id === teacherId);
    if (!a) return [] as Subject[];
    const sids = new Set(allocSubs.filter((x) => x.allocation_id === a.id).map((x) => x.subject_id));
    return subjects.filter((s) => sids.has(s.id));
  };

  const exceedsTeacherConsecutiveLimit = (day: number, period: number, teacherId: string, ignoreSlotId?: string) => {
    const occupiedPeriods = allSlots
      .filter((s) => s.day === day && s.teacher_id === teacherId && s.id !== ignoreSlotId)
      .map((s) => s.period);
    return wouldExceedConsecutiveTeachingLimit(occupiedPeriods, period);
  };

  const checkConflicts = (day: number, period: number, teacherId: string, roomId: string, ignoreSlotId?: string) => {
    const conflicts: string[] = [];
    if (teacherId) {
      const c = allSlots.find((s) => s.day === day && s.period === period && s.teacher_id === teacherId && s.id !== ignoreSlotId && s.section_id !== sectionId);
      if (c) {
        const sec = sections.find((x) => x.id === c.section_id);
        const cls = classes.find((x) => x.id === c.class_id);
        conflicts.push(`Teacher already teaching ${cls?.name}/${sec?.section_name} at this time`);
      }
      if (exceedsTeacherConsecutiveLimit(day, period, teacherId, ignoreSlotId)) {
        conflicts.push("Teacher would teach more than 3 consecutive periods");
      }
    }
    if (roomId) {
      const c = allSlots.find((s) => s.day === day && s.period === period && s.room_id === roomId && s.id !== ignoreSlotId);
      if (c) {
        const sec = sections.find((x) => x.id === c.section_id);
        const cls = classes.find((x) => x.id === c.class_id);
        if (c.section_id !== sectionId) conflicts.push(`Room already used by ${cls?.name}/${sec?.section_name} at this time`);
      }
    }
    return conflicts;
  };

  const saveCell = async () => {
    if (!edit) return;
    if (!editTeacher || !editSubject) return toast.error("Pick teacher and subject");
    const existing = slotMap.get(`${edit.day}-${edit.period}`);

    // Validate allocation usage (R4)
    const a = sectionAllocs.find((x) => x.teacher_id === editTeacher);
    if (!a) return toast.error("This teacher has no allocation for this section.");
    const used = slots.filter((s) => s.teacher_id === editTeacher && s.id !== existing?.id).length;
    if (used + 1 > a.total_periods) {
      return toast.error(`Cannot save: teacher would have ${used + 1} periods but only ${a.total_periods} allocated.`);
    }

    if (exceedsTeacherConsecutiveLimit(edit.day, edit.period, editTeacher, existing?.id)) {
      return toast.error("Cannot save: a teacher must take a break after 3 consecutive periods.");
    }

    const conflicts = checkConflicts(edit.day, edit.period, editTeacher, editRoom, existing?.id);
    if (conflicts.length && !confirm("Conflicts detected:\n• " + conflicts.join("\n• ") + "\n\nSave anyway?")) return;

    const payload = {
      class_id: classId,
      section_id: sectionId,
      day: edit.day,
      period: edit.period,
      teacher_id: editTeacher,
      subject_id: editSubject,
      room_id: editRoom || null,
    };
    const { error } = existing
      ? await supabase.from("timetable_slots").update(payload).eq("id", existing.id)
      : await supabase.from("timetable_slots").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_slots"] });
  };

  const clearCell = async () => {
    if (!edit) return;
    const existing = slotMap.get(`${edit.day}-${edit.period}`);
    if (!existing) { setEdit(null); return; }
    await supabase.from("timetable_slots").delete().eq("id", existing.id);
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_slots"] });
    toast.success("Cleared");
  };

  const autoGenerate = async () => {
    if (!sectionId) return;
    if (slots.length > 0 && !confirm("This will overwrite the current timetable for this section. Continue?")) return;

    // build needs from allocations
    type Need = { teacher_id: string; subject_id: string; remaining: number };
    const needs: Need[] = [];
    sectionAllocs.forEach((a) => {
      allocSubs.filter((x) => x.allocation_id === a.id).forEach((x) => {
        needs.push({ teacher_id: a.teacher_id, subject_id: x.subject_id, remaining: x.periods });
      });
    });

    const totalNeed = needs.reduce((s, n) => s + n.remaining, 0);
    const cap = days * periods;
    if (totalNeed > cap) return toast.error(`Need ${totalNeed} slots but only ${cap} available.`);

    // delete existing for this section first
    await supabase.from("timetable_slots").delete().eq("section_id", sectionId);
    const otherSlots = allSlots.filter((s) => s.section_id !== sectionId);

    const placed: Omit<Slot, "id">[] = [];
    const teacherBusy = new Set(otherSlots.map((s) => `${s.day}-${s.period}-${s.teacher_id}`));
    const roomBusy = new Set(otherSlots.filter((s) => s.room_id).map((s) => `${s.day}-${s.period}-${s.room_id}`));
    const teacherPeriods = new Map<string, Set<number>>();
    otherSlots.forEach((s) => {
      const key = `${s.day}-${s.teacher_id}`;
      const occupied = teacherPeriods.get(key) ?? new Set<number>();
      occupied.add(s.period);
      teacherPeriods.set(key, occupied);
    });

    for (let d = 1; d <= days; d++) {
      const subjectsToday = new Set<string>();
      for (let p = 1; p <= periods; p++) {
        // pick need with most remaining whose teacher is free and subject not yet today (if possible)
        const candidates = needs
          .filter((n) => {
            if (n.remaining <= 0 || teacherBusy.has(`${d}-${p}-${n.teacher_id}`)) return false;
            const occupied = teacherPeriods.get(`${d}-${n.teacher_id}`) ?? [];
            return !wouldExceedConsecutiveTeachingLimit(occupied, p);
          })
          .sort((a, b) => b.remaining - a.remaining);
        const pick = candidates.find((n) => !subjectsToday.has(n.subject_id)) || candidates[0];
        if (!pick) continue;
        // assign free room if available
        const freeRoom = rooms.find((r) => !roomBusy.has(`${d}-${p}-${r.id}`));
        const newSlot = { class_id: classId, section_id: sectionId, day: d, period: p, teacher_id: pick.teacher_id, subject_id: pick.subject_id, room_id: freeRoom?.id ?? null };
        placed.push(newSlot);
        teacherBusy.add(`${d}-${p}-${pick.teacher_id}`);
        const teacherDayKey = `${d}-${pick.teacher_id}`;
        const occupied = teacherPeriods.get(teacherDayKey) ?? new Set<number>();
        occupied.add(p);
        teacherPeriods.set(teacherDayKey, occupied);
        if (freeRoom) roomBusy.add(`${d}-${p}-${freeRoom.id}`);
        subjectsToday.add(pick.subject_id);
        pick.remaining -= 1;
      }
    }
    const unplaced = needs.reduce((s, n) => s + n.remaining, 0);
    if (placed.length) {
      const { error } = await supabase.from("timetable_slots").insert(placed);
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["timetable_slots"] });
    if (unplaced > 0) toast.warning(`Generated ${placed.length} slots. ${unplaced} periods could not be placed (teacher conflicts, break rule, or capacity).`);
    else toast.success(`Generated ${placed.length} slots.`);
  };

  const clearAll = async () => {
    if (!confirm("Clear entire timetable for this section?")) return;
    await supabase.from("timetable_slots").delete().eq("section_id", sectionId);
    qc.invalidateQueries({ queryKey: ["timetable_slots"] });
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Weekly Timetable"
        description="Build the timetable for a class/section. Conflicts and over-allocation are blocked."
      />

      <div className="flex flex-wrap gap-3 items-end mb-6">
        <div>
          <Label className="text-xs">Class</Label>
          <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId(""); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Section</Label>
          <Select value={sectionId} onValueChange={setSectionId} disabled={!classId}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Select section" /></SelectTrigger>
            <SelectContent>{sectionsForClass.map((s) => <SelectItem key={s.id} value={s.id}>{s.section_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {sectionId && (
          <>
            <Button variant="default" onClick={autoGenerate}><Sparkles className="h-4 w-4 mr-2" />Auto-generate</Button>
            <Button variant="outline" onClick={clearAll}><Trash2 className="h-4 w-4 mr-2" />Clear all</Button>
          </>
        )}
      </div>

      {sectionId && (
        <>
          <Card>
            <CardContent className="p-0 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="p-2 text-left border-b w-24">Day</th>
                    {Array.from({ length: periods }).map((_, i) => (
                      <th key={i} className="p-2 text-left border-b border-l">Period {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: days }).map((_, di) => {
                    const day = di + 1;
                    return (
                      <tr key={day}>
                        <td className="p-2 font-medium border-b bg-muted/30">{DAY_NAMES[day]}</td>
                        {Array.from({ length: periods }).map((_, pi) => {
                          const period = pi + 1;
                          const s = slotMap.get(`${day}-${period}`);
                          const conflicts = s ? checkConflicts(day, period, s.teacher_id, s.room_id ?? "", s.id) : [];
                          return (
                            <td
                              key={period}
                              className={`p-2 border-b border-l align-top cursor-pointer hover:bg-accent/40 min-w-32 ${conflicts.length ? "bg-destructive/10" : ""}`}
                              onClick={() => openCell(day, period)}
                              title={conflicts.join("; ")}
                            >
                              {s ? (
                                <div className="space-y-0.5">
                                  <div className="font-medium text-xs">{subjects.find((x) => x.id === s.subject_id)?.name}</div>
                                  <div className="text-xs text-muted-foreground">{teachers.find((x) => x.id === s.teacher_id)?.name}</div>
                                  {s.room_id && <div className="text-[10px] text-muted-foreground">{rooms.find((r) => r.id === s.room_id)?.name}</div>}
                                  {conflicts.length > 0 && <AlertTriangle className="h-3 w-3 text-destructive" />}
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground/60">+</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader><CardTitle className="text-base">Allocation usage for this section</CardTitle></CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {sectionAllocs.length === 0 && <p className="text-sm text-muted-foreground">No allocations for this section.</p>}
                {sectionAllocs.map((a) => {
                  const used = slots.filter((s) => s.teacher_id === a.teacher_id).length;
                  const tn = teachers.find((t) => t.id === a.teacher_id)?.name;
                  const over = used > a.total_periods;
                  return (
                    <div key={a.id} className={`p-3 rounded-md border text-sm ${over ? "border-destructive bg-destructive/5" : ""}`}>
                      <div className="font-medium">{tn}</div>
                      <div className="text-muted-foreground">{used} / {a.total_periods} periods used</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit && `${DAY_NAMES[edit.day]} · Period ${edit.period}`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Teacher (must have allocation in this section)</Label>
              <Select value={editTeacher} onValueChange={(v) => { setEditTeacher(v); setEditSubject(""); }}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  {sectionAllocs.length === 0 && <div className="p-2 text-sm text-muted-foreground">No allocations for this section.</div>}
                  {sectionAllocs.map((a) => {
                    const t = teachers.find((x) => x.id === a.teacher_id);
                    return t ? <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem> : null;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Select value={editSubject} onValueChange={setEditSubject} disabled={!editTeacher}>
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>{availableForTeacher(editTeacher).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Room (optional)</Label>
              <Select value={editRoom} onValueChange={setEditRoom}>
                <SelectTrigger><SelectValue placeholder="No room" /></SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={clearCell}>Clear</Button>
            <Button onClick={saveCell}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
