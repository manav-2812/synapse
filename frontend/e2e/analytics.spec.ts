import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, navTo } from "./helpers";

test("analytics dashboard renders key cards and labels", async ({ page }) => {
  await signup(page, uniqueEmail());
  await navTo(page, "Analytics");

  // Page heading.
  await expect(
    page.getByRole("heading", { level: 1, name: "Analytics" }),
  ).toBeVisible();

  // Summary stat tiles.
  await expect(page.getByText("Documents uploaded")).toBeVisible();
  await expect(page.getByText("Questions asked")).toBeVisible();
  await expect(page.getByText("Quizzes taken")).toBeVisible();
  await expect(page.getByText("Total study time")).toBeVisible();

  // Section cards.
  await expect(page.getByRole("heading", { name: "Usage & cost", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Performance", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Topic performance", exact: true })).toBeVisible();
});
