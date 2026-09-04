import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

// Pin a fixed weekday so the seeded weekly timetable is populated.
const DATE = "2026-09-07"; // a Monday

test.beforeEach(async ({ page }) => {
  await page.goto("/day-view");
  await page.getByRole("heading", { name: "Day View" }).waitFor();
  await page.locator('input[type="date"]').fill(DATE);
  await page.locator("table tbody tr").first().waitFor();
});

async function resetDay(page: import("@playwright/test").Page) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Reset day to default/i }).click();
  await expect(page.getByText(/\d+ changes? on this date/)).toHaveCount(0);
}

test("cell editor offers section teachers first, with a 'show all available' toggle", async ({ page }) => {
  const cell = page.locator("table tbody tr:first-child td", { hasText: /[A-Za-z]{3,}/ }).first();
  await cell.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").first().click();
  await expect(page.getByText("From this class", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); // close the Select popover
  await expect(dialog.getByRole("button", { name: /Show all available/i })).toBeVisible();
  await page.keyboard.press("Escape"); // close the dialog
});

test("'Teacher away' lists a teacher's remaining lessons and reassigns them", async ({ page }) => {
  await page.getByRole("button", { name: /Teacher away/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Teacher away —/)).toBeVisible();

  // pick the first teacher who has lessons that day
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option").first().click();

  // their lessons appear with a cover picker each
  const lessonRows = dialog.locator("table tbody tr");
  await expect(lessonRows.first()).toBeVisible({ timeout: 10_000 });
  const count = await lessonRows.count();
  expect(count).toBeGreaterThan(0);

  // choose "Leave free" for the first lesson and apply
  await lessonRows.first().getByRole("combobox").click();
  await page.getByRole("option", { name: /Leave free/i }).click();
  await dialog.getByRole("button", { name: /Apply cover/i }).click();
  await expect(page.getByText(/reassigned/i)).toBeVisible();

  // the grid now shows at least one change for the date
  await expect(page.getByText(/\d+ changes? on this date/)).toBeVisible();

  await resetDay(page);
});

test("'Tests / function' marks a period range for a class", async ({ page }) => {
  await page.getByRole("button", { name: /Tests \/ function/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Tests \/ function —/)).toBeVisible();

  // test mode is the default; tick the first class
  await dialog.getByRole("checkbox").first().click();
  // range: from period 1 to period 2
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Period 1" }).click();
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Period 2" }).click();

  page.once("dialog", (d) => d.accept());
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/marked as test/i)).toBeVisible();

  // the grid shows Test cells now
  await expect(page.locator("table tbody").getByText("Test", { exact: true }).first()).toBeVisible();

  await resetDay(page);
});
