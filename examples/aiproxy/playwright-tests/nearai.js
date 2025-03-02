import { responses } from "./nearairesponses.js";

/**
 * Sets up the local storage and routes for the Playwright page.
 *
 * @param {Object} params - The parameters for the setup.
 * @param {import('playwright').Page} params.page - The Playwright page object.
 * @returns {Promise<Object>} The setup data including contractId, accountId, and publicKey.
 */
export async function setupStorage({ page, withAuthObject = false }) {
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
  return { contractId, accountId, publicKey, functionAccessKeyPair };
}

/**
 * @param {Object} params - The parameters for the setup.
 * @param {import('playwright').Page} params.page - The Playwright page object.
 */
export async function setupNearAIRoute({ page }) {
  await page.route("https://api.near.ai/v1/chat/completions", async (route) => {
    const postdata = JSON.parse(route.request().postData());
    const message = postdata.messages[postdata.messages.length - 1].content;
    await route.fulfill({
      json: responses[message] ?? responses["Hello"],
    });
  });
}
