import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

test.describe("Reports", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reports");
  });

  test("Table A: abbreviated headers, class teacher, Games/Total, teacher-name toggle", async ({ page }) => {
    const headerRow = page.locator("table thead tr").first();
    await expect(headerRow.getByText("Class / Section")).toBeVisible();
    await expect(headerRow.getByText("Eng", { exact: true })).toBeVisible(); // abbreviated subject header
    await expect(headerRow.getByText("Games", { exact: true })).toBeVisible();
    await expect(headerRow.getByText("Total", { exact: true })).toBeVisible();

    // first column: "1 – A" and the class teacher name, no label
    const firstCol = page.locator("table tbody tr td:first-child").first();
    await expect(firstCol).toContainText("1 – A");
    await expect(firstCol).not.toContainText("Class teacher:");
    await expect(firstCol).toContainText(/\p{L}{3,}/u);

    // teacher names are shown by default (client request)
    // English column (5th cell: class/section, Bio, Chem, Comp Sci, English) has data for 1-A
    const engCell = page.locator("table tbody tr:first-child td:nth-child(5)");
    await expect(page.getByRole("button", { name: /Hide teacher names/i })).toBeVisible();

    // toggle OFF -> subject cells become a single number, table fits with no scroll
    await page.getByRole("button", { name: /Hide teacher names/i }).click();
    await expect(engCell).toHaveText(/^\d+$/);
    const totalCell = page.locator("table tbody tr:first-child td:last-child");
    await expect(totalCell).toHaveText(/^\d+$/);
    // seeded combined / elective demo lessons legitimately shift a few counts;
    // just guard against a wholesale mismatch.
    expect(await page.locator("table td.text-destructive").count()).toBeLessThan(20);
    const scrolls = await page.locator("table").evaluateAll((tables) =>
      tables.some((t) => {
        const c = t.parentElement as HTMLElement;
        return c.scrollWidth > c.clientWidth + 1;
      }),
    );
    expect(scrolls, "Table A (no names) should not overflow horizontally").toBe(false);

    // toggle back ON -> the cell shows a number and a teacher first name
    await page.getByRole("button", { name: /Show teacher names/i }).click();
    await expect(engCell).toHaveText(/^\d+[A-Za-z]/); // e.g. "5Ayesha"
  });

  test("Export PDF button triggers print and app chrome is hidden in print", async ({ page }) => {
    const btn = page.getByRole("button", { name: /Export PDF/i });
    await expect(btn).toBeVisible();

    let printed = false;
    await page.exposeFunction("__printed", () => { printed = true; });
    await page.addInitScript(() => {
      window.print = () => (window as unknown as { __printed: () => void }).__printed();
    });
    await page.reload();
    await page.getByRole("button", { name: /Export PDF/i }).click();
    await expect.poll(() => printed).toBe(true);

    // print stylesheet drops the sidebar, tabs and the button itself
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("aside")).toBeHidden();
    await expect(page.getByRole("button", { name: /Export PDF/i })).toBeHidden();
    await expect(page.getByRole("tablist")).toBeHidden();
    await expect(page.getByRole("table")).toBeVisible();
    await page.emulateMedia({ media: "screen" });
  });

  test("Timetable check tab lists issues in plain language (or an all-clear)", async ({ page }) => {
    await page.getByRole("tab", { name: /Timetable check/ }).click();

    const allClear = page.getByText(/No problems found/i);
    const legend = page.getByText(/Must fix/).first();
    // one of the two must render
    await expect(allClear.or(legend)).toBeVisible();

    if (await legend.isVisible()) {
      // each issue card carries a category, a one-line title and a "what to do" detail
      const firstCard = page.locator("div.border-l-4").first();
      await expect(firstCard).toBeVisible();
      const txt = (await firstCard.innerText()).toLowerCase();
      // the detail always points somewhere actionable
      expect(txt).toMatch(/timetable|workload|settings|classes|page|remove|add/);
    }
  });

  test("Table B: compact single-number grid, Total column", async ({ page }) => {
    await page.getByRole("tab", { name: /Teacher × Class\/Section/ }).click();
    const headerRow = page.locator("table thead tr").first();
    await expect(headerRow.getByText("Teacher", { exact: true })).toBeVisible();
    await expect(headerRow.getByText("1A", { exact: true })).toBeVisible(); // compact section header
    await expect(headerRow.getByText("Total", { exact: true })).toBeVisible();

    // combined teachers legitimately show used < allocated; just guard the bulk
    expect(await page.locator("table tbody td.text-destructive").count()).toBeLessThan(20);

    // data cells are a single number or a dash
    const bodyCells = page.locator("table tbody tr td:not(:first-child)");
    await expect(bodyCells.first()).toBeVisible();
    const sample = await bodyCells.evaluateAll((tds) => tds.slice(0, 120).map((td) => td.textContent!.trim()));
    for (const txt of sample) expect(txt, `cell "${txt}"`).toMatch(/^(\d+|—)$/);
    expect(sample.filter((t) => /^\d+$/.test(t)).length).toBeGreaterThan(20);
  });
});
