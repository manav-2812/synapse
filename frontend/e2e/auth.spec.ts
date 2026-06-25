import { test, expect } from "@playwright/test";
import { login, signup, uniqueEmail } from "./helpers";

test("signup creates an account and lands on the dashboard", async ({ page }) => {
  await signup(page, uniqueEmail());
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("login with existing credentials returns to the dashboard", async ({ page }) => {
  const email = uniqueEmail();
  await signup(page, email);
  await page.goto("/login");
  await login(page, email);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("a protected route redirects to /login when logged out", async ({ page }) => {
  await page.goto("/documents");
  await expect(page).toHaveURL(/\/login/);
});

test("bad credentials show an error and stay on /login", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', "nobody@example.com");
  await page.fill('input[name="password"]', "wrongpassword");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
