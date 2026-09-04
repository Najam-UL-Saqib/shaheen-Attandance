import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

const ROUTES: { path: string; heading: RegExp }[] = [
  { path: "/", heading: /Dashboard/ },
  { path: "/subjects", heading: /Subjects/ },
  { path: "/classes", heading: /Classes & Sections/ },
  { path: "/teachers", heading: /Teachers/ },
  { path: "/rooms", heading: /Rooms/ },
  { path: "/allocations", heading: /Teacher Workload Allocation/ },
  { path: "/timetable", heading: /Weekly Timetable/ },
  { path: "/day-view", heading: /Day View/ },
  { path: "/reports", heading: /Reports/ },
  { path: "/settings", heading: /Settings/ },
];

for (const { path, heading } of ROUTES) {
  test(`route ${path} renders without errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    const resp = await page.goto(path);
    expect(resp?.status(), `HTTP status for ${path}`).toBeLessThan(400);

    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    // The app's error boundary renders this text on a crash.
    await expect(page.getByText(/Something went wrong|Application error/i)).toHaveCount(0);

    // Ignore benign noise; fail on real errors.
    const realErrors = [...consoleErrors, ...pageErrors].filter(
      (t) =>
        !/favicon|Download the React DevTools|Supabase.*Connect|net::ERR_ABORTED/i.test(t),
    );
    expect(realErrors, `console/page errors on ${path}`).toEqual([]);
  });
}

test("sidebar navigation works", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator("aside");
  await sidebar.getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/reports/);
  await sidebar.getByRole("link", { name: "Weekly timetable" }).click();
  await expect(page).toHaveURL(/\/timetable/);
});

test("unauthenticated visit redirects to login", async ({ browser }) => {
  test.setTimeout(180_000);
  // Explicitly empty - the file-level test.use({ storageState }) must NOT leak in.
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();

  // AdminLayout's client-side guard redirects to /login once the client bundle
  // loads. A cold dev-server route compile can be slow; poll patiently and nudge
  // with reloads only when nothing is in flight.
  await page.goto("/reports");
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline && !/\/login/.test(page.url())) {
    await page
      .waitForURL(/\/login/, { timeout: 25_000 })
      .catch(() => page.reload().catch(() => {}));
  }
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  await ctx.close();
});
