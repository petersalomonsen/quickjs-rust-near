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

  await setupNearAIRoute({ page });
  
  // First, inspect the contract tools
  questionArea.fill(
    "Which tools are available for the contract webassemblymusic.near?",
  );
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Ask NEAR AI" }).click();

  // Wait for the dynamic tools response
  await expect(
    await page.getByText(
      '[{"name":"test_tool","description":"A test tool","parameters":{"type":"object","properties":{"foo":{"type":"string"}},"required":["foo"]}}]',
    ),
  ).toBeVisible();
  
  // Now select the contract for tools
  await page.waitForTimeout(1000);
  questionArea.fill(
    "Please select webassemblymusic.near as the contract for tools",
  );
  await page.getByRole("button", { name: "Ask NEAR AI" }).click();
  
  // Wait for the contract selection confirmation
  await expect(
    await page.getByText("I'll set the webassemblymusic.near contract for tools.")
  ).toBeVisible();
  
  // Wait for the tool call result to be processed
  await page.waitForTimeout(1000);
  
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
    await page.getByText(/The NFT minting process completed successfully/)
  ).toBeVisible();
  
  // Check that the NFT title is mentioned in the response
  await expect(
    await page.getByText(/Your new NFT titled "Sample NFT Title"/)
  ).toBeVisible();
});
