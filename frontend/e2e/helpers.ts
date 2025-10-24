import { Page, expect } from "@playwright/test";

const PASSWORD = "Password123";

/** Sign up a fresh account via the UI and expect to land on the dashboard. */
export async function signup(page: Page, email: string): Promise<void> {
  await page.goto("/signup");
  await page.fill('input[name="full_name"]', "E2E User");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

/** Log in via the UI and expect to land on the dashboard. */
export async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

/** A unique email per call so parallel/suite runs never collide. */
export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

/**
 * Navigate between authenticated routes via the in-app sidebar (client-side
 * routing). This preserves the live session in memory — which is how a real
 * user moves around — and avoids a full page reload that would otherwise
 * re-derive the session from storage (a hard-reload path that can race the
 * async /users/me lookup on a cold backend).
 */
export async function navTo(page: Page, label: string): Promise<void> {
  await page.getByRole("link", { name: label, exact: true }).first().click();
}
