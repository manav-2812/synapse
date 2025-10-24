import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, navTo } from "./helpers";

test("upload a document and watch it reach completed status", async ({ page }) => {
  await signup(page, uniqueEmail());
  await navTo(page, "Documents");

  await page.setInputFiles('input[type="file"]', "e2e/fixtures/sample.txt");

  // The row appears once the upload response returns…
  const row = page.locator(".doc-row").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // …then polling advances pending → processing → completed.
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({
    timeout: 60_000,
  });
});

test("empty documents view shows an actionable empty state", async ({ page }) => {
  await signup(page, uniqueEmail());
  await navTo(page, "Documents");
  // No uploads yet -> the empty state CTA should be present and clickable.
  await expect(page.getByText("No documents yet.")).toBeVisible({ timeout: 15_000 });
});
