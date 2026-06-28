import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.TEST_EMAIL || "";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";

test.describe("Login", () => {
  test("redirects unauthenticated user to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("logs in with valid credentials and redirects to dashboard", async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, "TEST_EMAIL and TEST_PASSWORD env vars required");

    await page.goto("/login");
    await page.fill("input[name=email]", TEST_EMAIL);
    await page.fill("input[name=password]", TEST_PASSWORD);
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });
});
