import { readFile } from "fs/promises";
import { Sandbox, DEFAULT_PRIVATE_KEY, DEFAULT_PUBLIC_KEY } from "near-sandbox";
import { KeyPair, transactions, utils } from "near-api-js";
import crypto from "crypto";
import {
  NearRpcClient,
  broadcastTxCommit,
  status,
  block,
  viewAccessKey,
  viewFunctionAsJson,
} from "@near-js/jsonrpc-client";
import { RistrettoPoint } from "@noble/curves/ed25519";
import { chromium } from "@playwright/test";
import http from "http";

console.log("🚀 Starting Encrypted NFT Web4 E2E Test (Sandbox)");

// Start sandbox
console.log("🔧 Starting sandbox worker...");
const sandbox = await Sandbox.start({
  version: "2.8.0",
  timeout: 60000,
  config: {
    additionalGenesis: {
      total_supply: "1050000000000000000000000000000000",
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
      ],
    },
  },
});

const sandboxRpcUrl = sandbox.rpcUrl;
console.log(`✅ Sandbox started with RPC URL: ${sandboxRpcUrl}`);

// Wait for sandbox to be ready
console.log("⏳ Waiting for sandbox to stabilize...");
await new Promise((resolve) => setTimeout(resolve, 5000));

const sandboxRpcClient = new NearRpcClient(sandboxRpcUrl);

// Verify RPC connection
const statusResult = await status(sandboxRpcClient);
console.log(`✅ RPC connected - Chain ID: ${statusResult.chainId}`);

const rootKeyPair = KeyPair.fromString(DEFAULT_PRIVATE_KEY);
const accountKeys = new Map();
accountKeys.set("test.near", rootKeyPair);

process.on("exit", async () => {
  console.log("Tearing down sandbox worker");
  await sandbox.tearDown();
});

// ============================================================================
// Helper Functions
// ============================================================================

async function getLatestBlockHash() {
  const result = await block(sandboxRpcClient, { finality: "final" });
  return result.header.hash;
}

