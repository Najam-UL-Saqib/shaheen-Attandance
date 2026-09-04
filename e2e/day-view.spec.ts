import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

// Pin a fixed weekday so the seeded weekly timetable is populated.
const DATE = "2026-09-07"; // a Monday

test.beforeEach(async ({ page }) => {
  // every window.confirm on this page is a "yes, proceed" in these flows
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto("/day-view");
  await page.getByRole("heading", { name: "Day View" }).waitFor();
  await page.locator('input[type="date"]').fill(DATE);
  await page.locator("table tbody tr").first().waitFor();
});

async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
}

async function resetDay(page: Page) {
  await closeDialog(page);
  await page.getByRole("button", { name: /Reset day to default/i }).click();
  await expect(page.getByText(/\d+ changes? on this date/)).toHaveCount(0);
}

// a grid cell that currently has a lesson (teacher name text)
function populatedCell(page: Page) {
  return page.locator("table tbody tr:first-child td", { hasText: /[A-Za-z]{3,}/ }).first();
}

// the first editable period cell of the row whose header contains `rowText`
function firstPeriodCell(page: Page, rowText: string) {
  return page.locator("table tbody tr", { hasText: rowText }).locator("td.cursor-pointer").first();
}

test.afterEach(async ({ page }) => {
  await resetDay(page).catch(() => {});
});

test("cell editor: teacher scope toggle flips both ways", async ({ page }) => {
  await populatedCell(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const thisClass = dialog.getByRole("button", { name: "This class" });
  const allAvail = dialog.getByRole("button", { name: /All available \(\d+\)/ });
  await expect(thisClass).toBeVisible();
  await expect(allAvail).toBeVisible();

  // start on "this class", switch to all, and back — both remain clickable each time
  await expect(thisClass).toHaveAttribute("aria-pressed", "true");
  await allAvail.click();
  await expect(allAvail).toHaveAttribute("aria-pressed", "true");
  await expect(thisClass).toHaveAttribute("aria-pressed", "false");
  await thisClass.click();
  await expect(thisClass).toHaveAttribute("aria-pressed", "true");

  await closeDialog(page);
});

test("cell editor: Game mode marks the period and can be reset", async ({ page }) => {
  await populatedCell(page).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Game", exact: true }).click();
  await dialog.getByRole("button", { name: "Set as Game" }).click();
  await expect(page.getByText(/Marked as Game period/i)).toBeVisible();
  await expect(populatedCell(page)).toContainText("Game");
});

test("cell editor: Test with the lesson's own subject pre-fills its teacher as invigilator", async ({ page }) => {
  const cell = populatedCell(page);
  // the cell shows "<Subject>" then "<Teacher>" on separate lines
  const lines = (await cell.innerText()).split("\n").map((s) => s.trim()).filter(Boolean);
  const subject = lines[0];
  const teacher = lines[1];

  await cell.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Test", exact: true }).click();

  // choose the same subject this cell already teaches
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: subject, exact: true }).click();

  // the invigilator select now shows that subject's teacher for this section
  await expect(dialog.getByRole("combobox").nth(1)).toContainText(teacher);

  await dialog.getByRole("button", { name: "Set as Test" }).click();
  await expect(page.getByText(/Marked as a test/i)).toBeVisible();
  await expect(populatedCell(page)).toContainText(`Test · ${subject}`);
});

test("cell editor: Function mode", async ({ page }) => {
  await populatedCell(page).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Function", exact: true }).click();
  await dialog.getByRole("button", { name: "Set as Function" }).click();
  await expect(page.getByText(/Marked as a function/i)).toBeVisible();
  await expect(populatedCell(page)).toContainText("Function");
});

