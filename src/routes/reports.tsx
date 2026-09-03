import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout, PageHeader } from "@/components/admin-layout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useMemo } from "react";
import { naturalCompare } from "@/lib/utils";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

type Klass = { id: string; name: string };
type Section = { id: string; class_id: string; section_name: string; class_teacher_id: string | null };
type Subject = { id: string; name: string };
type Teacher = { id: string; name: string };
type Allocation = { id: string; teacher_id: string; class_id: string; section_id: string; total_periods: number };
type AllocSubject = { allocation_id: string; subject_id: string; periods: number };
type Slot = { class_id: string; section_id: string; teacher_id: string; subject_id: string };
type GameAssignment = { section_id: string };

function ReportsPage() {
  const classesQ = useQuery({ queryKey: ["classes"], queryFn: async () => (await supabase.from("classes").select("*").order("name")).data as Klass[] });
  const sectionsQ = useQuery({ queryKey: ["sections"], queryFn: async () => (await supabase.from("sections").select("*").order("section_name")).data as Section[] });
  const subjectsQ = useQuery({ queryKey: ["subjects"], queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data as Subject[] });
  const teachersQ = useQuery({ queryKey: ["teachers"], queryFn: async () => (await supabase.from("teachers").select("*").order("name")).data as Teacher[] });
  const allocsQ = useQuery({ queryKey: ["teacher_allocations"], queryFn: async () => (await supabase.from("teacher_allocations").select("*")).data as Allocation[] });
  const allocSubsQ = useQuery({ queryKey: ["teacher_allocation_subjects"], queryFn: async () => (await supabase.from("teacher_allocation_subjects").select("*")).data as AllocSubject[] });
  const slotsQ = useQuery({ queryKey: ["timetable_slots"], queryFn: async () => (await supabase.from("timetable_slots").select("class_id,section_id,teacher_id,subject_id")).data as Slot[] });
  const gamesQ = useQuery({ queryKey: ["game_period_assignments"], queryFn: async () => (await supabase.from("game_period_assignments").select("section_id")).data as GameAssignment[] });

  const classes = classesQ.data ?? [];
  const sections = sectionsQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const teachers = teachersQ.data ?? [];
  const allocs = allocsQ.data ?? [];
  const allocSubs = allocSubsQ.data ?? [];
  const slots = slotsQ.data ?? [];
  const games = gamesQ.data ?? [];

  // Table A: (class-section) × subject
  const classSectionRows = useMemo(() => {
    return sections
      .map((sec) => ({ sec, klass: classes.find((c) => c.id === sec.class_id) }))
      .filter((r) => r.klass)
      .sort((a, b) => naturalCompare(a.klass!.name, b.klass!.name) || naturalCompare(a.sec.section_name, b.sec.section_name));
  }, [sections, classes]);

  const cellA = (sectionId: string, classId: string, subjectId: string) => {
    // find allocation row in this section that has this subject mapped
    const matches = allocs.filter((a) => a.section_id === sectionId).filter((a) => allocSubs.some((x) => x.allocation_id === a.id && x.subject_id === subjectId));
    if (matches.length === 0) return null;
    return matches.map((a) => {
      const teacher = teachers.find((t) => t.id === a.teacher_id);
      const allocated = allocSubs.find((x) => x.allocation_id === a.id && x.subject_id === subjectId)?.periods ?? 0;
      const used = slots.filter((s) => s.section_id === sectionId && s.teacher_id === a.teacher_id && s.subject_id === subjectId).length;
      return { name: teacher?.name ?? "?", allocated, used };
    });
  };

  // per-section totals (subjects only) + game periods
  const sectionTotals = (sectionId: string) => {
    const secAllocIds = new Set(allocs.filter((a) => a.section_id === sectionId).map((a) => a.id));
    const allocated = allocSubs.filter((x) => secAllocIds.has(x.allocation_id)).reduce((sum, x) => sum + x.periods, 0);
    const used = slots.filter((s) => s.section_id === sectionId).length;
    const gamePeriods = games.filter((g) => g.section_id === sectionId).length;
    return { allocated, used, gamePeriods };
  };

  // per-teacher totals for Table B
  const teacherTotals = (teacherId: string) => {
    const allocated = allocs.filter((a) => a.teacher_id === teacherId).reduce((sum, a) => sum + a.total_periods, 0);
    const used = slots.filter((s) => s.teacher_id === teacherId).length;
    return { allocated, used };
  };

  return (
    <AdminLayout>
      <PageHeader title="Reports" description="Allocation vs timetable usage across classes and teachers." />

      <Tabs defaultValue="A">
        <TabsList>
          <TabsTrigger value="A">Class/Section × Subject</TabsTrigger>
          <TabsTrigger value="B">Teacher × Class/Section</TabsTrigger>
        </TabsList>

        <TabsContent value="A">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full border-collapse text-sm table-fixed">
                <thead>
                  <tr className="bg-muted/50 align-bottom">
                    <th className="p-2 text-left border-b w-40">Class / Section</th>
                    {subjects.map((s) => (
                      <th key={s.id} className="border-b border-l p-1" title={s.name}>
                        <div className="mx-auto [writing-mode:vertical-rl] rotate-180 whitespace-nowrap text-xs font-medium py-1">
                          {s.name}
                        </div>
                      </th>
                    ))}
                    <th className="border-b border-l p-1 bg-muted/70" title="Game / PT periods">
                      <div className="mx-auto [writing-mode:vertical-rl] rotate-180 whitespace-nowrap text-xs font-medium py-1">Games</div>
                    </th>
                    <th className="border-b border-l p-1 bg-muted/70">
                      <div className="mx-auto [writing-mode:vertical-rl] rotate-180 whitespace-nowrap text-xs font-medium py-1">Total</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {classSectionRows.map(({ sec, klass }) => {
                    const totals = sectionTotals(sec.id);
                    const classTeacher = teachers.find((t) => t.id === sec.class_teacher_id)?.name;
                    return (
                      <tr key={sec.id} className="hover:bg-muted/30">
                        <td className="p-2 border-b w-40">
                          <div className="font-medium">{klass!.name} – {sec.section_name}</div>
                          {classTeacher && <div className="text-[11px] text-muted-foreground truncate">{classTeacher}</div>}
                        </td>
                        {subjects.map((sub) => {
                          const data = cellA(sec.id, klass!.id, sub.id);
                          if (!data) {
                            return <td key={sub.id} className="border-b border-l text-center text-muted-foreground/30">—</td>;
                          }
                          const used = data.reduce((n, d) => n + d.used, 0);
                          const allocated = data.reduce((n, d) => n + d.allocated, 0);
                          const title = data
                            .map((d) => `${d.name}: ${d.used}${d.used !== d.allocated ? ` (allocated ${d.allocated})` : ""}`)
                            .join(" · ");
                          return (
                            <td
                              key={sub.id}
                              title={title}
                              className={`border-b border-l text-center tabular-nums ${used !== allocated ? "text-destructive font-medium" : ""}`}
                            >
                              {used}
                            </td>
                          );
                        })}
                        <td className="border-b border-l text-center tabular-nums bg-muted/20">
                          {totals.gamePeriods > 0 ? totals.gamePeriods : <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className={`border-b border-l text-center tabular-nums font-semibold bg-muted/20 ${totals.used !== totals.allocated ? "text-destructive" : ""}`}>
                          {totals.used}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-3 text-xs text-muted-foreground border-t">
                Each cell = weekly periods assigned for that subject. <b>Total</b> = assigned periods for the section
                (subjects only; game periods are the separate column). A red number means the timetable count doesn&apos;t
                match the allocation — hover for detail.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="B">
          <Card>
            <CardContent className="p-0 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="p-2 text-left border-b sticky left-0 bg-muted/50 z-10">Teacher</th>
                    {classSectionRows.map(({ sec, klass }) => (
                      <th key={sec.id} className="p-2 text-left border-b border-l whitespace-nowrap">{klass!.name} – {sec.section_name}</th>
                    ))}
                    <th className="p-2 text-center border-b border-l whitespace-nowrap bg-muted/70">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => {
                    const totals = teacherTotals(t.id);
                    return (
                      <tr key={t.id}>
                        <td className="p-2 font-medium border-b sticky left-0 bg-card z-10">{t.name}</td>
                        {classSectionRows.map(({ sec }) => {
                          const a = allocs.find((x) => x.teacher_id === t.id && x.section_id === sec.id);
                          if (!a) return <td key={sec.id} className="p-2 border-b border-l text-muted-foreground/40">—</td>;
                          const used = slots.filter((s) => s.teacher_id === t.id && s.section_id === sec.id).length;
                          return (
                            <td key={sec.id} className="p-2 border-b border-l whitespace-nowrap">
                              <span className={used > a.total_periods ? "text-destructive font-medium" : ""}>{a.total_periods} / {used}</span>
                            </td>
                          );
                        })}
                        <td className="p-2 border-b border-l text-center bg-muted/20 whitespace-nowrap">
                          <span className={`font-medium ${totals.used > totals.allocated ? "text-destructive" : ""}`}>
                            {totals.allocated} / {totals.used}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-3 text-xs text-muted-foreground border-t">
                Format: <b>Allocated / Used in timetable</b>. <b>Total</b> is the teacher's weekly workload across all class/sections.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
