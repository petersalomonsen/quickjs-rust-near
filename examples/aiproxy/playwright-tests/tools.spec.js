import { test, expect } from "@playwright/test";
import { setupStorage, setupNearAIRoute } from "./nearai.js";
import { connect, keyStores, utils, transactions } from "near-api-js";

async function setupStorageAndRoutes({ page }) {
  const rpc_url = "http://localhost:14500";
  const { contractId, unregisteredaiuser } = await fetch(
    "http://localhost:14501",
  ).then((r) => r.json());

  await page.route("https://rpc.mainnet.near.org/", async (route) => {
    const response = await route.fetch({ url: rpc_url });
    await route.fulfill({ response });
  });

  const fullAccessKeyPair = utils.KeyPair.fromString(
    unregisteredaiuser.fullAccessKeyPair,
  );

  await page.goto("/");
  await page.evaluate(
    ({ accountId, publicKey, keyPair, contractId }) => {
      localStorage.setItem(
        "near_app_wallet_auth_key",
        JSON.stringify({ accountId, allKeys: [publicKey] }),
      );
      localStorage.setItem(
        `near-api-js:keystore:${accountId}:mainnet`,
        keyPair,
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

      localStorage.setItem(
        "NearAIAuthObject",
        JSON.stringify({
          message: "Login to NEAR AI",
          nonce: "1740337238663",
          recipient: "ai.near",
          callback_url: "http://127.0.0.1:8080/",
        }),
      );
    },
    {
      accountId: unregisteredaiuser.accountId,
      publicKey: fullAccessKeyPair.getPublicKey().toString(),
      keyPair: fullAccessKeyPair.toString(),
      contractId,
    },
  );

  await page.reload();
}

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
    page.getByRole("heading", { name: "Buy fungible tokens" }),
  ).toBeVisible();

  await page.locator("#confirmationModalOkButton").click();
  await expect(
    page.getByRole("heading", { name: "Buy fungible tokens" }),
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
