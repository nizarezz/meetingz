import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[name=email]", process.env.TEST_EMAIL || "");
    await page.fill("input[name=password]", process.env.TEST_PASSWORD || "");
    await page.click("button[type=submit]");
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });

  test("displays upcoming meetings section", async ({ page }) => {
    await expect(page.locator("text=Upcoming")).toBeVisible({ timeout: 10000 });
  });
});
