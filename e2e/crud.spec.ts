import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

const NAME = "ZZ E2E Test Teacher";

// Full create -> edit -> delete flow against a clearly-labelled throwaway record.
test("Teachers: create, edit, delete", async ({ page }) => {
  await page.goto("/teachers");
  await expect(page.getByRole("heading", { name: "Teachers" })).toBeVisible();

  const rowFor = () => page.getByRole("row").filter({ hasText: NAME });

  // clean up any leftover from a previous failed run
  if (await rowFor().count()) {
    page.once("dialog", (d) => d.accept());
    await rowFor().first().getByRole("button").last().click();
    await expect(rowFor()).toHaveCount(0);
  }

  // create
  await page.getByRole("button", { name: /Add teacher/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").nth(0).fill(NAME); // Name
  await dialog.getByRole("textbox").nth(1).fill("zz-e2e@example.com"); // Email
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: NAME })).toBeVisible();

  // edit -> set employee id
  await rowFor().getByRole("button").first().click(); // pencil
  const editDialog = page.getByRole("dialog");
  await editDialog.getByRole("textbox").nth(2).fill("E2E-001"); // Employee ID
  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(rowFor().getByText("E2E-001")).toBeVisible();

  // delete
  page.once("dialog", (d) => d.accept());
  await rowFor().getByRole("button").last().click();
  await expect(rowFor()).toHaveCount(0);
});

async function pickOption(page: import("@playwright/test").Page, comboIndex: number, name: string) {
  const combo = page.getByRole("combobox").nth(comboIndex);
  await expect(combo).toBeEnabled();
  await combo.click();
  const option = page.getByRole("option", { name, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(combo).toContainText(name);
}

test("Timetable: selecting a class/section shows the seeded grid", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/timetable");
  await expect(page.getByRole("heading", { name: /Weekly Timetable/ })).toBeVisible();

  await pickOption(page, 0, "9"); // class
  await pickOption(page, 1, "A"); // section

  await expect(page.getByRole("columnheader", { name: "Period 1" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Mon" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Auto-generate/i })).toBeVisible();
  // seed data: 9-A has science/language lessons scheduled
  await expect(
    page.locator("table td").filter({ hasText: /Physics|Chemistry|English|Urdu|Biology/ }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Allocation usage for this section/i)).toBeVisible();
  await expect(page.locator(".border-destructive")).toHaveCount(0); // no over-allocation
});
