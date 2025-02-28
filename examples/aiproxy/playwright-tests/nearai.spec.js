import { test, expect } from "@playwright/test";
import { responses } from "./nearairesponses.js";
/**
 * Sets up the local storage and routes for the Playwright page.
 *
 * @param {Object} params - The parameters for the setup.
 * @param {import('playwright').Page} params.page - The Playwright page object.
 * @returns {Promise<Object>} The setup data including contractId, accountId, and publicKey.
 */
async function setupStorageAndRoute({ page, withAuthObject = false }) {
  const { functionAccessKeyPair, publicKey, accountId, contractId } =
    await fetch("http://localhost:14501").then((r) => r.json());

  await page.goto("/");
  await page.evaluate(
    ({
      accountId,
      publicKey,
      functionAccessKeyPair,
      contractId,
      withAuthObject,
    }) => {
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
      if (withAuthObject) {
        localStorage.setItem(
          "NearAIAuthObject",
          JSON.stringify({
            message: "Login to NEAR AI",
            nonce: "1740337238663",
            recipient: "ai.near",
            callback_url: "http://127.0.0.1:8080/",
          }),
        );
      }
    },
    { accountId, publicKey, functionAccessKeyPair, contractId, withAuthObject },
  );

  await page.reload();

  await page.route("https://api.near.ai/v1/chat/completions", async (route) => {
    const postdata = JSON.parse(route.request().postData());
    const message = postdata.messages[postdata.messages.length - 1].content;
    await route.fulfill({
      json: responses[message] ?? responses["Hello"],
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
  const { publicKey, accountId } = await fetch("http://localhost:14501").then(
    (r) => r.json(),
  );

  await setupStorageAndRoute({ page });
  await page.goto("/");
  await page.waitForTimeout(1000);
  let questionArea = await page.getByPlaceholder("Type your question here...");
  await expect(questionArea).toBeEnabled();
  questionArea.fill("Hello");

  const baseURL = page.url();
  await page.getByRole("button", { name: "Ask NEAR AI" }).click();
  await expect(
    page.url().startsWith("https://app.mynearwallet.com"),
  ).toBeTruthy();

  await page.waitForTimeout(500);
  const redirectUrl = `${baseURL}#accountId=${accountId}&publicKey=${publicKey}&signature=abcd`;
  await page.evaluate((redirectUrl) => {
    location.href = redirectUrl;
  }, redirectUrl);

  questionArea = await page.getByPlaceholder("Type your question here...");

  questionArea.fill("Hello again");
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: "Ask NEAR AI" }).click();

  await expect(
    await page.getByText("How can I assist you today?"),
  ).toBeVisible();
});

test("Tool call", async ({ page }) => {
  await setupStorageAndRoute({ page, withAuthObject: true });
  await page.waitForTimeout(1000);
  const questionArea = await page.getByPlaceholder(
    "Type your question here...",
  );

  questionArea.fill(
    "Can you create a web4 javascript code that shows the current account and current date?",
  );
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: "Ask NEAR AI" }).click();

  await expect(
    await page.getByText("How can I assist you today?"),
  ).toBeVisible();
});
