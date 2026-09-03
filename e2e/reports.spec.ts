import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

test.describe("Reports", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reports");
  });

  test("Table A shows subjects plus Game Periods and Total Periods columns", async ({ page }) => {
    // default tab is Class/Section x Subject
    const headerRow = page.locator("table thead tr").first();
    await expect(headerRow.getByText("Class / Section")).toBeVisible();
    await expect(headerRow.getByText("Game Periods")).toBeVisible();
    await expect(headerRow.getByText("Total Periods")).toBeVisible();

    // at least one data row for a class-section
    await expect(page.getByRole("cell", { name: /^1 – A$/ })).toBeVisible();

    // Total Periods cell shows "<scheduled> / <capacity>" and no red over-capacity
    const totalCells = page.locator("table tbody tr td:last-child");
    await expect(totalCells.first()).toContainText(/\d+ \/ \d+/);
    await expect(page.locator("td.text-destructive")).toHaveCount(0);
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
