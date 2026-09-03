import { test, expect, type Locator, type Page } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

// The Settings form seeds from the ["settings"] query once it loads. Filling a
// value before that seed effect has run gets overwritten, so fill-then-verify
// with a few retries.
async function setField(page: Page, field: Locator, value: string) {
  await expect(field).toBeVisible();
  for (let attempt = 0; attempt < 6; attempt++) {
    await field.fill(value);
    await field.blur();
    await page.waitForTimeout(600);
    if ((await field.inputValue()) === value) return;
  }
  throw new Error(`Settings field would not hold value "${value}"`);
}

test("Settings: max consecutive periods persists across reload", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/settings");
  await page.waitForResponse((r) => r.url().includes("school_settings"));

  const label = "Max consecutive periods per teacher";
  const field = () => page.getByLabel(label);

  const original = await field().inputValue();
  const next = original === "3" ? "4" : "3";

  await setField(page, field(), next);
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText(/Settings saved/i)).toBeVisible();

  await page.reload();
  await expect(field()).toHaveValue(next);

  // restore
  await setField(page, field(), original);
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText(/Settings saved/i)).toBeVisible();
  await page.reload();
  await expect(field()).toHaveValue(original);
});

test("Settings: weekly schedule fields load real values", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForResponse((r) => r.url().includes("school_settings"));
  await expect(page.getByLabel(/Working days per week/)).toHaveValue("5");
  await expect(page.getByLabel("Periods per day")).toHaveValue("8");
});
