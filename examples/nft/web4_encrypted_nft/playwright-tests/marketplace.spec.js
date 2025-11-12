import { test, expect } from "@playwright/test";
import { readFile } from "fs/promises";
import { Sandbox, DEFAULT_PRIVATE_KEY, DEFAULT_PUBLIC_KEY } from "near-sandbox";
import { KeyPair, transactions, utils } from "near-api-js";
import crypto from "crypto";
import {
  NearRpcClient,
  broadcastTxCommit,
  viewAccessKey,
  viewFunctionAsJson,
} from "@near-js/jsonrpc-client";
import { RistrettoPoint } from "@noble/curves/ed25519";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CURVE_ORDER = 2n ** 252n + 27742317777372353535851937790883648493n;

function bufferToScalar(buffer) {
  let value = 0n;
  for (let i = buffer.length - 1; i >= 0; i--) {
    value = (value << 8n) | BigInt(buffer[i]);
  }
  value = value % CURVE_ORDER;
  return value === 0n ? 1n : value;
}

function scalarToBuffer(scalar) {
  const buffer = Buffer.alloc(32);
  let value = scalar;
  for (let i = 0; i < 32; i++) {
    buffer[i] = Number(value & 0xffn);
    value = value >> 8n;
  }
  return buffer;
}

test.describe("Encrypted NFT Marketplace", () => {
  let sandbox;
  let rpcUrl;
  let rpcClient;
  let accountKeys;
  let contractAccount;
  let sellerAccount;
  let buyerAccount;
  let sellerKeyPair;
  let buyerKeyPair;
  let sellerRistrettoPrivateKey;
  let buyerRistrettoPrivateKey;
  let page;
  let context;
  let httpServer;
  let httpServerPort = 8765;

  test.beforeAll(async ({ browser }) => {
    console.log("🚀 Starting sandbox...");
    sandbox = await Sandbox.start({
      version: "2.8.0",
      timeout: 60000,
      config: {
        additionalGenesis: {
          records: [
            {
              Account: {
                account_id: "test.near",
                account: {
                  amount: "1000000000000000000000000000000000",
                  locked: "50000000000000000000000000000000",
                  code_hash: "11111111111111111111111111111111",
                  storage_usage: 0,
                  version: "V1",
                },
              },
            },
            {
              AccessKey: {
                account_id: "test.near",
                public_key: DEFAULT_PUBLIC_KEY,
                access_key: { nonce: 0, permission: "FullAccess" },
              },
            },
            {
              Account: {
                account_id: "near",
                account: {
                  amount: "1000000000000000000000000000000000",
                  locked: "0",
                  code_hash: "11111111111111111111111111111111",
                  storage_usage: 0,
                  version: "V1",
                },
              },
            },
            {
              AccessKey: {
                account_id: "near",
                public_key: DEFAULT_PUBLIC_KEY,
                access_key: { nonce: 0, permission: "FullAccess" },
              },
            },
            {
              Account: {
                account_id: "sandbox",
                account: {
                  amount: "10000000000000000000000000000",
                  locked: "0",
                  code_hash: "11111111111111111111111111111111",
                  storage_usage: 182,
                },
              },
            },
            {
              AccessKey: {
                account_id: "sandbox",
                public_key: DEFAULT_PUBLIC_KEY,
                access_key: { nonce: 0, permission: "FullAccess" },
              },
            },
          ],
        },
      },
    });

    rpcUrl = sandbox.rpcUrl;
    rpcClient = new NearRpcClient(rpcUrl);
    accountKeys = new Map();

    const rootKeyPair = KeyPair.fromString(DEFAULT_PRIVATE_KEY);
    accountKeys.set("test.near", rootKeyPair);
    accountKeys.set("near", rootKeyPair);
    accountKeys.set("sandbox", rootKeyPair);

    console.log(`✅ Sandbox started: ${rpcUrl}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Helper functions
    async function getLatestBlockHash() {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "dontcare",
          method: "block",
          params: { finality: "final" },
        }),
      });
      const result = await response.json();
      return result.result.header.hash;
    }

    async function getAccessKeyNonce(accountId, publicKey) {
      const result = await viewAccessKey(rpcClient, {
        accountId,
        publicKey,
        finality: "final",
      });
      return result.nonce;
    }

    async function createAccount(
      accountId,
      initialBalance = "100000000000000000000000000",
    ) {
      const newKeyPair = KeyPair.fromRandom("ed25519");
      accountKeys.set(accountId, newKeyPair);

      // Determine which root account to use based on the account suffix
      const rootAccountId = accountId.endsWith(".near") ? "near" : "test.near";

      const actions = [
        transactions.createAccount(),
        transactions.transfer(
          utils.format.parseNearAmount(initialBalance.replace(/0{24}$/, "")),
        ),
        transactions.addKey(
          newKeyPair.getPublicKey(),
          transactions.fullAccessKey(),
        ),
      ];

      const blockHash = await getLatestBlockHash();
      const nonce = await getAccessKeyNonce(
        rootAccountId,
        rootKeyPair.getPublicKey().toString(),
      );

      const tx = transactions.createTransaction(
        rootAccountId,
        rootKeyPair.getPublicKey(),
        accountId,
        nonce + 1,
        actions,
        utils.serialize.base_decode(blockHash),
      );

      const serializedTx = utils.serialize.serialize(
        transactions.SCHEMA.Transaction,
        tx,
      );
      const txHash = crypto.createHash("sha256").update(serializedTx).digest();
      const signature = rootKeyPair.sign(txHash);

      const signedTx = new transactions.SignedTransaction({
        transaction: tx,
        signature: new transactions.Signature({
          keyType: tx.publicKey.keyType,
          data: signature.signature,
        }),
      });

      const signedTxBytes = signedTx.encode();
      const signedTxBase64 = Buffer.from(signedTxBytes).toString("base64");
      await broadcastTxCommit(rpcClient, {
        signedTxBase64,
        waitUntil: "FINAL",
      });

      console.log(`  ✅ Created account: ${accountId}`);
      return newKeyPair;
    }

    async function deployContract(accountId, wasmCode) {
      const keyPair = accountKeys.get(accountId);
      const actions = [transactions.deployContract(wasmCode)];

      const blockHash = await getLatestBlockHash();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const nonce = await getAccessKeyNonce(
        accountId,
        keyPair.getPublicKey().toString(),
      );

      const tx = transactions.createTransaction(
        accountId,
        keyPair.getPublicKey(),
        accountId,
        nonce + 1,
        actions,
        utils.serialize.base_decode(blockHash),
      );

      const serializedTx = utils.serialize.serialize(
        transactions.SCHEMA.Transaction,
        tx,
      );
      const txHash = crypto.createHash("sha256").update(serializedTx).digest();
      const signature = keyPair.sign(txHash);

      const signedTx = new transactions.SignedTransaction({
        transaction: tx,
        signature: new transactions.Signature({
          keyType: tx.publicKey.keyType,
          data: signature.signature,
        }),
      });

      const signedTxBytes = signedTx.encode();
      const signedTxBase64 = Buffer.from(signedTxBytes).toString("base64");
      await broadcastTxCommit(rpcClient, {
        signedTxBase64,
        waitUntil: "FINAL",
      });

      console.log(`  ✅ Deployed contract to: ${accountId}`);
    }

    // Create accounts
    console.log("📝 Creating accounts...");
    contractAccount = "wasmmusic.near";

    await createAccount(contractAccount);

    // Generate keypairs for seller and buyer (implicit accounts)
    sellerKeyPair = KeyPair.fromRandom("ed25519");
    buyerKeyPair = KeyPair.fromRandom("ed25519");

    // Derive implicit account IDs from public keys (hex representation of public key data)
    sellerAccount = Buffer.from(sellerKeyPair.getPublicKey().data).toString(
      "hex",
    );
    buyerAccount = Buffer.from(buyerKeyPair.getPublicKey().data).toString(
      "hex",
    );

    // Store keypairs FIRST so the funding transactions can use them
    accountKeys.set(sellerAccount, sellerKeyPair);
    accountKeys.set(buyerAccount, buyerKeyPair);

    // Fund the implicit accounts by transferring NEAR to them
    // For implicit accounts, we just transfer funds - the account is created automatically
    // and the access key is implicitly the public key that the account ID is derived from
    async function fundImplicitAccount(accountId, amount) {
      const actions = [
        transactions.transfer(
          utils.format.parseNearAmount(amount.replace(/0{24}$/, "")),
        ),
      ];

      const blockHash = await getLatestBlockHash();
      const nonce = await getAccessKeyNonce(
        "test.near",
        rootKeyPair.getPublicKey().toString(),
      );

      const tx = transactions.createTransaction(
        "test.near",
        rootKeyPair.getPublicKey(),
        accountId,
        nonce + 1,
        actions,
        utils.serialize.base_decode(blockHash),
      );

      const serializedTx = utils.serialize.serialize(
        transactions.SCHEMA.Transaction,
        tx,
      );
      const txHash = crypto.createHash("sha256").update(serializedTx).digest();
      const signature = rootKeyPair.sign(txHash);

      const signedTx = new transactions.SignedTransaction({
        transaction: tx,
        signature: new transactions.Signature({
          keyType: tx.publicKey.keyType,
          data: signature.signature,
        }),
      });

      const signedTxBytes = signedTx.encode();
      const signedTxBase64 = Buffer.from(signedTxBytes).toString("base64");
      await broadcastTxCommit(rpcClient, {
        signedTxBase64,
        waitUntil: "FINAL",
      });

      console.log(`  ✅ Funded implicit account: ${accountId}`);
    }

    await fundImplicitAccount(sellerAccount, "100000000000000000000000000");
    await fundImplicitAccount(buyerAccount, "100000000000000000000000000");

    // Deploy contract
    console.log("📦 Deploying contract...");
    const wasmPath = path.join(__dirname, "../../out/nft.wasm");
    const wasmCode = await readFile(wasmPath);
    await deployContract(contractAccount, wasmCode);

    // Initialize contract and upload JavaScript
    console.log("🔧 Initializing contract...");
    async function functionCall(
      accountId,
      contractId,
      methodName,
      args,
      gas = "300000000000000",
      deposit = "0",
    ) {
      const keyPair = accountKeys.get(accountId);
      if (!keyPair) throw new Error(`No key for account ${accountId}`);

      const actions = [
        transactions.functionCall(
          methodName,
          args,
          BigInt(gas),
          BigInt(deposit),
        ),
      ];

      const blockHash = await getLatestBlockHash();
      await new Promise((resolve) => setTimeout(() => resolve(), 1000));
      const nonce = await getAccessKeyNonce(
        accountId,
        keyPair.getPublicKey().toString(),
      );

      const tx = transactions.createTransaction(
        accountId,
        keyPair.getPublicKey(),
        contractId,
        nonce + 1,
        actions,
        utils.serialize.base_decode(blockHash),
      );

      const serializedTx = utils.serialize.serialize(
        transactions.SCHEMA.Transaction,
        tx,
      );
      const txHash = crypto.createHash("sha256").update(serializedTx).digest();
      const signature = keyPair.sign(txHash);

      const signedTx = new transactions.SignedTransaction({
        transaction: tx,
        signature: new transactions.Signature({
          keyType: tx.publicKey.keyType,
          data: signature.signature,
        }),
      });

      const signedTxBytes = signedTx.encode();
      const signedTxBase64 = Buffer.from(signedTxBytes).toString("base64");
      const result = await broadcastTxCommit(rpcClient, {
        signedTxBase64,
        waitUntil: "FINAL",
      });

      if (result.status.Failure) {
        console.error(
          `  ❌ Failed to call ${methodName} on ${contractId}:`,
          JSON.stringify(result.status.Failure, null, 2),
        );
        throw new Error(`Function call failed: ${methodName}`);
      }

      return result;
    }

    await functionCall(contractAccount, contractAccount, "new", {});
    console.log("  ✅ Contract initialized");

    // Build the marketplace bundle with build.js
    console.log("📦 Building marketplace bundle...");
    const projectRoot = path.join(__dirname, "..");
    try {
      await execAsync("node build.js", { cwd: projectRoot });
      console.log("  ✅ Marketplace bundle created");
    } catch (error) {
      console.error("  ❌ Build failed:", error.message);
      throw error;
    }

    // Upload the bundled JavaScript (includes embedded HTML)
    const nftJavascript = await readFile(
      path.join(projectRoot, "contract-bundle.js"),
      "utf-8",
    );
    console.log(`  📄 Bundled contract size: ${nftJavascript.length} bytes`);

    await functionCall(contractAccount, contractAccount, "post_javascript", {
      javascript: nftJavascript,
    });
    console.log(
      "  ✅ JavaScript bundle uploaded (with embedded marketplace HTML)",
    );

    // Generate Ristretto keypairs
    console.log("🔑 Generating Ristretto keypairs...");
    sellerRistrettoPrivateKey = bufferToScalar(crypto.randomBytes(32));
    buyerRistrettoPrivateKey = bufferToScalar(crypto.randomBytes(32));

    console.log(`  Seller NEAR: ${sellerAccount}`);
    console.log(`  Buyer NEAR: ${buyerAccount}`);

    // Helper to call view functions
    async function viewFunction(contractId, methodName, args) {
      const result = await viewFunctionAsJson(rpcClient, {
        accountId: contractId,
        methodName: methodName,
        argsBase64: Buffer.from(JSON.stringify(args)).toString("base64"),
        finality: "final",
      });
      return result;
    }

    // Start HTTP server that mimics Web4 gateway behavior
    console.log("🌐 Starting Web4 gateway server...");

    httpServer = createServer(async (req, res) => {
      try {
        // Call web4_get directly (like real Web4 gateway)
        const web4Result = await viewFunction(contractAccount, "web4_get", {
          request: { path: req.url },
        });

        // Decode base64 HTML body (web4_get returns { body: base64String, contentType: string })
        const htmlContent = Buffer.from(web4Result.body, "base64").toString(
          "utf-8",
        );

        // Inject sandbox RPC endpoint for testing
        const modifiedHtml = htmlContent
          .replace(/https:\/\/rpc\.testnet\.fastnear\.com/g, rpcUrl)
          .replace(/https:\/\/rpc\.mainnet\.fastnear\.com/g, rpcUrl);

        res.writeHead(200, { "Content-Type": web4Result.contentType });
        res.end(modifiedHtml);
      } catch (error) {
        console.error("Web4 gateway error:", error);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`Error: ${error.message}`);
      }
    });

    await new Promise((resolve) => {
      httpServer.listen(httpServerPort, () => {
        console.log(
          `✅ Web4 gateway server listening on http://localhost:${httpServerPort}`,
        );
        resolve();
      });
    });

    // Create test-results directory if it doesn't exist
    const { mkdirSync } = await import("fs");
    mkdirSync("test-results", { recursive: true });

    // Create browser context with video recording enabled
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: {
        dir: "test-results/",
        size: { width: 1280, height: 800 },
      },
      ignoreHTTPSErrors: true,
    });

    // Convert contract account to web4 hostname
    // e.g., wasmmusic.near → wasmmusic.near.page
    const contractName = contractAccount.replace(/\.near$/, "");
    const web4Hostname = `${contractName}.near.page`;

    console.log(`🌐 Web4 hostname: ${web4Hostname} (from ${contractAccount})`);

    // Add route to map web4 hostname to localhost server
    await context.route(`**://${web4Hostname}/**`, async (route) => {
      const url = new URL(route.request().url());
      url.protocol = "http:";
      url.hostname = "localhost";
      url.port = httpServerPort;

      // Fetch from localhost and fulfill with the response
      const response = await route.fetch({ url: url.toString() });
      await route.fulfill({ response });
    });

    page = await context.newPage();
    page.setDefaultTimeout(60000);

    // Listen to console messages
    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === "error") {
        console.log(`🔴 Browser error: ${text}`);
      } else if (type === "warning") {
        console.log(`⚠️  Browser warning: ${text}`);
      } else if (text.includes("❌") || text.includes("Error")) {
        console.log(`Browser: ${text}`);
      }
    });

    // Listen to page errors
    page.on("pageerror", (error) => {
      console.log(`🔴 Page error: ${error.message}`);
    });

    // Load marketplace page
    console.log("📄 Loading marketplace page...");
    const web4Url = `https://${web4Hostname}/`;
    console.log(`   Using web4-style URL: ${web4Url}`);

    try {
      await page.goto(web4Url, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });

      // Wait for libraries to load
      await page.waitForFunction(
        () => {
          return (
            window.RistrettoPoint &&
            window.nearApi &&
            window.nearRpc &&
            window.nearRpc.viewFunctionAsJson
          );
        },
        { timeout: 60000 },
      );

      console.log("✅ Marketplace page loaded");
    } catch (error) {
      console.error("❌ Failed to load marketplace page:", error.message);
      throw error;
    }
  });

  test.afterAll(async () => {
    // Close page and context to save video
    if (page) {
      await page.close();
      console.log("📄 Page closed");
    }
    if (context) {
      await context.close();
      console.log("🎥 Video saved to test-results/");
    }
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      console.log("🛑 Web4 gateway server stopped");
    }
    if (sandbox) {
      console.log("🧹 Tearing down sandbox...");
      await sandbox.tearDown();
    }
  });

  test("should complete full NFT marketplace flow", async () => {
    console.log(
      "\n📝 Test: Full marketplace flow (mint → list → buy → complete)...",
    );

    // Override RPC URL once for entire test
    await page.evaluate((url) => {
      window.testRpcUrl = url;
      window.getRpcUrl = () => url;
    }, rpcUrl);

    // IMPORTANT: The accountId in credentials must match the implicit account ID
    // which is derived from the Ed25519 public key (hex of public key data)
    // The sellerAccount and buyerAccount passed in are already the implicit account IDs

    // Create seller credentials (using the pre-generated keypair)
    const sellerCreds = {
      accountId: sellerAccount, // This is the implicit account ID (hex of public key)
      signingKeyPair: sellerKeyPair.toString(),
      encryptionKeyPair: {
        private_scalar_hex: scalarToBuffer(sellerRistrettoPrivateKey).toString(
          "hex",
        ),
        public_key_base64: Buffer.from(
          RistrettoPoint.BASE.multiply(sellerRistrettoPrivateKey).toRawBytes(),
        ).toString("base64"),
      },
    };

    // Create buyer credentials (using the pre-generated keypair)
    const buyerCreds = {
      accountId: buyerAccount, // This is the implicit account ID (hex of public key)
      signingKeyPair: buyerKeyPair.toString(),
      encryptionKeyPair: {
        private_scalar_hex: scalarToBuffer(buyerRistrettoPrivateKey).toString(
          "hex",
        ),
        public_key_base64: Buffer.from(
          RistrettoPoint.BASE.multiply(buyerRistrettoPrivateKey).toRawBytes(),
        ).toString("base64"),
      },
    };

    // Credential store (isolated in Playwright context, like a real password manager)
    const credentialStore = [
      {
        id: "Seller Wallet",
        name: "Seller Wallet",
        password: Buffer.from(JSON.stringify(sellerCreds)).toString("base64"),
        type: "password",
      },
      {
        id: "Buyer Wallet",
        name: "Buyer Wallet",
        password: Buffer.from(JSON.stringify(buyerCreds)).toString("base64"),
        type: "password",
      },
    ];

    // Expose function to get all available credentials (for picker)
    await page.exposeFunction("__mockCredentialsGetAll", async () => {
      return credentialStore;
    });

    await page.exposeFunction("__mockCredentialsStore", async (credential) => {
      credentialStore.push(credential);
      return credential;
    });

    // Set up credential mocking in browser
    await page.evaluate(() => {
      // Helper function to show credential overlay
      window.showCredentialOverlay = (message, action) => {
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.top = "50%";
        overlay.style.left = "50%";
        overlay.style.transform = "translate(-50%, -50%)";
        overlay.style.backgroundColor =
          action === "storing" ? "#4CAF50" : "#2196F3";
        overlay.style.color = "white";
        overlay.style.padding = "30px 50px";
        overlay.style.borderRadius = "10px";
        overlay.style.fontSize = "24px";
        overlay.style.fontWeight = "bold";
        overlay.style.zIndex = "10000";
        overlay.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.3)";
        overlay.style.fontFamily = "system-ui, -apple-system, sans-serif";
        overlay.textContent = message;
        document.body.appendChild(overlay);

        setTimeout(() => {
          overlay.remove();
        }, 500);
      };

      // Initialize navigator.credentials if it doesn't exist
      if (!navigator.credentials) {
        navigator.credentials = {};
      }

      // Mock navigator.credentials.get - shows interactive credential picker
      navigator.credentials.get = async (options) => {
        if (options.password) {
          // Get all available credentials from Playwright context
          const credentials = await window.__mockCredentialsGetAll();

          // Show credential picker overlay (simulates password manager UI)
          return new Promise((resolve) => {
            const pickerOverlay = document.createElement("div");
            pickerOverlay.id = "credential-picker-overlay";
            pickerOverlay.style.position = "fixed";
            pickerOverlay.style.top = "0";
            pickerOverlay.style.left = "0";
            pickerOverlay.style.width = "100%";
            pickerOverlay.style.height = "100%";
            pickerOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
            pickerOverlay.style.display = "flex";
            pickerOverlay.style.alignItems = "center";
            pickerOverlay.style.justifyContent = "center";
            pickerOverlay.style.zIndex = "10000";
            pickerOverlay.style.fontFamily =
              "system-ui, -apple-system, sans-serif";

            const pickerDialog = document.createElement("div");
            pickerDialog.style.backgroundColor = "white";
            pickerDialog.style.borderRadius = "12px";
            pickerDialog.style.padding = "30px";
            pickerDialog.style.minWidth = "400px";
            pickerDialog.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.3)";

            const title = document.createElement("h2");
            title.textContent = "🔐 Select Credential";
            title.style.margin = "0 0 20px 0";
            title.style.fontSize = "24px";
            title.style.color = "#333";
            pickerDialog.appendChild(title);

            const subtitle = document.createElement("p");
            subtitle.textContent = "Choose a wallet to sign this transaction:";
            subtitle.style.margin = "0 0 20px 0";
            subtitle.style.color = "#666";
            subtitle.style.fontSize = "14px";
            pickerDialog.appendChild(subtitle);

            // Create button for each credential
            credentials.forEach((cred, index) => {
              const button = document.createElement("button");
              button.className = "credential-picker-button";
              button.setAttribute("data-credential-index", index);
              button.textContent = `🔑 ${cred.name}`;
              button.style.display = "block";
              button.style.width = "100%";
              button.style.padding = "15px 20px";
              button.style.margin = "10px 0";
              button.style.fontSize = "16px";
              button.style.fontWeight = "bold";
              button.style.backgroundColor = "#2196F3";
              button.style.color = "white";
              button.style.border = "none";
              button.style.borderRadius = "8px";
              button.style.cursor = "pointer";
              button.style.transition = "background-color 0.2s";

              button.onmouseover = () => {
                button.style.backgroundColor = "#1976D2";
              };
              button.onmouseout = () => {
                button.style.backgroundColor = "#2196F3";
              };

              button.onclick = () => {
                // Remove picker
                pickerOverlay.remove();

                // Show "Using" message
                window.showCredentialOverlay(
                  `🔑 Using: ${cred.name}`,
                  "selecting",
                );

                // Wait 500ms before resolving to show the "Using" overlay
                setTimeout(() => {
                  resolve(cred);
                }, 500);
              };

              pickerDialog.appendChild(button);
            });

            pickerOverlay.appendChild(pickerDialog);
            document.body.appendChild(pickerOverlay);
          });
        }
        return null;
      };

      // Mock navigator.credentials.create
      const originalCreate = navigator.credentials.create
        ? navigator.credentials.create.bind(navigator.credentials)
        : null;
      navigator.credentials.create = async (options) => {
        if (options.password) {
          const credential = {
            id: options.password.id,
            name: options.password.name,
            password: options.password.password,
            type: "password",
          };
          // Store in Playwright context (isolated)
          await window.__mockCredentialsStore(credential);
          window.showCredentialOverlay(
            `🔐 Storing: ${credential.name}`,
            "storing",
          );
          return credential;
        }
        return originalCreate ? originalCreate(options) : null;
      };

      // Mock navigator.credentials.store
      navigator.credentials.store = async (credential) => {
        return credential;
      };
    });

    // Log credential creation
    console.log("  🔑 Created seller credential: Seller Wallet");
    console.log(`      Account: ${sellerAccount}`);
    console.log("  🔑 Created buyer credential: Buyer Wallet");
    console.log(`      Account: ${buyerAccount}`);

    // Set up common fields (contract is auto-detected from hostname)
    await page.fill("#common-token-id", "test_nft_1");

    // ========================================
    // Step 1: Mint NFT
    // ========================================
    console.log("\n  📝 Step 1: Minting NFT...");

    // Switch to mint tab
    await page.click('button.tab:has-text("Mint NFT")');

    // Fill in content and deposit
    await page.fill("#mint-content-text", "This is my secret NFT content!");
    await page.fill("#mint-deposit", "0.1");

    // Click mint button
    await page.click('#mint-panel button:has-text("Mint NFT")');

    // Wait for credential picker to appear
    await page.waitForSelector("#credential-picker-overlay", { timeout: 5000 });
    console.log("  🔐 Credential picker appeared");
    await page.waitForTimeout(500); // Pause to show picker in video

    // Select Seller Wallet from the picker (seller is minting)
    await page.click(
      'button.credential-picker-button:has-text("Seller Wallet")',
    );
    console.log("  🔑 Selected seller credential from picker");

    // Wait for either result or error
    try {
      await Promise.race([
        page.waitForSelector("#mint-result.show", { timeout: 40000 }),
        page.waitForSelector("#mint-error.show", { timeout: 40000 }),
      ]);
    } catch (error) {
      await page.screenshot({ path: "test-results/mint-timeout.png" });
      console.log("    ❌ Mint timeout - neither result nor error shown");
      throw error;
    }

    // Check if there's an error
    const mintErrorVisible = await page.isVisible("#mint-error.show");
    if (mintErrorVisible) {
      const errorText = await page.textContent("#mint-error");
      console.log("    ❌ Mint error:", errorText);
      await page.screenshot({ path: "test-results/mint-error.png" });
      throw new Error(`Mint failed: ${errorText}`);
    }

    // Verify mint success
    const mintResultText = await page.textContent("#mint-result-content");
    expect(mintResultText).toContain("test_nft_1");
    expect(mintResultText).toContain(sellerAccount);
    console.log("    ✅ NFT minted successfully");

    // Pause to highlight minting success in video
    await page.waitForTimeout(500);

    // ========================================
    // Step 2: List NFT for sale
    // ========================================
    console.log("\n  📝 Step 2: Listing NFT for sale...");

    await page.click('button.tab:has-text("List for Sale")');

    // Fill in price (contract and token ID already in common fields)
    await page.fill("#list-price", "2.5");

    await page.click('#list-panel button:has-text("List for Sale")');

    // Wait for credential picker to appear
    await page.waitForSelector("#credential-picker-overlay", { timeout: 5000 });
    console.log("  🔐 Credential picker appeared");
    await page.waitForTimeout(500); // Pause to show picker in video

    // Select Seller Wallet from the picker (seller is listing)
    await page.click(
      'button.credential-picker-button:has-text("Seller Wallet")',
    );
    console.log("  🔑 Selected seller credential from picker");

    await page.waitForSelector("#list-result.show", { timeout: 30000 });

    const listResultText = await page.textContent("#list-result-content");
    expect(listResultText).toContain("test_nft_1");
    expect(listResultText).toContain("2.5 NEAR");
    console.log("    ✅ NFT listed successfully");

    // Pause to highlight listing success in video
    await page.waitForTimeout(500);

    // ========================================
    // Step 2a: Seller can view their NFT
    // ========================================
    console.log("\n  📝 Step 2a: Verifying seller can view their NFT...");

    await page.click('button.tab:has-text("View NFT")');
    await page.waitForTimeout(500); // Pause to show View NFT tab

    // Clear any previous results
    await page.evaluate(() => {
      document.getElementById("view-error").classList.remove("show");
      document.getElementById("view-result").classList.remove("show");
    });

    await page.click('#view-panel button:has-text("Decrypt & View Content")');

    // Wait for credential picker to appear
    await page.waitForSelector("#credential-picker-overlay", { timeout: 5000 });
    console.log("  🔐 Credential picker appeared");
    await page.waitForTimeout(500); // Pause to show picker in video

    // Select Seller Wallet from the picker
    await page.click(
      'button.credential-picker-button:has-text("Seller Wallet")',
    );
    console.log("  🔑 Selected seller credential from picker");

    // Wait for either result or error
    await Promise.race([
      page.waitForSelector("#view-result.show", { timeout: 30000 }),
      page.waitForSelector("#view-error.show", { timeout: 30000 }),
    ]);

    const sellerViewError = await page.isVisible("#view-error.show");
    expect(sellerViewError).toBe(false);

    const sellerViewResult = await page.textContent("#view-result-content");
    expect(sellerViewResult).toContain("This is my secret NFT content!");
    console.log("    ✅ Seller successfully viewed NFT content");

    // Pause to highlight seller viewing success in video
    await page.waitForTimeout(500);

    // ========================================
    // Step 2b: Buyer cannot view NFT (not owner yet)
    // ========================================
    console.log(
      "\n  📝 Step 2b: Verifying buyer cannot view NFT (not owner)...",
    );

    // Clear previous results
    await page.evaluate(() => {
      document.getElementById("view-error").classList.remove("show");
      document.getElementById("view-result").classList.remove("show");
    });

    // Try to view - will trigger credential picker
    await page.click('#view-panel button:has-text("Decrypt & View Content")');

    // Wait for credential picker to appear
    await page.waitForSelector("#credential-picker-overlay", { timeout: 5000 });
    console.log("  🔐 Credential picker appeared");
    await page.waitForTimeout(500); // Pause to show picker in video

    // Select Buyer Wallet from the picker
    await page.click(
      'button.credential-picker-button:has-text("Buyer Wallet")',
    );
    console.log("  🔑 Selected buyer credential from picker");

    await Promise.race([
      page.waitForSelector("#view-result.show", { timeout: 30000 }),
      page.waitForSelector("#view-error.show", { timeout: 30000 }),
    ]);

    const buyerViewError = await page.isVisible("#view-error.show");
    expect(buyerViewError).toBe(true);

    const buyerErrorText = await page.textContent("#view-error");
    console.log(
      `    ✅ Buyer correctly blocked from viewing: ${buyerErrorText.substring(0, 50)}...`,
    );

    // Pause to highlight buyer viewing blocked in video
    await page.waitForTimeout(500);

    // ========================================
    // Step 3: Buy NFT
    // ========================================
    console.log("\n  📝 Step 3: Buying NFT...");

    await page.click('button.tab:has-text("Buy NFT")');
    await page.waitForTimeout(500); // Pause to show Buy NFT tab

    // Contract and token ID already in common fields, just click buy
    await page.click('#buy-panel button:has-text("Buy NFT")');

    // Wait for credential picker to appear
    await page.waitForSelector("#credential-picker-overlay", { timeout: 5000 });
    console.log("  🔐 Credential picker appeared");
    await page.waitForTimeout(500); // Pause to show picker in video

    // Select Buyer Wallet from the picker (buyer is purchasing)
    await page.click(
      'button.credential-picker-button:has-text("Buyer Wallet")',
    );
    console.log("  🔑 Selected buyer credential from picker");

    await page.waitForSelector("#buy-result.show", { timeout: 30000 });

    const buyResultText = await page.textContent("#buy-result-content");
    expect(buyResultText).toContain("test_nft_1");
    expect(buyResultText).toContain("Funds in escrow");
    console.log("    ✅ NFT purchased successfully");

    // Pause to highlight purchase success in video
    await page.waitForTimeout(500);

    // ========================================
    // Step 4: Complete sale with re-encryption
    // ========================================
    console.log("\n  📝 Step 4: Completing sale...");

    await page.click('button.tab:has-text("Complete Sale")');

    // Contract and token ID already in common fields, just click complete
    await page.click('#complete-panel button:has-text("Complete Sale")');

    // Wait for credential picker to appear
    await page.waitForSelector("#credential-picker-overlay", { timeout: 5000 });
    console.log("  🔐 Credential picker appeared");
    await page.waitForTimeout(500); // Pause to show picker in video

    // Select Seller Wallet from the picker
    await page.click(
      'button.credential-picker-button:has-text("Seller Wallet")',
    );
    console.log("  🔑 Selected seller credential from picker");

    await page.waitForSelector("#complete-result.show", { timeout: 30000 });

    const completeResultText = await page.textContent(
      "#complete-result-content",
    );
    expect(completeResultText).toContain("test_nft_1");
    expect(completeResultText).toContain("Sale completed");
    console.log("    ✅ Sale completed successfully");

    // Pause to highlight sale completion in video
    await page.waitForTimeout(500);

    // ========================================
    // Step 5: Buyer can now view NFT (new owner)
    // ========================================
    console.log(
      "\n  📝 Step 5: Verifying buyer can now view NFT (new owner)...",
    );

    await page.click('button.tab:has-text("View NFT")');
    await page.waitForTimeout(500); // Pause to show View NFT tab

    // Clear previous results
    await page.evaluate(() => {
      document.getElementById("view-error").classList.remove("show");
      document.getElementById("view-result").classList.remove("show");
    });

    await page.click('#view-panel button:has-text("Decrypt & View Content")');

    // Wait for credential picker to appear
    await page.waitForSelector("#credential-picker-overlay", { timeout: 5000 });
    console.log("  🔐 Credential picker appeared");
    await page.waitForTimeout(500); // Pause to show picker in video

    // Select Buyer Wallet from the picker
    await page.click(
      'button.credential-picker-button:has-text("Buyer Wallet")',
    );
    console.log("  🔑 Selected buyer credential from picker");

    await Promise.race([
      page.waitForSelector("#view-result.show", { timeout: 30000 }),
      page.waitForSelector("#view-error.show", { timeout: 30000 }),
    ]);

    const buyerViewError2 = await page.isVisible("#view-error.show");
    expect(buyerViewError2).toBe(false);

    const buyerViewResult = await page.textContent("#view-result-content");
    expect(buyerViewResult).toContain("This is my secret NFT content!");
    console.log(
      "    ✅ Buyer successfully viewed NFT content (after purchase)",
    );

    // Pause to highlight buyer viewing success in video
    await page.waitForTimeout(500);

    // ========================================
    // Step 6: Seller can no longer view NFT (no longer owner)
    // ========================================
    console.log("\n  📝 Step 6: Verifying seller can no longer view NFT...");

    // Clear previous results
    await page.evaluate(() => {
      document.getElementById("view-error").classList.remove("show");
      document.getElementById("view-result").classList.remove("show");
    });

    // Try to view - should fail now
    await page.click('#view-panel button:has-text("Decrypt & View Content")');

    // Wait for credential picker to appear
    await page.waitForSelector("#credential-picker-overlay", { timeout: 5000 });
    console.log("  🔐 Credential picker appeared");
    await page.waitForTimeout(500); // Pause to show picker in video

    // Select Seller Wallet from the picker
    await page.click(
      'button.credential-picker-button:has-text("Seller Wallet")',
    );
    console.log("  🔑 Selected seller credential from picker");

    await Promise.race([
      page.waitForSelector("#view-result.show", { timeout: 30000 }),
      page.waitForSelector("#view-error.show", { timeout: 30000 }),
    ]);

    const sellerViewError2 = await page.isVisible("#view-error.show");
    expect(sellerViewError2).toBe(true);

    const sellerErrorText = await page.textContent("#view-error");
    console.log(
      `    ✅ Seller correctly blocked from viewing: ${sellerErrorText.substring(0, 50)}...`,
    );

    // Pause to highlight seller viewing blocked in video
    await page.waitForTimeout(500);

    console.log("\n✅ Full marketplace flow completed successfully!");
    console.log("🎥 Video saved to test-results/ directory");
  });
});
