import { utils } from "near-api-js";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Set up local storage with full access key pair
 * @param {Object} params - The parameters for the setup.
 * @param {import('playwright').Page} params.page - The Playwright page object.
 */
export async function setupStorageAndRoutes({ page }) {
  await cacheCDN(page);
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
  await page.waitForLoadState("networkidle");
}

/**
 * Call this to ensure that static cdn data is cached and not re-fetched on page reloads
 * Without this you may run into that the CDN will not serve files because of too many requests
 * @param {import('playwright').Page} page - Playwright page object
 */
export async function cacheCDN(page) {
  const cacheDir = path.join(os.tmpdir(), "cdn-cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const cacheRoute = async (url) => {
    await page.route(url, async (route, request) => {
      const urlHash = Buffer.from(request.url()).toString("base64");
      const cacheFilePath = path.join(cacheDir, urlHash);

      if (
        fs.existsSync(cacheFilePath) &&
        fs.existsSync(`${cacheFilePath}.type`)
      ) {
        const cachedContent = await fs.promises.readFile(cacheFilePath);
        const contentType = await fs.promises.readFile(
          `${cacheFilePath}.type`,
          "utf-8",
        );
        await route.fulfill({
          body: cachedContent,
          headers: { "Content-Type": contentType },
        });
      } else {
        const response = await route.fetch();
        const body = await response.body();
        const contentType =
          response.headers()["content-type"] || "application/octet-stream";

        await fs.promises.writeFile(cacheFilePath, body);
        await fs.promises.writeFile(`${cacheFilePath}.type`, contentType);

        await route.fulfill({
          body,
          headers: response.headers(),
        });
      }
    });
  };

  await cacheRoute("https://cdn.jsdelivr.net/**");
  await cacheRoute("https://ga.jspm.io/**");
}
