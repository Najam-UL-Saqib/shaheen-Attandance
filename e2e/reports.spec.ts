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
    await expect(headerRow.getByText("English", { exact: true })).toBeVisible();
    await expect(headerRow.getByText("Games", { exact: true })).toBeVisible();
    await expect(headerRow.getByText("Total", { exact: true })).toBeVisible();

    // first column: "1 – A" then just the class teacher name (no "Class teacher:" label)
    const firstCol = page.locator("table tbody tr td:first-child").first();
    await expect(firstCol).toContainText("1 – A");
    await expect(firstCol).not.toContainText("Class teacher:");
    await expect(firstCol).toContainText(/\p{L}{3,}/u); // a teacher name

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

  test("Table B shows a Total column and every allocation cell is N / N", async ({ page }) => {
    await page.getByRole("tab", { name: /Teacher × Class\/Section/ }).click();
    const headerRow = page.locator("table thead tr").first();
    await expect(headerRow.getByText("Teacher")).toBeVisible();
    await expect(headerRow.getByText("Total", { exact: true })).toBeVisible();

    // No over-allocation highlighting anywhere in the body.
    await expect(page.locator("table tbody .text-destructive")).toHaveCount(0);

    // Every filled cell should read "x / x" (allocated == used). Grab a sample.
    const filled = page.locator("table tbody td span", { hasText: /\d+ \/ \d+/ });
    await expect(filled.first()).toBeVisible();
    await expect.poll(() => filled.count()).toBeGreaterThan(20);
    const count = await filled.count();
    for (let i = 0; i < Math.min(count, 40); i++) {
      const txt = (await filled.nth(i).innerText()).trim();
      const m = txt.match(/^(\d+) \/ (\d+)$/);
      if (m) expect(m[1], `cell "${txt}"`).toBe(m[2]);
    }
  });
});
