import { describe, it, expect } from "vitest";
import { breakPositionsForClass, allBreakPositions, type Break, type BreakClass } from "./breaks";

const breaks: Break[] = [
  { id: "b1", name: "Junior break", after_period: 3 },
  { id: "b2", name: "Senior lunch", after_period: 4 },
];
const bc: BreakClass[] = [
  { break_id: "b1", class_id: "c1" },
  { break_id: "b1", class_id: "c2" },
  { break_id: "b2", class_id: "c9" },
];

describe("breakPositionsForClass", () => {
  it("uses the class's custom break", () => {
    expect(breakPositionsForClass("c1", breaks, bc, 5)).toEqual([3]);
    expect(breakPositionsForClass("c9", breaks, bc, 5)).toEqual([4]);
  });
  it("falls back to the school default when the class has no custom break", () => {
    expect(breakPositionsForClass("c99", breaks, bc, 5)).toEqual([5]);
  });
  it("no break when there is no custom break and no default", () => {
    expect(breakPositionsForClass("c99", breaks, bc, 0)).toEqual([]);
  });
  it("de-dupes and sorts multiple custom breaks", () => {
    const bc2 = [...bc, { break_id: "b2", class_id: "c1" }];
    expect(breakPositionsForClass("c1", breaks, bc2, 5)).toEqual([3, 4]);
  });
});

describe("allBreakPositions", () => {
  it("is the sorted union across classes", () => {
    expect(allBreakPositions(["c1", "c9", "c99"], breaks, bc, 5)).toEqual([3, 4, 5]);
  });
});
