import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { dateToDay, wouldExceedConsecutiveTeachingLimit } from "@/lib/schedule";
import { naturalCompare } from "@/lib/utils";

export const Route = createFileRoute("/day-view")({ component: DayViewPage });

type Klass = { id: string; name: string };
type Section = { id: string; class_id: string; section_name: string };
type Teacher = { id: string; name: string };
type Subject = { id: string; name: string };
type Room = { id: string; name: string };
type ClassSubject = { class_id: string; subject_id: string };
type Slot = { class_id: string; section_id: string; day: number; period: number; teacher_id: string; subject_id: string; room_id: string | null };
type Override = {
  id: string;
  date: string;
  class_id: string;
  section_id: string;
  period: number;
  teacher_id: string | null;
  subject_id: string | null;
  room_id: string | null;
};

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function DayViewPage() {
  const qc = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(todayStr());

  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle()).data });
  const classesQ = useQuery({ queryKey: ["classes"], queryFn: async () => (await supabase.from("classes").select("*").order("name")).data as Klass[] });
  const sectionsQ = useQuery({ queryKey: ["sections"], queryFn: async () => (await supabase.from("sections").select("*").order("section_name")).data as Section[] });
  const teachersQ = useQuery({ queryKey: ["teachers"], queryFn: async () => (await supabase.from("teachers").select("*").order("name")).data as Teacher[] });
  const subjectsQ = useQuery({ queryKey: ["subjects"], queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data as Subject[] });
  const roomsQ = useQuery({ queryKey: ["rooms"], queryFn: async () => (await supabase.from("rooms").select("*").order("name")).data as Room[] });
  const csQ = useQuery({ queryKey: ["class_subjects"], queryFn: async () => (await supabase.from("class_subjects").select("*")).data as ClassSubject[] });
  const allSlotsQ = useQuery({ queryKey: ["timetable_slots"], queryFn: async () => (await supabase.from("timetable_slots").select("*")).data as Slot[] });
  const overridesQ = useQuery({
    queryKey: ["timetable_day_overrides", selectedDate],
    queryFn: async () => (await supabase.from("timetable_day_overrides").select("*").eq("date", selectedDate)).data as Override[],
  });

  const periods = settingsQ.data?.periods_per_day ?? 6;
  const classes = classesQ.data ?? [];
  const sections = sectionsQ.data ?? [];
  const teachers = teachersQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const rooms = roomsQ.data ?? [];
  const cs = csQ.data ?? [];
  const allSlots = allSlotsQ.data ?? [];
  const overrides = overridesQ.data ?? [];

  const weekday = useMemo(() => dateToDay(selectedDate), [selectedDate]);

  const classSectionRows = useMemo(() => {
    return sections
      .map((sec) => ({ sec, klass: classes.find((c) => c.id === sec.class_id) }))
      .filter((r) => r.klass)
      .sort((a, b) => naturalCompare(a.klass!.name, b.klass!.name) || naturalCompare(a.sec.section_name, b.sec.section_name));
  }, [sections, classes]);

  const overrideMap = useMemo(() => {
    const m = new Map<string, Override>();
    overrides.forEach((o) => m.set(`${o.section_id}-${o.period}`, o));
    return m;
  }, [overrides]);

  const defaultSlotMap = useMemo(() => {
    const m = new Map<string, Slot>();
    allSlots.filter((s) => s.day === weekday).forEach((s) => m.set(`${s.section_id}-${s.period}`, s));
    return m;
  }, [allSlots, weekday]);

  type Effective = {
    source: "override" | "default" | "empty";
    overrideId: string | null;
    teacherId: string | null;
    subjectId: string | null;
    roomId: string | null;
  };

  const getEffective = (sectionId: string, period: number): Effective => {
    const ov = overrideMap.get(`${sectionId}-${period}`);
    if (ov) return { source: "override", overrideId: ov.id, teacherId: ov.teacher_id, subjectId: ov.subject_id, roomId: ov.room_id };
    const def = defaultSlotMap.get(`${sectionId}-${period}`);
    if (def) return { source: "default", overrideId: null, teacherId: def.teacher_id, subjectId: def.subject_id, roomId: def.room_id };
    return { source: "empty", overrideId: null, teacherId: null, subjectId: null, roomId: null };
  };

  const periodsForTeacherOnDate = (teacherId: string, excludeSectionId?: string, excludePeriod?: number): number[] => {
    const result: number[] = [];
    for (const sec of sections) {
      for (let p = 1; p <= periods; p++) {
        if (sec.id === excludeSectionId && p === excludePeriod) continue;
        const eff = getEffective(sec.id, p);
        if (eff.teacherId === teacherId) result.push(p);
      }
    }
    return result;
  };

  const [edit, setEdit] = useState<{ sectionId: string; classId: string; period: number } | null>(null);
  const [editTeacher, setEditTeacher] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editRoom, setEditRoom] = useState("");

  const openCell = (sectionId: string, classId: string, period: number) => {
    const eff = getEffective(sectionId, period);
    setEdit({ sectionId, classId, period });
    setEditTeacher(eff.teacherId ?? "");
    setEditSubject(eff.subjectId ?? "");
    setEditRoom(eff.roomId ?? "");
  };

  const subjectsForClass = useMemo(() => {
    if (!edit) return [] as Subject[];
    const ids = new Set(cs.filter((x) => x.class_id === edit.classId).map((x) => x.subject_id));
    return subjects.filter((s) => ids.has(s.id));
  }, [cs, subjects, edit]);

  const currentOverride = edit ? overrideMap.get(`${edit.sectionId}-${edit.period}`) : undefined;

  const saveCell = async () => {
    if (!edit) return;
    if (!editTeacher || !editSubject) return toast.error("Pick teacher and subject");

    const otherPeriods = periodsForTeacherOnDate(editTeacher, edit.sectionId, edit.period);
    if (wouldExceedConsecutiveTeachingLimit(otherPeriods, edit.period)) {
      return toast.error("Cannot save: a teacher must take a break after 3 consecutive periods.");
    }

    const conflicts: string[] = [];
    for (const sec of sections) {
      if (sec.id === edit.sectionId) continue;
      const eff = getEffective(sec.id, edit.period);
      const cls = classes.find((c) => c.id === sec.class_id);
      if (eff.teacherId === editTeacher) conflicts.push(`Teacher already teaching ${cls?.name}/${sec.section_name} at this period on this date`);
      if (editRoom && eff.roomId === editRoom) conflicts.push(`Room already used by ${cls?.name}/${sec.section_name} at this period on this date`);
    }
    if (conflicts.length && !confirm("Conflicts detected:\n• " + conflicts.join("\n• ") + "\n\nSave anyway?")) return;

    const payload = {
      date: selectedDate,
      class_id: edit.classId,
      section_id: edit.sectionId,
      period: edit.period,
      teacher_id: editTeacher,
      subject_id: editSubject,
      room_id: editRoom || null,
    };
    const { error } = await supabase.from("timetable_day_overrides").upsert(payload, { onConflict: "section_id,date,period" });
    if (error) return toast.error(error.message);
    toast.success("Saved for this date");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const markFree = async () => {
    if (!edit) return;
    const payload = {
      date: selectedDate,
      class_id: edit.classId,
      section_id: edit.sectionId,
      period: edit.period,
      teacher_id: null,
      subject_id: null,
      room_id: null,
    };
    const { error } = await supabase.from("timetable_day_overrides").upsert(payload, { onConflict: "section_id,date,period" });
    if (error) return toast.error(error.message);
    toast.success("Marked free for this date");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const resetCell = async () => {
    if (!edit || !currentOverride) { setEdit(null); return; }
    const { error } = await supabase.from("timetable_day_overrides").delete().eq("id", currentOverride.id);
    if (error) return toast.error(error.message);
    toast.success("Reset to default");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  const resetDay = async () => {
    if (!confirm(`Reset ${selectedDate} to the default weekly timetable for all classes?`)) return;
    const { error } = await supabase.from("timetable_day_overrides").delete().eq("date", selectedDate);
    if (error) return toast.error(error.message);
    toast.success("Day reset to default");
    qc.invalidateQueries({ queryKey: ["timetable_day_overrides", selectedDate] });
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Day View"
        description="Timetable for a specific date across all classes. Substitute a teacher without changing the default weekly schedule."
      />

      <div className="flex flex-wrap gap-3 items-end mb-6">
        <div>
          <Label className="text-xs">Date</Label>
          <Input type="date" className="w-44" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>
        <Button variant="outline" onClick={resetDay}><RotateCcw className="h-4 w-4 mr-2" />Reset day to default</Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="p-2 text-left border-b sticky left-0 bg-muted/50 z-10 w-40">Class / Section</th>
                {Array.from({ length: periods }).map((_, i) => (
                  <th key={i} className="p-2 text-left border-b border-l whitespace-nowrap">Period {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classSectionRows.map(({ sec, klass }) => (
                <tr key={sec.id}>
                  <td className="p-2 font-medium border-b sticky left-0 bg-card z-10">{klass!.name} – {sec.section_name}</td>
                  {Array.from({ length: periods }).map((_, pi) => {
                    const period = pi + 1;
                    const eff = getEffective(sec.id, period);
                    return (
                      <td
                        key={period}
                        className={`p-2 border-b border-l align-top cursor-pointer hover:bg-accent/40 min-w-32 ${eff.source === "override" ? "border-l-2 border-l-amber-500 bg-amber-500/5" : ""}`}
                        onClick={() => openCell(sec.id, klass!.id, period)}
                      >
                        {eff.source === "empty" ? (
                          <div className="text-xs text-muted-foreground/60">+</div>
                        ) : eff.teacherId ? (
                          <div className="space-y-0.5">
                            <div className="font-medium text-xs">{subjects.find((x) => x.id === eff.subjectId)?.name}</div>
                            <div className="text-xs text-muted-foreground">{teachers.find((x) => x.id === eff.teacherId)?.name}</div>
                            {eff.roomId && <div className="text-[10px] text-muted-foreground">{rooms.find((r) => r.id === eff.roomId)?.name}</div>}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic">Free</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edit && `${classes.find((c) => c.id === edit.classId)?.name} / ${sections.find((s) => s.id === edit.sectionId)?.section_name} · Period ${edit.period}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {currentOverride ? "This period has a substitution for this date only." : "Currently using the default weekly schedule."}
            </p>
            <div>
              <Label>Teacher</Label>
              <Select value={editTeacher} onValueChange={(v) => { setEditTeacher(v); setEditSubject(""); }}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Select value={editSubject} onValueChange={setEditSubject}>
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>{subjectsForClass.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Room (optional)</Label>
              <Select value={editRoom} onValueChange={setEditRoom}>
                <SelectTrigger><SelectValue placeholder="No room" /></SelectTrigger>
                <SelectContent>{rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="ghost" onClick={markFree}>Mark as free</Button>
            <Button variant="ghost" disabled={!currentOverride} onClick={resetCell}>Reset to default</Button>
            <Button onClick={saveCell}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
