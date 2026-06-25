import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, navTo } from "./helpers";

test("ask a question and confirm a grounded citation appears", async ({ page }) => {
  const email = uniqueEmail();
  await signup(page, email);

  // Upload a document so retrieval has something to cite.
  await navTo(page, "Documents");
  await page.setInputFiles('input[type="file"]', "e2e/fixtures/sample.txt");
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({
    timeout: 60_000,
  });

  // Open chat and send a question.
  await page.goto("/chat");
  const composer = page.locator('textarea[placeholder="Message Synapse…"]');
  await expect(composer).toBeVisible();
  await composer.fill("What does this document say about photosynthesis?");
  await page.getByRole("button", { name: /Send/ }).click();

  // The user's question is echoed into the thread.
  await expect(page.getByText(/photosynthesis/i)).toBeVisible({ timeout: 15_000 });

  // The grounding pipeline emits sources BEFORE tokens — a citation chip is the
  // proof the RAG retrieval + citation layer works end to end.
  await expect(page.locator(".source-chip").first()).toBeVisible({ timeout: 60_000 });

  // And the assistant produced a non-empty answer.
  await expect(
    page.locator(".msg-assistant .msg-bubble").first(),
  ).not.toHaveText("", { timeout: 60_000 });
});
