import { test, expect } from "@playwright/test";

test.describe("Meeting Timer", () => {
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

  test("navigates to a meeting and sees timer controls", async ({ page }) => {
    await page.goto("/meetings");
    await expect(page.locator("text=All Meetings")).toBeVisible({ timeout: 10000 });

    const meetingLink = page.locator("a[href*='/meetings/']").first();
    await expect(meetingLink).toBeVisible({ timeout: 10000 });
    await meetingLink.click();

    await expect(page).toHaveURL(/\/meetings\//);
    await page.waitForLoadState("networkidle", { timeout: 15000 });

    await expect(page.locator("text=Timer").or(page.locator("text=Elapsed"))).toBeVisible({ timeout: 10000 });
  });
});
