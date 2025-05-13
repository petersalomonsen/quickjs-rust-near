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

  // First, select the contract for tools
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
  
  // Now test using one of the tools
  await page.waitForTimeout(1000);
  questionArea.fill("I want to mint an NFT");
  await page.getByRole("button", { name: "Ask NEAR AI" }).click();
  
  // Verify tool was called
  await expect(
    await page.getByText("I'll help you mint a new NFT using the available tools.")
  ).toBeVisible();
  
  // After tool call is completed, test the response handling
  await expect(
    await page.getByText("Sample NFT Title")
  ).toBeVisible();
});
