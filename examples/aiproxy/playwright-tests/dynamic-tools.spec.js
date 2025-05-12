import { test, expect } from "@playwright/test";
import { setupNearAIRoute, setupStorage } from "./nearai";

test("dynamic tool definitions are included in chat completion request", async ({
  page,
}) => {
  await setupStorage({ page, withAuthObject: true });
  await page.waitForTimeout(1000);
  const questionArea = await page.getByPlaceholder(
    "Type your question here...",
  );

  questionArea.fill(
    "Which tools are available for the contract webassemblymusic.near?",
  );
  await page.waitForTimeout(1000);

  await setupNearAIRoute({ page });
  await page.getByRole("button", { name: "Ask NEAR AI" }).click();

  // Wait for the dynamic tools response
  await expect(
    await page.getByText(
      '[{"name":"test_tool","description":"A test tool","parameters":{"type":"object","properties":{"foo":{"type":"string"}},"required":["foo"]}}]',
    ),
  ).toBeVisible();
});
