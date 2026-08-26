import { type Page, expect } from "@playwright/test";

const PASSWORD = "Password123";

/** Sign up a fresh account via the UI, verify email, and land on the dashboard. */
export async function signup(page: Page, email: string): Promise<void> {
  await page.goto("/signup");
  await page.fill('input[name="full_name"]', "E2E User");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // The signup creates the user and renders the verification notice
  await expect(page.getByRole("heading", { name: /check your inbox/i })).toBeVisible({ timeout: 20_000 });

  // Activate the user via the dev/test endpoint
  const apiBase =
    (typeof process !== "undefined" && process.env?.VITE_API_BASE_URL) ||
    "http://127.0.0.1:8011/api/v1";
  const verifyRes = await page.request.post(`${apiBase}/auth/e2e-verify`, {
    data: { email },
  });
  expect(verifyRes.ok()).toBeTruthy();

  // Navigate to login and log in with the verified credentials
  await page.goto("/login");
  await login(page, email);
}

/** Log in via the UI and expect to land on the dashboard. */
export async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

/** A unique synthetic email per call so parallel/suite runs never collide. */
export function uniqueEmail(): string {
  return `e2e_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}@synapse-study.com`;
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
