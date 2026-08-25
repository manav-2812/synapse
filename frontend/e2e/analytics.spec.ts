import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, navTo } from "./helpers";

test("analytics dashboard renders key cards and labels", async ({ page }) => {
  await signup(page, uniqueEmail());
  await navTo(page, "Analytics");

  // Page heading.
  await expect(
    page.getByRole("heading", { level: 1, name: /Analytics/i }),
  ).toBeVisible();

  // Summary stat tiles.
  await expect(page.getByText("Total Learning Time")).toBeVisible();
  await expect(page.getByText("AI Questions Answered")).toBeVisible();
  await expect(page.getByText("Completed Quizzes")).toBeVisible();
  await expect(page.getByText("Indexed Documents")).toBeVisible();

  // Section cards.
  await expect(page.getByRole("heading", { name: /LLM Inference Telemetry/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Topic Mastery & Knowledge Gaps/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Learning Velocity & Consistency Heatmap/i })).toBeVisible();
});
