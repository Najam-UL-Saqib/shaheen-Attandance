import { describe, it, expect } from "vitest";
import { computeTimetableWarnings, type WarningInput } from "./timetable-warnings";

const base = (): WarningInput => ({
  classes: [{ id: "c1", name: "1" }],
  sections: [{ id: "s1", class_id: "c1", section_name: "A", class_teacher_id: "t1" }],
  subjects: [{ id: "sub1", name: "Maths" }, { id: "sub2", name: "English" }],
  teachers: [{ id: "t1", name: "Ms Khan" }],
  allocations: [{ id: "a1", teacher_id: "t1", section_id: "s1", total_periods: 2 }],
  allocationSubjects: [{ allocation_id: "a1", subject_id: "sub1", periods: 2 }],
  slots: [
    { section_id: "s1", teacher_id: "t1", subject_id: "sub1", room_id: null, day: 1, period: 1, group_id: null },
    { section_id: "s1", teacher_id: "t1", subject_id: "sub1", room_id: null, day: 1, period: 2, group_id: null },
  ],
  games: [],
  workingDays: 1,
  periodsPerDay: 2,
  maxConsecutive: 3,
});

describe("computeTimetableWarnings", () => {
  it("a fully consistent single-section week has no workload/coverage/gap errors", () => {
    const w = computeTimetableWarnings(base());
    expect(w.find((x) => x.category === "Teacher over-booked")).toBeUndefined();
    expect(w.find((x) => x.category === "Teacher under-filled")).toBeUndefined();
    expect(w.find((x) => x.category === "Subject short of periods")).toBeUndefined();
    expect(w.find((x) => x.category === "Empty periods")).toBeUndefined();
  });

  it("flags an over-booked teacher", () => {
    const inp = base();
    inp.slots.push({ section_id: "s1", teacher_id: "t1", subject_id: "sub1", room_id: null, day: 1, period: 3, group_id: null });
    inp.periodsPerDay = 3;
    const w = computeTimetableWarnings(inp);
    const over = w.find((x) => x.category === "Teacher over-booked");
    expect(over?.severity).toBe("error");
    expect(over?.title).toContain("Ms Khan");
  });

  it("flags a subject short of its allocated periods", () => {
    const inp = base();
    inp.slots = [inp.slots[0]]; // only 1 of 2 Maths periods
    inp.allocations[0].total_periods = 1;
    const w = computeTimetableWarnings(inp);
    const short = w.find((x) => x.category === "Subject short of periods");
    expect(short?.title).toMatch(/1 of 2/);
  });

  it("counts a combined lesson once for the teacher (no false over-booking)", () => {
    const inp = base();
    inp.sections.push({ id: "s2", class_id: "c1", section_name: "B", class_teacher_id: "t1" });
    inp.allocations = [
      { id: "a1", teacher_id: "t1", section_id: "s1", total_periods: 1 },
      { id: "a2", teacher_id: "t1", section_id: "s2", total_periods: 1 },
    ];
    inp.allocationSubjects = [
      { allocation_id: "a1", subject_id: "sub1", periods: 1 },
      { allocation_id: "a2", subject_id: "sub1", periods: 1 },
    ];
    inp.slots = [
      { section_id: "s1", teacher_id: "t1", subject_id: "sub1", room_id: null, day: 1, period: 1, group_id: "g1" },
      { section_id: "s2", teacher_id: "t1", subject_id: "sub1", room_id: null, day: 1, period: 1, group_id: "g1" },
    ];
    inp.periodsPerDay = 1;
    const w = computeTimetableWarnings(inp);
    expect(w.find((x) => x.category === "Teacher over-booked")).toBeUndefined();
    expect(w.find((x) => x.category === "Teacher double-booked")).toBeUndefined();
  });

  it("flags a real teacher double-booking across two sections", () => {
    const inp = base();
    inp.sections.push({ id: "s2", class_id: "c1", section_name: "B", class_teacher_id: "t1" });
    inp.slots.push({ section_id: "s2", teacher_id: "t1", subject_id: "sub1", room_id: null, day: 1, period: 1, group_id: null });
    const w = computeTimetableWarnings(inp);
    expect(w.find((x) => x.category === "Teacher double-booked")?.severity).toBe("error");
  });

  it("flags empty periods and missing class teacher", () => {
    const inp = base();
    inp.periodsPerDay = 4; // slots only fill 2
    inp.sections[0].class_teacher_id = null;
    const w = computeTimetableWarnings(inp);
    expect(w.find((x) => x.category === "Empty periods")?.title).toMatch(/2 empty periods/);
    expect(w.find((x) => x.category === "No class teacher")).toBeDefined();
  });
});
