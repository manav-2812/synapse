import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, navTo } from "./helpers";

test("generate a flashcard set and reveal a card", async ({ page }) => {
  await signup(page, uniqueEmail());

  // Upload a document so the flashcard generator has material to generate cards from
  await navTo(page, "Documents");
  await page.setInputFiles('input[type="file"]', "e2e/fixtures/sample.txt");
  await expect(page.getByText(/Ready|Completed/i).first()).toBeVisible({
    timeout: 60_000,
  });

  await navTo(page, "Flashcards");
  await page.getByRole("button", { name: "Generate Flashcards" }).click();

  // A flashcard renders once generation completes.
  const card = page.locator(".flashcard, .flashcard-grid-card").first();
  await expect(card).toBeVisible({ timeout: 180_000 });
  await expect(card).toHaveText(/\S/);

  // Clicking flips the card to reveal the back.
  await card.click();
  await expect(card).toHaveClass(/flipped|is-flipped/);
});

test("generate a quiz, answer it, and see a score", async ({ page }) => {
  await signup(page, uniqueEmail());

  // Upload a document so the quiz generator has material to generate questions from
  await navTo(page, "Documents");
  await page.setInputFiles('input[type="file"]', "e2e/fixtures/sample.txt");
  await expect(page.getByText(/Ready|Completed/i).first()).toBeVisible({
    timeout: 60_000,
  });

  await navTo(page, "Quiz");
  await page.getByRole("button", { name: "Generate Quiz" }).click();

  // Quiz question prompt renders once generated.
  const questionPrompt = page.locator(".quiz-stage-prompt, .quiz-q");
  await expect(questionPrompt.first()).toBeVisible({ timeout: 180_000 });

  // Step through each focus question, pick an option, and advance
  const totalDots = await page.locator(".quiz-dot-step").count();
  const iterations = totalDots > 0 ? totalDots : 5;
  for (let i = 0; i < iterations; i++) {
    const opt = page.locator(".quiz-hero-opt").first();
    if (await opt.count()) {
      await opt.click();
    }
    const nextBtn = page.getByRole("button", { name: /Next Question/i });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    }
  }

  const completeBtn = page.getByRole("button", { name: /Complete Quiz/i });
  await expect(completeBtn).toBeVisible({ timeout: 10_000 });
  await completeBtn.click();

  // A score result is shown.
  await expect(page.locator(".quiz-result-hero-card, .quiz-result").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/\d+ of \d+ Questions Correct|\d+ \/ \d+ correct/i)).toBeVisible();
});
