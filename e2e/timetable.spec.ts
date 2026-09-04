import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

const KEY = "sb_publishable_Nx13aNeFAjsWEd2z8Q3Z-A_zyae6wIR";
const BASE = "https://qfouqxadizyxzthxeajc.supabase.co/rest/v1";

// Runs an authed REST call from the browser (admin session) and returns status + body.
async function rest(
  page: import("@playwright/test").Page,
  attempt: { class_id: string; section_id: string; day: number; period: number; teacher_id: string; subject_id: string },
) {
  return page.evaluate(
    async ({ key, base, attempt }) => {
      const k = Object.keys(localStorage).find((x) => x.includes("auth-token"))!;
      const tok = JSON.parse(localStorage.getItem(k) as string).access_token;
      const h = { apikey: key, Authorization: "Bearer " + tok, "Content-Type": "application/json", Prefer: "return=representation" };
      const res = await fetch(`${base}/timetable_slots`, { method: "POST", headers: h, body: JSON.stringify(attempt) });
      const body = await res.text();
      if (res.ok) {
        const row = JSON.parse(body)[0];
        await fetch(`${base}/timetable_slots?id=eq.${row.id}`, { method: "DELETE", headers: h });
      }
      return { status: res.status, body };
    },
    { key: KEY, base: BASE, attempt },
  );
}

test.describe("timetable integrity constraints", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/timetable");
    await page.getByRole("heading", { name: /Weekly Timetable/ }).waitFor();
  });

  test("a teacher cannot be booked in two class/sections in the same period", async ({ page }) => {
    const seed = await page.evaluate(
      async ({ key, base }) => {
        const k = Object.keys(localStorage).find((x) => x.includes("auth-token"))!;
        const tok = JSON.parse(localStorage.getItem(k) as string).access_token;
        const h = { apikey: key, Authorization: "Bearer " + tok };
        const [slot] = await (await fetch(`${base}/timetable_slots?select=*&limit=1`, { headers: h })).json();
        const secs = await (await fetch(`${base}/sections?select=id,class_id`, { headers: h })).json();
        const other = secs.find((s: { id: string }) => s.id !== slot.section_id);
        const [subj] = await (await fetch(`${base}/subjects?select=id&limit=1`, { headers: h })).json();
        return { slot, other, subj };
      },
      { key: KEY, base: BASE },
    );

    const r = await rest(page, {
      class_id: seed.other.class_id,
      section_id: seed.other.id,
      day: seed.slot.day,
      period: seed.slot.period,
      teacher_id: seed.slot.teacher_id,
      subject_id: seed.subj.id,
    });
    expect(r.status, r.body).toBe(409);
    expect(r.body).toMatch(/teacher_day_period|duplicate key/);
  });

  test("a class/section cannot have two lessons in the same period", async ({ page }) => {
    const seed = await page.evaluate(
      async ({ key, base }) => {
        const k = Object.keys(localStorage).find((x) => x.includes("auth-token"))!;
        const tok = JSON.parse(localStorage.getItem(k) as string).access_token;
        const h = { apikey: key, Authorization: "Bearer " + tok };
        const [slot] = await (await fetch(`${base}/timetable_slots?select=*&limit=1`, { headers: h })).json();
        const teachers = await (await fetch(`${base}/teachers?select=id`, { headers: h })).json();
        const otherTeacher = teachers.find((t: { id: string }) => t.id !== slot.teacher_id);
        return { slot, otherTeacher };
      },
      { key: KEY, base: BASE },
    );

    // same section + day + period, different teacher -> still rejected
    const r = await rest(page, {
      class_id: seed.slot.class_id,
      section_id: seed.slot.section_id,
      day: seed.slot.day,
      period: seed.slot.period,
      teacher_id: seed.otherTeacher.id,
      subject_id: seed.slot.subject_id,
    });
    expect(r.status, r.body).toBe(409);
    expect(r.body).toMatch(/section_id.*day.*period|duplicate key/);
  });

  // Insert grouped rows at an unused cell, assert the DB accepts them, then clean up.
  async function insertGroup(page: import("@playwright/test").Page, kind: "combined" | "elective") {
    return page.evaluate(
      async ({ key, base, kind }) => {
        const k = Object.keys(localStorage).find((x) => x.includes("auth-token"))!;
        const tok = JSON.parse(localStorage.getItem(k) as string).access_token;
        const h = { apikey: key, Authorization: "Bearer " + tok, "Content-Type": "application/json", Prefer: "return=representation" };
        const sections = await (await fetch(`${base}/sections?select=id,class_id&order=section_name`, { headers: h })).json();
        const subjects = await (await fetch(`${base}/subjects?select=id&order=name`, { headers: h })).json();
        const teachers = await (await fetch(`${base}/teachers?select=id&order=name`, { headers: h })).json();
        const groupId = crypto.randomUUID();
        const day = 5;
        const period = 12; // outside the seeded schedule -> guaranteed free
        const body =
          kind === "combined"
            ? [sections[0], sections[1]].map((sec: { id: string; class_id: string }) => ({
                class_id: sec.class_id, section_id: sec.id, day, period,
                teacher_id: teachers[0].id, subject_id: subjects[0].id, room_id: null,
                group_id: groupId, group_kind: "combined",
              }))
            : [0, 1].map((i) => ({
                class_id: sections[0].class_id, section_id: sections[0].id, day, period,
                teacher_id: teachers[i].id, subject_id: subjects[i].id, room_id: null,
                group_id: groupId, group_kind: "elective",
              }));
        const res = await fetch(`${base}/timetable_slots`, { method: "POST", headers: h, body: JSON.stringify(body) });
        const text = await res.text();
        if (res.ok) {
          const ids = JSON.parse(text).map((r: { id: string }) => r.id);
          await fetch(`${base}/timetable_slots?id=in.(${ids.join(",")})`, { method: "DELETE", headers: h });
        }
        return { status: res.status, body: text };
      },
      { key: KEY, base: BASE, kind },
    );
  }

  test("a combined lesson may put one teacher in two sections in the same period", async ({ page }) => {
    const r = await insertGroup(page, "combined");
    expect(r.status, r.body).toBeLessThan(300);
  });

  test("an elective block may put two subjects in one section in the same period", async ({ page }) => {
    const r = await insertGroup(page, "elective");
    expect(r.status, r.body).toBeLessThan(300);
  });
});
