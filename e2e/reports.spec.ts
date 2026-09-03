import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

test.describe("Reports", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reports");
  });

  test("Table A: compact single-number grid with class teacher and Games/Total columns", async ({ page }) => {
    // default tab is Class/Section x Subject
    const headerRow = page.locator("table thead tr").first();
    await expect(headerRow.getByText("Class / Section")).toBeVisible();
    await expect(headerRow.getByText("Eng", { exact: true })).toBeVisible(); // abbreviated subject header
    await expect(headerRow.getByText("Games", { exact: true })).toBeVisible();
    await expect(headerRow.getByText("Total", { exact: true })).toBeVisible();

    // first column: "1 – A" and the class teacher name on the SAME line, no label
    const firstCol = page.locator("table tbody tr td:first-child").first();
    await expect(firstCol).toContainText("1 – A");
    await expect(firstCol).not.toContainText("Class teacher:");
    await expect(firstCol).toContainText(/\p{L}{3,}/u); // a teacher name
    // class/section and teacher share one line (no block-level children)
    await expect(firstCol.locator("div")).toHaveCount(0);
    const h = await firstCol.evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(h).toBeLessThan(34);

    // subject cells are a single number (or a dash), never "N / N"
    const subjectCell = page.locator('table tbody tr:first-child td:nth-child(2)');
    await expect(subjectCell).toHaveText(/^(\d+|—)$/);

    // Total cell (last col) is a single number, no over-capacity, nothing red
    const totalCell = page.locator("table tbody tr:first-child td:last-child");
    await expect(totalCell).toHaveText(/^\d+$/);
    await expect(page.locator("table td.text-destructive")).toHaveCount(0);

    // the table fits without a horizontal scrollbar
    const scrolls = await page.locator("table").evaluateAll((tables) =>
      tables.some((t) => {
        const c = t.parentElement as HTMLElement;
        return c.scrollWidth > c.clientWidth + 1;
      }),
    );
    expect(scrolls, "Table A should not overflow horizontally").toBe(false);
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

  test("Table B: compact single-number grid, no red, Total column", async ({ page }) => {
    await page.getByRole("tab", { name: /Teacher × Class\/Section/ }).click();
    const headerRow = page.locator("table thead tr").first();
    await expect(headerRow.getByText("Teacher", { exact: true })).toBeVisible();
    await expect(headerRow.getByText("1A", { exact: true })).toBeVisible(); // compact section header
    await expect(headerRow.getByText("Total", { exact: true })).toBeVisible();

    // no mismatch highlighting anywhere
    await expect(page.locator("table tbody td.text-destructive")).toHaveCount(0);

    // data cells are a single number or a dash
    const bodyCells = page.locator("table tbody tr td:not(:first-child)");
    await expect(bodyCells.first()).toBeVisible();
    const sample = await bodyCells.evaluateAll((tds) => tds.slice(0, 120).map((td) => td.textContent!.trim()));
    for (const txt of sample) expect(txt, `cell "${txt}"`).toMatch(/^(\d+|—)$/);
    expect(sample.filter((t) => /^\d+$/.test(t)).length).toBeGreaterThan(20);
  });
});