async function getAccessKeyNonce(accountId, publicKey) {
  const result = await viewAccessKey(sandboxRpcClient, {
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
  const parentAccount = accountId.endsWith("test.near") ? "test.near" : "near";
  const nonce = await getAccessKeyNonce(
    parentAccount,
    rootKeyPair.getPublicKey().toString(),
  );

  const tx = transactions.createTransaction(
    parentAccount,
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
  const result = await broadcastTxCommit(sandboxRpcClient, {
    signedTxBase64: signedTxBase64,
    waitUntil: "FINAL",
  });

  if (result.status.SuccessValue !== undefined) {
    console.log(`  ✅ Created account: ${accountId}`);
  } else if (result.status.Failure) {
    console.error(
      `  ❌ Failed to create account ${accountId}:`,
      result.status.Failure,
    );
    throw new Error(`Failed to create account: ${accountId}`);
  }

  return newKeyPair;
}

async function deployContract(accountId, wasmCode) {
  const keyPair = accountKeys.get(accountId);
  if (!keyPair) throw new Error(`No key for account ${accountId}`);

  const actions = [transactions.deployContract(wasmCode)];

  const blockHash = await getLatestBlockHash();
  await new Promise((resolve) => setTimeout(() => resolve(), 2000));
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
  const result = await broadcastTxCommit(sandboxRpcClient, {
    signedTxBase64,
    waitUntil: "FINAL",
  });

  if (result.status.SuccessValue !== undefined) {
    console.log(`  ✅ Deployed contract to: ${accountId}`);
  } else if (result.status.Failure) {
    console.error(
      `  ❌ Failed to deploy to ${accountId}:`,
      result.status.Failure,
    );
    throw new Error(`Failed to deploy contract to ${accountId}`);
  }
}

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
      Buffer.from(JSON.stringify(args)),
      BigInt(gas),
      BigInt(deposit)
    ),
  ];

  const blockHash = await getLatestBlockHash();
  await new Promise((resolve) => setTimeout(() => resolve(), 2000));
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
  const result = await broadcastTxCommit(sandboxRpcClient, {
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

  console.log(`  ✅ Called ${methodName} on ${contractId}`);
  return result;
}

async function viewFunction(contractId, methodName, args) {
  const result = await viewFunctionAsJson(sandboxRpcClient, {
    accountId: contractId,
    methodName: methodName,
    argsBase64: Buffer.from(JSON.stringify(args)).toString("base64"),
    finality: "final",
  });

  const resultStr = JSON.stringify(result);
  console.log(`  📊 View function result (first 200 chars): ${resultStr.substring(0, 200)}`);

  if (!result) {
    throw new Error("Empty response from contract");
  }

  return result;
}

// ============================================================================
// Ristretto255 ElGamal Encryption
// ============================================================================

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
  let temp = scalar;
  for (let i = 0; i < 32; i++) {
    buffer[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return buffer;
}

function generateRistrettoKeypair() {
  const privateKeyScalar = bufferToScalar(crypto.randomBytes(32));
  const privateKeyBytes = scalarToBuffer(privateKeyScalar);

  const publicKeyPoint = RistrettoPoint.BASE.multiply(privateKeyScalar);
  const publicKeyBytes = publicKeyPoint.toRawBytes();

  return {
    privateKey: Buffer.from(privateKeyBytes).toString("base64"),
    publicKey: Buffer.from(publicKeyBytes).toString("base64"),
  };
}

function elgamalEncrypt(messageScalar, publicKeyBase64) {
  const publicKeyBytes = Buffer.from(publicKeyBase64, "base64");
  const publicKeyPoint = RistrettoPoint.fromHex(publicKeyBytes);

  const r = bufferToScalar(crypto.randomBytes(32));
  const m = bufferToScalar(messageScalar);

  const c1Point = RistrettoPoint.BASE.multiply(r);
  const c2Point = RistrettoPoint.BASE.multiply(m).add(
    publicKeyPoint.multiply(r),
  );

  return {
    c1_base64: Buffer.from(c1Point.toRawBytes()).toString("base64"),
    c2_base64: Buffer.from(c2Point.toRawBytes()).toString("base64"),
    randomness: scalarToBuffer(r),
  };
}

// ============================================================================
// Test Execution
// ============================================================================

try {
  console.log("\n📦 Step 1: Deploy NFT Contract");
  await createAccount("nft.test.near");
  const nftWasm = await readFile(new URL("../out/nft.wasm", import.meta.url));
  await deployContract("nft.test.near", nftWasm);

  console.log("\n📝 Step 2: Initialize Contract and Upload Bundled JavaScript");
  await functionCall("nft.test.near", "nft.test.near", "new", {});

  // Load the bundled contract with embedded HTML
  const nftJavascript = await readFile(
    new URL("../web4_encrypted_nft/contract-bundle.js", import.meta.url),
    "utf-8"
  );

  console.log(`  📄 Bundled contract size: ${nftJavascript.length} bytes`);

  await functionCall("nft.test.near", "nft.test.near", "post_javascript", {
    javascript: nftJavascript,
  });
  console.log("  ✅ Uploaded bundled JavaScript with embedded HTML viewer");

  console.log("\n🌐 Step 3: Test NFT Metadata First");

  // Test a simpler function first
  const metadata = await viewFunction("nft.test.near", "call_js_func", {
    function_name: "nft_metadata",
  });
  console.log("  ✅ NFT Metadata:", metadata.name);

  console.log("\n🌐 Step 4: Test Web4 Endpoint");

  // Test the web4_get endpoint
  // Note: web4_get expects the args to contain a 'request' object
  const web4Input = {
    function_name: "web4_get",
    request: { path: "/" },
  };

  const web4Response = await viewFunction("nft.test.near", "call_js_func", web4Input);

  console.log("  ✅ Web4 endpoint responded");
  console.log("    - Content-Type:", web4Response.contentType);
  console.log("    - Body (base64) length:", web4Response.body?.length || 0, "bytes");

  // Verify it's HTML
  if (web4Response.contentType?.includes("text/html")) {
    console.log("  ✅ Correct content type (text/html)");
  } else {
    throw new Error(`Expected text/html, got: ${web4Response.contentType}`);
  }

  // Decode base64 HTML
  const html = Buffer.from(web4Response.body, 'base64').toString('utf-8');
  console.log("    - Decoded HTML length:", html.length, "bytes");
  if (html.includes("Encrypted NFT") || html.includes("NFT Viewer")) {
    console.log("  ✅ HTML contains viewer title");
  } else {
    throw new Error("HTML missing expected viewer title");
  }

  if (html.includes("decryptContent")) {
    console.log("  ✅ HTML includes decrypt functionality");
  } else {
    throw new Error("HTML missing decrypt functionality");
  }

  if (html.includes("RistrettoPoint")) {
    console.log("  ✅ HTML includes cryptography library");
  } else {
    throw new Error("HTML missing cryptography library");
  }

  console.log("\n👤 Step 5: Create Test User and Mint Encrypted NFT");
  await createAccount("alice.test.near");

  const aliceKeys = generateRistrettoKeypair();
  console.log("  ✅ Generated encryption keys for Alice");

  // Register Alice's encryption key
  await functionCall("alice.test.near", "nft.test.near", "call_js_func", {
    function_name: "register_encryption_pubkey",
    pubkey_base64: aliceKeys.publicKey,
  });
  console.log("  ✅ Registered Alice's encryption key");

  // Create encrypted NFT
  const secretScalar = crypto.randomBytes(32);
  const secretScalarBigInt = bufferToScalar(secretScalar);
  const secretPoint = RistrettoPoint.BASE.multiply(secretScalarBigInt);
  const secretPointBytes = Buffer.from(secretPoint.toRawBytes());
  const aesKey = crypto.createHash("sha256").update(secretPointBytes).digest();

  // Encrypt content
  const contentPlaintext = "Secret music file for Web4 viewer!";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(contentPlaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const encryptedContent = Buffer.concat([iv, encrypted, tag]).toString("base64");

  // Encrypt secret_scalar
  const iv2 = crypto.randomBytes(12);
  const cipher2 = crypto.createCipheriv("aes-256-gcm", aesKey, iv2);
  const encryptedScalarData = Buffer.concat([
    iv2,
    cipher2.update(secretScalar),
    cipher2.final(),
    cipher2.getAuthTag(),
  ]).toString("base64");

  // ElGamal encrypt
  const aliceCiphertext = elgamalEncrypt(secretScalar, aliceKeys.publicKey);

  // Mint NFT
  await functionCall(
    "nft.test.near",
    "nft.test.near",
    "nft_mint",
    {
      token_id: "web4-test-nft-1",
      token_owner_id: "alice.test.near",
    },
    "300000000000000",
    "15000000000000000000000",
  );

  // Attach encrypted content
  await functionCall(
    "nft.test.near",
    "nft.test.near",
    "call_js_func",
    {
      function_name: "nft_mint_with_encrypted_content",
      token_id: "web4-test-nft-1",
      token_owner_id: "alice.test.near",
      token_metadata: {
        title: "Web4 Encrypted NFT #1",
        description: "Testing Web4 encrypted viewer",
      },
      encrypted_content_base64: encryptedContent,
      encrypted_scalar_base64: encryptedScalarData,
      elgamal_ciphertext_c1_base64: aliceCiphertext.c1_base64,
      elgamal_ciphertext_c2_base64: aliceCiphertext.c2_base64,
      owner_pubkey_base64: aliceKeys.publicKey,
    },
    "300000000000000",
    "10000000000000000000000",
  );
  console.log("  ✅ Minted encrypted NFT: web4-test-nft-1");

  console.log("\n🔍 Step 6: Verify NFT Data is Accessible");
  const contentData = await viewFunction("nft.test.near", "call_js_func", {
    function_name: "get_encrypted_content_data",
    token_id: "web4-test-nft-1",
  });

  if (contentData.encrypted_content_base64) {
    console.log("  ✅ Encrypted content data is accessible");
    console.log("    - Content size:", contentData.encrypted_content_base64.length, "bytes");
    console.log("    - Has ElGamal ciphertext:", !!contentData.elgamal_ciphertext);
    console.log("    - Has owner pubkey:", !!contentData.owner_pubkey_base64);
  } else {
    throw new Error("Failed to retrieve encrypted content data");
  }

  console.log("\n🌐 Step 7: Start Web4 Gateway Server for Browser Testing");

  // Create a simple HTTP server that mimics Web4 gateway behavior
  let server;
  let serverUrl;

  server = http.createServer(async (req, res) => {
    try {
      // Call web4_get directly (like real Web4 gateway)
      const web4Result = await viewFunction("nft.test.near", "web4_get", {
        request: { path: req.url },
      });

      // Decode base64 HTML body
      const htmlContent = Buffer.from(web4Result.body, "base64").toString("utf-8");

      // Inject sandbox RPC endpoint for testing
      const modifiedHtml = htmlContent
        .replace(/https:\/\/rpc\.testnet\.fastnear\.com/g, sandboxRpcUrl)
        .replace(/https:\/\/rpc\.mainnet\.fastnear\.com/g, sandboxRpcUrl);

      res.writeHead(200, { "Content-Type": web4Result.contentType });
      res.end(modifiedHtml);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Error: ${error.message}`);
    }
  });

  // Start server on random port
  await new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port;
      serverUrl = `http://localhost:${port}`;
      console.log(`  ✅ Web4 gateway server started at ${serverUrl}`);
      resolve();
    });
  });

  console.log("\n🎭 Step 8: Browser Tests with Playwright");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Test 1: Page loads correctly
    console.log("\n  Test 1: Loading encrypted NFT viewer page...");
    await page.goto(serverUrl);
    const title = await page.title();
    if (title.includes("Encrypted NFT")) {
      console.log("  ✅ Page title correct:", title);
    } else {
      throw new Error(`Unexpected page title: ${title}`);
    }

    // Test 2: Form fields are present
    console.log("\n  Test 2: Checking form fields...");
    const contractInput = await page.locator("#contract");
    const tokenIdInput = await page.locator("#tokenId");
    const privateKeyInput = await page.locator("#privateKey");

    if (await contractInput.isVisible() && await tokenIdInput.isVisible() && await privateKeyInput.isVisible()) {
      console.log("  ✅ All required form fields present");
    } else {
      throw new Error("Missing required form fields");
    }

    // Test 3: Decrypt NFT content with correct private key
    console.log("\n  Test 3: Testing NFT decryption...");

    // Wait for external libraries to load from CDN
    console.log("  ⏳ Waiting for external libraries to load...");
    await page.waitForFunction(() => {
      return window.nearJsonRpcClient && window.RistrettoPoint;
    }, { timeout: 30000 });
    console.log("  ✅ External libraries loaded");

    await page.locator("#network").selectOption("testnet");
    await page.locator("#contract").fill("nft.test.near");
    await page.locator("#tokenId").fill("web4-test-nft-1");

    // Convert Alice's private key from base64 to hex
    const alicePrivateKeyBytes = Buffer.from(aliceKeys.privateKey, "base64");
    const alicePrivateKeyHex = alicePrivateKeyBytes.toString("hex");
    await page.locator("#privateKey").fill(alicePrivateKeyHex);

    // Click decrypt button
    await page.locator("button:has-text('Decrypt Content')").click();

    // Wait for result or error
    await Promise.race([
      page.waitForSelector(".result.show", { timeout: 15000 }),
      page.waitForSelector(".error.show", { timeout: 15000 }),
    ]);

    // Check if decryption was successful
    const resultVisible = await page.locator(".result.show").isVisible().catch(() => false);
    const errorVisible = await page.locator(".error.show").isVisible().catch(() => false);

    if (resultVisible) {
      const decryptedText = await page.locator("#content").textContent();
      if (decryptedText.includes("Secret music file")) {
        console.log("  ✅ Successfully decrypted NFT content in browser!");
        console.log("    - Decrypted text:", decryptedText);
      } else {
        throw new Error(`Unexpected decrypted content: ${decryptedText}`);
      }
    } else if (errorVisible) {
      const errorText = await page.locator("#error").textContent();
      throw new Error(`Decryption failed with error: ${errorText}`);
    } else {
      throw new Error("Neither result nor error appeared after decryption");
    }

    // Test 4: Wrong private key shows error
    console.log("\n  Test 4: Testing error handling with wrong private key...");
    await page.reload();

    // Wait for external libraries to load after reload
    await page.waitForFunction(() => {
      return window.nearJsonRpcClient && window.RistrettoPoint;
    }, { timeout: 30000 });

    await page.locator("#network").selectOption("testnet");
    await page.locator("#contract").fill("nft.test.near");
    await page.locator("#tokenId").fill("web4-test-nft-1");
    await page.locator("#privateKey").fill("0".repeat(64)); // Wrong key

    await page.locator("button:has-text('Decrypt Content')").click();

    await page.waitForSelector(".error.show", { timeout: 10000 });
    const errorText = await page.locator("#error").textContent();
    if (errorText.includes("does not match")) {
      console.log("  ✅ Correctly shows error for wrong private key");
    } else {
      console.log("  ⚠️  Error message:", errorText);
    }

    console.log("\n  ✅ All browser tests passed!");

  } finally {
    await browser.close();
    server.close();
    console.log("  ✅ Browser and server closed");
  }

  console.log("\n✅ =================================================");
  console.log("✅ ALL WEB4 TESTS PASSED!");
  console.log("✅ =================================================");
  console.log("\n📊 Test Summary:");
  console.log("  ✅ Contract deployment: SUCCESS");
  console.log("  ✅ Bundled JavaScript upload: SUCCESS");
  console.log("  ✅ Web4 endpoint serving HTML: SUCCESS");
  console.log("  ✅ HTML viewer embedded correctly: SUCCESS");
  console.log("  ✅ Encrypted NFT minting: SUCCESS");
  console.log("  ✅ Content data retrieval: SUCCESS");
  console.log("  ✅ Web4 gateway server: SUCCESS");
  console.log("  ✅ Browser page load: SUCCESS");
  console.log("  ✅ Browser decryption: SUCCESS");
  console.log("  ✅ Browser error handling: SUCCESS");
  console.log("\n🎉 Web4 encrypted NFT viewer validated!");
  console.log("🌐 The viewer HTML is successfully embedded in the contract!");
  console.log("🔐 Users can decrypt NFT content using the Web4 interface!");
} catch (error) {
  console.error("\n❌ Test failed:", error);
  if (error.data) {
    console.error("Error data:", JSON.stringify(error.data, null, 2));
  }
  process.exit(1);
} finally {
  console.log("\n🧹 Cleaning up sandbox...");
  await sandbox.tearDown();
  console.log("  ✅ Sandbox stopped");
  process.exit(0);
}
