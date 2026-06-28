import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[name=email]", process.env.TEST_EMAIL || "");
    await page.fill("input[name=password]", process.env.TEST_PASSWORD || "");
    await page.click("button[type=submit]");
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });

  test("navigates to meetings page", async ({ page }) => {
    await page.click("a[href='/meetings']");
    await expect(page).toHaveURL(/\/meetings/);
    await expect(page.locator("text=All Meetings")).toBeVisible({ timeout: 10000 });
  });
});
