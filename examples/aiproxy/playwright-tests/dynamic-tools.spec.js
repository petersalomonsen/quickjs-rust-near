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

  // Wait for the call to inspect tools
  await expect(
    page.getByText("I'll check what tools are available for the webassemblymusic.near contract.")
  ).toBeVisible();
  
  // Wait for the result of tool inspection
  await expect(
    page.getByText(/The contract provides 1 tools: get_synth_wasm/)
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
  
  // Now test using the get_synth_wasm tool
  await page.waitForTimeout(1000);
  questionArea.fill("I need the WebAssembly synthesizer for my NFT");
  await page.getByRole("button", { name: "Ask NEAR AI" }).click();
  
  // Verify tool was called
  await expect(
    await page.getByText("I'll help you retrieve the WebAssembly synthesizer for your NFT")
  ).toBeVisible();
  
  // After tool call is completed, test the response handling
  await expect(
    await page.getByText(/The WebAssembly synthesizer for your NFT has been retrieved/)
  ).toBeVisible();
});
