import { test, expect } from "@playwright/test";
import { setupNearAIRoute } from "./nearai.js";
import { setupStorageAndRoutes } from "./util.js";

test("should buy fungible tokens with NEAR", async ({ page }) => {
  await setupStorageAndRoutes({ page });

  const questionArea = await page.getByPlaceholder(
    "Type your question here...",
  );
  await expect(questionArea).toBeEnabled();
  questionArea.fill("I want to buy some tokens");

  await setupNearAIRoute({ page });
  await page.getByRole("button", { name: "Ask NEAR AI" }).click();
  await expect(
    page.getByRole("heading", { name: "Buy EXAMPLE tokens" }),
  ).toBeVisible();

  await page.locator("#confirmationModalOkButton").click();
  await expect(
    page.getByRole("heading", { name: "Buy EXAMPLE tokens" }),
  ).not.toBeVisible();
  await expect(page.getByText("Function call result")).toBeVisible();

  await expect(page.getByText("Successfully bought tokens.")).toContainText(
    `Successfully bought tokens. Here is the logged event: EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"aitoken.test.near","new_owner_id":"unregisteredaiuser.test.near","amount":"3000000"}]}`,
  );
});

test("should create a new web4 contract", async ({ page }) => {
  await setupStorageAndRoutes({ page });

  const questionArea = await page.getByPlaceholder(
    "Type your question here...",
  );
  await expect(questionArea).toBeEnabled();
  questionArea.fill("Can you create a web4 account named myweb4test.near?");

  await setupNearAIRoute({ page });
  await page.getByRole("button", { name: "Ask NEAR AI" }).click();
  await expect(
    page.getByRole("heading", { name: "Create account" }),
  ).toBeVisible();

  await page.locator("#confirmationModalOkButton").click();
  await expect(
    page.getByRole("heading", { name: "Create account" }),
  ).not.toBeVisible();
  await expect(page.getByText("Function call result")).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByText("Created new NEAR account myweb4test.near"),
  ).toBeVisible({ timeout: 10_000 });
});
