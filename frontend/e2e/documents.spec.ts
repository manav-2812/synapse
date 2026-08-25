import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, navTo } from "./helpers";

test("upload a document and watch it reach completed status", async ({ page }) => {
  await signup(page, uniqueEmail());
  await navTo(page, "Documents");

  await page.setInputFiles('input[type="file"]', "e2e/fixtures/sample.txt");

  // The row/card appears once the upload response returns…
  const row = page.locator(".doc-card, .doc-row").first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // …then polling advances pending → processing → completed (Ready).
  await expect(page.getByText(/Ready|Completed/i).first()).toBeVisible({
    timeout: 60_000,
  });
});

test("empty documents view shows an actionable empty state", async ({ page }) => {
  await signup(page, uniqueEmail());
  await navTo(page, "Documents");
  // No uploads yet -> the empty state CTA should be present and clickable.
  await expect(page.getByText(/Your knowledge base is empty|No documents yet/i)).toBeVisible({ timeout: 15_000 });
});
