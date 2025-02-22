import { test, expect } from '@playwright/test';

/**
 * Sets up the local storage and routes for the Playwright page.
 *
 * @param {Object} params - The parameters for the setup.
 * @param {import('playwright').Page} params.page - The Playwright page object.
 * @returns {Promise<Object>} The setup data including contractId, accountId, and publicKey.
 */
async function setupStorageAndRoute({ page }) {
    const { functionAccessKeyPair, publicKey, accountId, contractId } =
      await fetch("http://localhost:14501").then((r) => r.json());
  
    await page.goto("/");
    await page.evaluate(
      ({ accountId, publicKey, functionAccessKeyPair, contractId }) => {
        localStorage.setItem(
          "near_app_wallet_auth_key",
          JSON.stringify({ accountId, allKeys: [publicKey] }),
        );
        localStorage.setItem(
          `near-api-js:keystore:${accountId}:mainnet`,
          functionAccessKeyPair,
        );
        localStorage.setItem(`contractId`, contractId);
        localStorage.setItem(
          "near-wallet-selector:selectedWalletId",
          JSON.stringify("my-near-wallet"),
        );
        localStorage.setItem(
          "near-wallet-selector:recentlySignedInWallets",
          JSON.stringify(["my-near-wallet"]),
        );
        localStorage.setItem(
          "near-wallet-selector:contract",
          JSON.stringify({ contractId, methodNames: ["call_js_func"] }),
        );
      },
      { accountId, publicKey, functionAccessKeyPair, contractId },
    );
  
    await page.reload();
    const baseURL = page.url();
    await page.route("https://app.mynearwallet.com/*", async (route) => {
        const redirectUrl = `${baseURL}?accountId=${accountId}&publicKey=${publicKey}&signature=abcd`;
        await route.fulfill({
          status: 302,
          headers: {
            location: redirectUrl,
          },
        });
    });
    await page.route("https://api.near.ai/v1/chat/completions", async(route) => {
        await route.fulfill({
            json: {
                "id": "1ab9dc62-95ca-44e9-aa27-d5fbbbb43c08",
                "choices": [
                    {
                        "finish_reason": "stop",
                        "index": 0,
                        "logprobs": null,
                        "message": {
                            "content": "Hello! How can I assist you today?",
                            "refusal": null,
                            "role": "assistant",
                            "audio": null,
                            "function_call": null,
                            "tool_calls": null
                        }
                    }
                ],
                "created": 1740235568,
                "model": "accounts/fireworks/models/qwen2p5-72b-instruct",
                "object": "chat.completion",
                "service_tier": null,
                "system_fingerprint": null,
                "usage": {
                    "completion_tokens": 10,
                    "prompt_tokens": 208,
                    "total_tokens": 218,
                    "completion_tokens_details": null,
                    "prompt_tokens_details": null
                }
            }
        });
    });
    return { contractId, accountId, publicKey, functionAccessKeyPair };
  }

test("start conversation without login", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);
  const questionArea = await page.getByPlaceholder(
    "Type your question here...",
  );
  await expect(questionArea).toBeEnabled();
  questionArea.fill("Hello");
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: "Ask NEAR AI" }).click();

  await expect(await page.locator("#progressErrorAlert")).toBeVisible();
  await expect(await page.locator("#progressErrorAlert")).toContainText(
    "Error: No wallet selected",
  );
  await expect(await page.getByLabel("Close")).toBeVisible();
});

test("login to NEAR AI", async ({ page }) => {
    await setupStorageAndRoute({page});
    await page.goto("/");
    await page.waitForTimeout(1000);
    const questionArea = await page.getByPlaceholder(
      "Type your question here...",
    );
    await expect(questionArea).toBeEnabled();
    questionArea.fill("Hello");
    await page.waitForTimeout(1000);
  
    await page.getByRole("button", { name: "Ask NEAR AI" }).click();

    questionArea.fill("Hello again");
    await page.waitForTimeout(1000);
  
    await page.getByRole("button", { name: "Ask NEAR AI" }).click();

    await expect(await page.getByText("How can I assist you today?")).toBeVisible();
});