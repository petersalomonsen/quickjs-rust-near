import { utils } from "near-api-js";

export async function setupStorageAndRoutes({ page }) {
  const rpc_url = "http://localhost:14500";
  const { contractId, unregisteredaiuser } = await fetch(
    "http://localhost:14501",
  ).then((r) => r.json());

  await page.route("https://rpc.mainnet.near.org/", async (route) => {
    const response = await route.fetch({ url: rpc_url });
    await route.fulfill({ response });
  });

  await page.route("https://rpc.mainnet.fastnear.com/", async (route) => {
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
