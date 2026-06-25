import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, navTo } from "./helpers";

test("generate a flashcard set and reveal a card", async ({ page }) => {
  await signup(page, uniqueEmail());
  await navTo(page, "Flashcards");

  // Generate a set of flashcards (this calls the LLM — allow time).
  await page.getByRole("button", { name: /Generate/ }).click();

  // A flashcard renders once generation completes.
  const card = page.locator(".flashcard").first();
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".flashcard").first()).toHaveText(/\S/);

  // Clicking flips the card to reveal the back.
  await card.click();
  await expect(card).toHaveClass(/flipped/);
});

test("generate a quiz, answer it, and see a score", async ({ page }) => {
  await signup(page, uniqueEmail());
  await navTo(page, "Quiz");

  await page.getByRole("button", { name: /Generate/ }).click();

  // Quiz questions render.
  const questions = page.locator(".quiz-q");
  await expect(questions.first()).toBeVisible({ timeout: 90_000 });
  const count = await questions.count();
  expect(count).toBeGreaterThan(0);

  // Answer every question — MCQ options render as .opt buttons, otherwise a
  // free-text field. Submitting requires every question to be answered.
  for (let i = 0; i < count; i++) {
    const q = questions.nth(i);
    const opt = q.locator(".opt").first();
    if (await opt.count()) {
      await opt.click();
    } else {
      await q.locator("input.input").fill("answer");
    }
  }

  await page.getByRole("button", { name: /Submit answers/ }).click();

  // A score result is shown.
  await expect(page.locator(".quiz-result").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/\d+ \/ \d+ correct/i)).toBeVisible();
});
