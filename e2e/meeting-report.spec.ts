import { test, expect } from "@playwright/test";

test.describe("Meeting Report", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, "TEST_EMAIL and TEST_PASSWORD env vars required");

    await page.goto("/login");
    await page.fill("input[type=email]", process.env.TEST_EMAIL!);
    await page.fill("input[type=password]", process.env.TEST_PASSWORD!);

    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 30000 }),
      page.click("button[type=submit]"),
    ]);
  });

  test("navigates to a logged meeting and views the report", async ({ page }) => {
    await page.goto("/meetings");

    const meetingLink = page.locator("a[href^='/meetings/']:not([href$='/new'])").first();
    await expect(meetingLink).toBeVisible({ timeout: 15000 });
    await meetingLink.click();

    await expect(page).toHaveURL(/\/meetings\//);

    const reportLink = page.locator("a[href$='/report']");
    if (await reportLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reportLink.click();
      await expect(page).toHaveURL(/\/meetings\/.+\/report/);

      await expect(page.locator("text=Report")).toBeVisible({ timeout: 10000 });

      const outcomeSection = page.locator("text=Outcomes");
      const notesSection = page.locator("text=Notes");
      const actionItemsSection = page.locator("text=Action Items");

      const hasAnySection = await Promise.any([
        outcomeSection.isVisible(),
        notesSection.isVisible(),
        actionItemsSection.isVisible(),
      ]).catch(() => false);

      expect(hasAnySection).toBeTruthy();
    }
  });

  test("shows report snapshot counts in sidebar", async ({ page }) => {
    await page.goto("/meetings");

    const meetingLink = page.locator("a[href^='/meetings/']:not([href$='/new'])").first();
    await expect(meetingLink).toBeVisible({ timeout: 15000 });
    await meetingLink.click();

    const reportLink = page.locator("a[href$='/report']");
    if (await reportLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reportLink.click();
      await expect(page.locator("text=Snapshot")).toBeVisible({ timeout: 10000 });
    }
  });

  test("adds an outcome note to a completed meeting", async ({ page }) => {
    await page.goto("/meetings");

    const meetingLink = page.locator("a[href^='/meetings/']:not([href$='/new'])").first();
    await expect(meetingLink).toBeVisible({ timeout: 15000 });
    await meetingLink.click();

    await expect(page).toHaveURL(/\/meetings\//);

    const noteInput = page.locator("input[placeholder='Add a note...']");
    if (await noteInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const testNote = `Test outcome note ${Date.now()}`;
      await noteInput.fill(testNote);
      await page.locator("button:has(svg.lucide-plus)").first().click();

      await expect(page.locator(`text=${testNote}`)).toBeVisible({ timeout: 5000 });
    }
  });
});
