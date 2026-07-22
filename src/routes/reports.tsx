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
type Section = { id: string; class_id: string; section_name: string };
type Subject = { id: string; name: string };
type Teacher = { id: string; name: string };
type Allocation = { id: string; teacher_id: string; class_id: string; section_id: string; total_periods: number };
type AllocSubject = { allocation_id: string; subject_id: string; periods: number };
type Slot = { class_id: string; section_id: string; teacher_id: string; subject_id: string };

function ReportsPage() {
  const classesQ = useQuery({ queryKey: ["classes"], queryFn: async () => (await supabase.from("classes").select("*").order("name")).data as Klass[] });
  const sectionsQ = useQuery({ queryKey: ["sections"], queryFn: async () => (await supabase.from("sections").select("*").order("section_name")).data as Section[] });
  const subjectsQ = useQuery({ queryKey: ["subjects"], queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data as Subject[] });
  const teachersQ = useQuery({ queryKey: ["teachers"], queryFn: async () => (await supabase.from("teachers").select("*").order("name")).data as Teacher[] });
  const allocsQ = useQuery({ queryKey: ["teacher_allocations"], queryFn: async () => (await supabase.from("teacher_allocations").select("*")).data as Allocation[] });
  const allocSubsQ = useQuery({ queryKey: ["teacher_allocation_subjects"], queryFn: async () => (await supabase.from("teacher_allocation_subjects").select("*")).data as AllocSubject[] });
  const slotsQ = useQuery({ queryKey: ["timetable_slots"], queryFn: async () => (await supabase.from("timetable_slots").select("class_id,section_id,teacher_id,subject_id")).data as Slot[] });

  const classes = classesQ.data ?? [];
  const sections = sectionsQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const teachers = teachersQ.data ?? [];
  const allocs = allocsQ.data ?? [];
  const allocSubs = allocSubsQ.data ?? [];
  const slots = slotsQ.data ?? [];

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
            <CardContent className="p-0 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="p-2 text-left border-b sticky left-0 bg-muted/50 z-10">Class / Section</th>
                    {subjects.map((s) => <th key={s.id} className="p-2 text-left border-b border-l whitespace-nowrap">{s.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {classSectionRows.map(({ sec, klass }) => (
                    <tr key={sec.id}>
                      <td className="p-2 font-medium border-b sticky left-0 bg-card z-10">{klass!.name} – {sec.section_name}</td>
                      {subjects.map((sub) => {
                        const data = cellA(sec.id, klass!.id, sub.id);
                        return (
                          <td key={sub.id} className="p-2 border-b border-l align-top whitespace-nowrap">
                            {data ? data.map((d, i) => (
                              <div key={i} className="text-xs">
                                <div className="font-medium">{d.name}</div>
                                <div className={d.used > d.allocated ? "text-destructive" : "text-muted-foreground"}>{d.allocated} / {d.used}</div>
                              </div>
                            )) : <span className="text-muted-foreground/40">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-3 text-xs text-muted-foreground border-t">Format: <b>Allocated / Used in timetable</b></div>
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
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-3 text-xs text-muted-foreground border-t">Format: <b>Allocated / Used in timetable</b></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
