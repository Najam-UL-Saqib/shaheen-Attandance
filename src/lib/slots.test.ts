import { describe, it, expect } from "vitest";
import { countTeacherPeriods, countSectionPeriods, type GroupedSlot } from "./slots";

const row = (p: Partial<GroupedSlot>): GroupedSlot => ({
  group_id: null, section_id: "s1", day: 1, period: 1, ...p,
});

describe("countTeacherPeriods", () => {
  it("counts ungrouped rows individually", () => {
    expect(countTeacherPeriods([row({ period: 1 }), row({ period: 2 }), row({ period: 3 })])).toBe(3);
  });

  it("collapses a combined lesson (one group_id across sections) to one period", () => {
    const combined = [
      row({ group_id: "g1", section_id: "9A", period: 4 }),
      row({ group_id: "g1", section_id: "9B", period: 4 }),
    ];
    expect(countTeacherPeriods(combined)).toBe(1);
  });

  it("adds combined and non-combined periods", () => {
    const rows = [
      row({ period: 1 }),
      row({ group_id: "g1", section_id: "9A", period: 4 }),
      row({ group_id: "g1", section_id: "9B", period: 4 }),
      row({ group_id: "g2", section_id: "9A", period: 5 }),
      row({ group_id: "g2", section_id: "9B", period: 5 }),
    ];
    expect(countTeacherPeriods(rows)).toBe(3);
  });

  it("does not merge different rows that happen to share section/day/period", () => {
    // shouldn't happen in practice, but two ungrouped rows at the same slot count as given
    expect(countTeacherPeriods([row({}), row({})])).toBe(1);
  });
});

describe("countSectionPeriods", () => {
  it("counts ungrouped rows individually", () => {
    expect(countSectionPeriods([row({ period: 1 }), row({ period: 2 })])).toBe(2);
  });

  it("collapses an elective block (several options, one group_id) to one period", () => {
    const elective = [
      row({ group_id: "e1", period: 3 }), // Biology option
      row({ group_id: "e1", period: 3 }), // Computer option
    ];
    expect(countSectionPeriods(elective)).toBe(1);
  });

  it("counts a combined lesson as one section period too", () => {
    expect(countSectionPeriods([row({ group_id: "g1", period: 6 })])).toBe(1);
  });
});
