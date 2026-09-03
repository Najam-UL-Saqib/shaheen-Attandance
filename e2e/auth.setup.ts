import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";

const authFile = "e2e/.auth/admin.json";

setup("authenticate", async ({ page }) => {
  setup.setTimeout(120_000);
  fs.mkdirSync("e2e/.auth", { recursive: true });

  // The login form submits via a React onSubmit(preventDefault). Before client
  // hydration a click does a native GET to /login?. Retry until the SPA handler
  // is live and the redirect to the dashboard happens.
  let signedIn = false;
  for (let attempt = 0; attempt < 8 && !signedIn; attempt++) {
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.locator("#email").fill("admin@shaheenschool.com");
    await page.locator("#password").fill("admin123");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
      signedIn = true;
    } catch {
      // still on /login - hydration likely not ready yet; loop and retry
    }
  }

  expect(signedIn, "should have left /login after sign in").toBeTruthy();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: authFile });
});