test("cell editor: create a combined lesson for the date", async ({ page }) => {
  // class 8 has no seeded grouped lessons, so the count starts at 0
  const before = await page.locator("table tbody").getByText("Combined", { exact: true }).count();
  await firstPeriodCell(page, "8 – A").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Combined", exact: true }).click();

  await dialog.getByRole("checkbox").first().click(); // "Also covers" sibling
  await dialog.getByRole("combobox").first().click(); // subject
  await page.getByRole("option").first().click();
  await dialog.getByRole("combobox").nth(1).click(); // teacher
  await page.getByRole("option").first().click();

  await dialog.getByRole("button", { name: /Save combined lesson/i }).click();
  await expect(page.getByText(/Combined lesson across 2 sections/i)).toBeVisible();

  // two more "Combined" cells appeared (8-A and 8-B)
  await expect(page.locator("table tbody").getByText("Combined", { exact: true })).toHaveCount(before + 2);
  await expect(page.getByText(/changes? on this date/)).toBeVisible();
});

test("cell editor: create an elective block for the date", async ({ page }) => {
  await firstPeriodCell(page, "7 – A").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Elective", exact: true }).click();

  // two option rows, each subject + teacher (combobox order: subj,teacher,room per row)
  const combos = dialog.getByRole("combobox");
  await combos.nth(0).click(); await page.getByRole("option").nth(0).click();
  await combos.nth(1).click(); await page.getByRole("option").nth(0).click();
  await combos.nth(3).click(); await page.getByRole("option").nth(1).click();
  await combos.nth(4).click(); await page.getByRole("option").nth(1).click();

  await dialog.getByRole("button", { name: /Save elective block/i }).click();
  await expect(page.getByText(/Elective block/i)).toBeVisible();
  await expect(page.locator("table tbody").getByText("Elective", { exact: true }).first()).toBeVisible();
});

test("'Teacher away': cover picker scope toggle flips back and forth", async ({ page }) => {
  await page.getByRole("button", { name: /Teacher away/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option").first().click();

  const firstCard = dialog.locator(".rounded-lg.border").first();
  await expect(firstCard).toBeVisible({ timeout: 10_000 });

  const thisClass = firstCard.getByRole("button", { name: "This class" });
  const allAvail = firstCard.getByRole("button", { name: /All available \(\d+\)/ });
  await expect(thisClass).toBeVisible();
  await expect(allAvail).toBeVisible();

  // the reported bug: after clicking "all", you could not go back
  await allAvail.click();
  await expect(allAvail).toHaveAttribute("aria-pressed", "true");
  await thisClass.click();
  await expect(thisClass).toHaveAttribute("aria-pressed", "true");
  await allAvail.click();
  await expect(allAvail).toHaveAttribute("aria-pressed", "true");

  await closeDialog(page);
});

test("'Teacher away': 'Leave all free' fills every row and applies", async ({ page }) => {
  await page.getByRole("button", { name: /Teacher away/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option").first().click();

  await expect(dialog.locator(".rounded-lg.border").first()).toBeVisible({ timeout: 10_000 });
  const total = await dialog.locator(".rounded-lg.border").count();

  await dialog.getByRole("button", { name: /Leave all free/i }).click();
  await expect(dialog.getByText(new RegExp(`${total} of ${total} set`))).toBeVisible();

  await dialog.getByRole("button", { name: /Apply cover/i }).click();
  await expect(page.getByText(/reassigned/i)).toBeVisible();
  await expect(page.getByText(/\d+ changes? on this date/)).toBeVisible();
});

test("'Tests / function': test with a subject auto-assigns invigilators", async ({ page }) => {
  await page.getByRole("button", { name: /Tests \/ function/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Tests \/ function —/)).toBeVisible();

  // test mode is default; choose the subject being tested
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option").nth(1).click(); // first real subject

  // tick the first class, range P1..P2
  await dialog.getByRole("checkbox").first().click();
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Period 1" }).click();
  await dialog.getByRole("combobox").nth(2).click();
  await page.getByRole("option", { name: "Period 2" }).click();

  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/marked as test/i)).toBeVisible();
  await expect(page.locator("table tbody").getByText(/^Test/).first()).toBeVisible();
});

test("'Tests / function': function mode marks a range", async ({ page }) => {
  await page.getByRole("button", { name: /Tests \/ function/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /School function/i }).click();

  await dialog.getByRole("checkbox").first().click();
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Period 1" }).click();
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Period 1" }).click();

  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/marked as function/i)).toBeVisible();
  await expect(page.locator("table tbody").getByText("Function", { exact: true }).first()).toBeVisible();
});
