import { test, expect } from "@playwright/test";

test.describe("Login", () => {
  test("redirects unauthenticated user to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("logs in with valid credentials and redirects to dashboard", async ({ page }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, "TEST_EMAIL and TEST_PASSWORD env vars required");

    await page.goto("/login");
    await page.fill("input[name=email]", process.env.TEST_EMAIL!);
    await page.fill("input[name=password]", process.env.TEST_PASSWORD!);
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });
});
