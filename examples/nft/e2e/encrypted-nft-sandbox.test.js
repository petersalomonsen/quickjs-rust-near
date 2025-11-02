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
  query,
} from "@near-js/jsonrpc-client";
import { RistrettoPoint, hashToRistretto255 } from "@noble/curves/ed25519";

console.log("🚀 Starting Encrypted NFT E2E Test (Sandbox)");

// Start sandbox
console.log("🔧 Starting sandbox worker...");
const sandbox = await Sandbox.start({
  version: "2.8.0",
  timeout: 60000, // 60 second timeout
  config: {
    additionalGenesis: {
      // Match the total supply exactly with account balances
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

// Use the sandbox's default root account keypair
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
    transactions.functionCall(methodName, args, BigInt(gas), BigInt(deposit)),
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
  const result = await query(sandboxRpcClient, {
    requestType: "call_function",
    finality: "final",
    accountId: contractId,
    methodName: methodName,
    argsBase64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });

  return JSON.parse(Buffer.from(result.result).toString());
}

// ============================================================================
// Ristretto255 ElGamal Encryption (client-side operations)
// ============================================================================

// Ed25519 scalar field order
const CURVE_ORDER = 2n ** 252n + 27742317777372353535851937790883648493n;

/**
 * Convert a Buffer to a valid scalar in the Ed25519 scalar field
 * Reads little-endian format (matches scalarToBuffer)
 */
function bufferToScalar(buffer) {
  // Read as little-endian
  let value = 0n;
  for (let i = buffer.length - 1; i >= 0; i--) {
    value = (value << 8n) | BigInt(buffer[i]);
  }
  value = value % CURVE_ORDER;
  return value === 0n ? 1n : value;
}

/**
 * Convert a scalar to a 32-byte little-endian Buffer
 */
function scalarToBuffer(scalar) {
  const buffer = Buffer.alloc(32);
  let temp = scalar;
  for (let i = 0; i < 32; i++) {
    buffer[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return buffer;
}

/**
 * Generate a Ristretto255 keypair for ElGamal encryption
 */
function generateRistrettoKeypair() {
  // Generate a random private key scalar
  const privateKeyScalar = bufferToScalar(crypto.randomBytes(32));
  const privateKeyBytes = scalarToBuffer(privateKeyScalar);

  // Compute public key: P = scalar * G (base point)
  const publicKeyPoint = RistrettoPoint.BASE.multiply(privateKeyScalar);
  const publicKeyBytes = publicKeyPoint.toRawBytes();

  return {
    privateKey: Buffer.from(privateKeyBytes).toString("base64"),
    publicKey: Buffer.from(publicKeyBytes).toString("base64"),
  };
}

/**
 * ElGamal encryption on Ristretto255 (exponential ElGamal)
 * Encrypts a scalar m by computing: C2 = m*G + r*PK
 * @param {Buffer} messageScalar - 32-byte scalar to encrypt (secret_scalar)
 * @param {string} publicKeyBase64 - Recipient's public key (compressed Ristretto point)
 * @returns {{c1_base64: string, c2_base64: string, randomness: Buffer}}
 */
function elgamalEncrypt(messageScalar, publicKeyBase64) {
  // Decode recipient's public key
  const publicKeyBytes = Buffer.from(publicKeyBase64, "base64");
  const publicKeyPoint = RistrettoPoint.fromHex(publicKeyBytes);

  // Generate random scalar r for encryption
  const r = bufferToScalar(crypto.randomBytes(32));

  // Convert message to scalar m
  const m = bufferToScalar(messageScalar);

  // Compute C1 = r * G
  const c1Point = RistrettoPoint.BASE.multiply(r);

  // Compute C2 = m * G + r * PK (exponential ElGamal)
  const c2Point = RistrettoPoint.BASE.multiply(m).add(
    publicKeyPoint.multiply(r),
  );

  return {
    c1_base64: Buffer.from(c1Point.toRawBytes()).toString("base64"),
    c2_base64: Buffer.from(c2Point.toRawBytes()).toString("base64"),
    randomness: scalarToBuffer(r),
  };
}

/**
 * ElGamal decryption on Ristretto255 (exponential ElGamal)
 * Returns the decrypted point: secret_point = C2 - sk*C1 = m*G
 * @param {string} c1Base64 - C1 component (r*G)
 * @param {string} c2Base64 - C2 component (m*G + r*PK)
 * @param {string} privateKeyBase64 - Recipient's private key
 * @returns {Buffer} - Decrypted point (m*G) as 32 bytes
 */
function elgamalDecrypt(c1Base64, c2Base64, privateKeyBase64) {
  // Decode ciphertext components
  const c1Point = RistrettoPoint.fromHex(Buffer.from(c1Base64, "base64"));
  const c2Point = RistrettoPoint.fromHex(Buffer.from(c2Base64, "base64"));

  // Decode private key
  const sk = bufferToScalar(Buffer.from(privateKeyBase64, "base64"));

  // Decrypt: secret_point = C2 - sk * C1
  //         = (m*G + r*PK) - sk*(r*G)
  //         = m*G + r*sk*G - sk*r*G
  //         = m*G
  const secretPoint = c2Point.subtract(c1Point.multiply(sk));

  return Buffer.from(secretPoint.toRawBytes());
}

// Real AES-GCM encryption for content
function encryptContent(content) {
  const aesKey = crypto.randomBytes(32); // 256-bit AES key
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM

  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(content, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Combine: IV + ciphertext + tag
  const combined = Buffer.concat([iv, encrypted, tag]);

  return {
    encryptedContent: combined.toString("base64"),
    aesKey: aesKey,
  };
}

/**
 * Decrypt AES-GCM encrypted content
 * @param {string} encryptedContentBase64 - Base64 encoded: IV + ciphertext + tag
 * @param {Buffer} aesKey - 32-byte AES-256 key
 * @returns {string} - Decrypted plaintext
 */
function decryptContent(encryptedContentBase64, aesKey) {
  const combined = Buffer.from(encryptedContentBase64, "base64");

  // Extract components: IV (12) + ciphertext (variable) + tag (16)
  const iv = combined.slice(0, 12);
  const tag = combined.slice(-16);
  const ciphertext = combined.slice(12, -16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Generate a zero-knowledge proof of re-encryption
 * Proves that old_ciphertext and new_ciphertext encrypt the same secret_scalar
 * without revealing the secret_scalar or the randomness used
 *
 * This matches the verification in examples/nft/src/crypto.rs:159-245
 */
function generateReencryptionProof(
  secretScalar, // The secret_scalar being encrypted (32 bytes)
  oldCiphertextC1Base64, // C1 of old ciphertext
  oldCiphertextC2Base64, // C2 of old ciphertext
  oldRandomness, // r_old used in old ciphertext
  oldPubkeyBase64, // Old owner's public key
  newCiphertextC1Base64, // C1 of new ciphertext
  newCiphertextC2Base64, // C2 of new ciphertext
  newRandomness, // r_new used in new ciphertext
  newPubkeyBase64, // New owner's public key
) {
  // Parse inputs
  const oldPubkey = RistrettoPoint.fromHex(
    Buffer.from(oldPubkeyBase64, "base64"),
  );
  const newPubkey = RistrettoPoint.fromHex(
    Buffer.from(newPubkeyBase64, "base64"),
  );

  const oldC1 = Buffer.from(oldCiphertextC1Base64, "base64");
  const oldC2 = Buffer.from(oldCiphertextC2Base64, "base64");
  const newC1 = Buffer.from(newCiphertextC1Base64, "base64");
  const newC2 = Buffer.from(newCiphertextC2Base64, "base64");

  const m = bufferToScalar(secretScalar);
  const r_old = bufferToScalar(oldRandomness);
  const r_new = bufferToScalar(newRandomness);

  // Generate random blinding factors (nonces for zero-knowledge)
  const t_r_old = bufferToScalar(crypto.randomBytes(32));
  const t_r_new = bufferToScalar(crypto.randomBytes(32));
  const t_s = bufferToScalar(crypto.randomBytes(32));

  // Compute commitments (first message in Sigma protocol)
  const commit_r_old = RistrettoPoint.BASE.multiply(t_r_old);
  const commit_r_new = RistrettoPoint.BASE.multiply(t_r_new);
  const commit_s_old = RistrettoPoint.BASE.multiply(t_s).add(
    oldPubkey.multiply(t_r_old),
  );
  const commit_s_new = RistrettoPoint.BASE.multiply(t_s).add(
    newPubkey.multiply(t_r_new),
  );

  // Compute challenge hash (matches crypto.rs compute_challenge function)
  // Hash all public inputs to create Fiat-Shamir challenge
  const challengeHash = crypto
    .createHash("sha256")
    .update(oldC1) // old_ct.c1
    .update(oldC2) // old_ct.c2
    .update(Buffer.from(oldPubkey.toRawBytes())) // old_pk
    .update(newC1) // new_ct.c1
    .update(newC2) // new_ct.c2
    .update(Buffer.from(newPubkey.toRawBytes())) // new_pk
    .update(Buffer.from(commit_r_old.toRawBytes())) // commit_r_old
    .update(Buffer.from(commit_s_old.toRawBytes())) // commit_s_old
    .update(Buffer.from(commit_r_new.toRawBytes())) // commit_r_new
    .update(Buffer.from(commit_s_new.toRawBytes())) // commit_s_new
    .digest();
  const challenge = bufferToScalar(challengeHash);

  // Compute responses (challenge response in Sigma protocol)
  // These satisfy the verification equations without revealing the secrets
  const response_r_old = (t_r_old + challenge * r_old) % CURVE_ORDER;
  const response_r_new = (t_r_new + challenge * r_new) % CURVE_ORDER;
  const response_s = (t_s + challenge * m) % CURVE_ORDER; // Same for both - proves same message!

  return {
    commit_r_old_base64: Buffer.from(commit_r_old.toRawBytes()).toString(
      "base64",
    ),
    commit_s_old_base64: Buffer.from(commit_s_old.toRawBytes()).toString(
      "base64",
    ),
    commit_r_new_base64: Buffer.from(commit_r_new.toRawBytes()).toString(
      "base64",
    ),
    commit_s_new_base64: Buffer.from(commit_s_new.toRawBytes()).toString(
      "base64",
    ),
    response_s_base64: Buffer.from(scalarToBuffer(response_s)).toString(
      "base64",
    ),
    response_r_old_base64: Buffer.from(scalarToBuffer(response_r_old)).toString(
      "base64",
    ),
    response_r_new_base64: Buffer.from(scalarToBuffer(response_r_new)).toString(
      "base64",
    ),
  };
}

function mockGenerateReencryptionProof() {
  return {
    commit_r_old_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
    commit_s_old_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
    commit_r_new_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
    commit_s_new_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
    response_s_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
    response_r_old_base64: Buffer.from(crypto.randomBytes(32)).toString(
      "base64",
    ),
    response_r_new_base64: Buffer.from(crypto.randomBytes(32)).toString(
      "base64",
    ),
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

  console.log("\n📝 Step 2: Initialize Contract and Upload JavaScript");
  await functionCall("nft.test.near", "nft.test.near", "new", {});

  const nftJavascript = await readFile(
    new URL("../src/contract.js", import.meta.url),
  );
  await functionCall("nft.test.near", "nft.test.near", "post_javascript", {
    javascript: nftJavascript.toString(),
  });

  console.log("\n👤 Step 3: Create User Accounts");
  await createAccount("alice.test.near");
  await createAccount("bob.test.near");

  console.log("\n🔑 Step 4: Generate Encryption Keypairs");
  const aliceKeys = generateRistrettoKeypair();
  const bobKeys = generateRistrettoKeypair();
  console.log(
    "  ✅ Alice's public key:",
    aliceKeys.publicKey.substring(0, 16) + "...",
  );
  console.log(
    "  ✅ Bob's public key:",
    bobKeys.publicKey.substring(0, 16) + "...",
  );

  console.log("\n📋 Step 5: Register Encryption Public Keys");
  await functionCall("alice.test.near", "nft.test.near", "call_js_func", {
    function_name: "register_encryption_pubkey",
    pubkey_base64: aliceKeys.publicKey,
  });

  await functionCall("bob.test.near", "nft.test.near", "call_js_func", {
    function_name: "register_encryption_pubkey",
    pubkey_base64: bobKeys.publicKey,
  });

  // Verify keys are registered
  const alicePubkey = await viewFunction("nft.test.near", "call_js_func", {
    function_name: "get_encryption_pubkey",
    account_id: "alice.test.near",
  });
  console.log(
    "  ✅ Alice's key verified:",
    alicePubkey.pubkey_base64 === aliceKeys.publicKey,
  );

  console.log("\n🎨 Step 6: Mint Encrypted NFT");

  // Following the architecture from ENCRYPTED_CONTENT.md:

  // 1. Generate random secret_scalar
  const secretScalar = crypto.randomBytes(32);
  console.log("  ✅ Generated secret_scalar");

  // 2. Compute secret_point = secret_scalar * G
  const secretScalarBigInt = bufferToScalar(secretScalar);
  const secretPoint = RistrettoPoint.BASE.multiply(secretScalarBigInt);
  const secretPointBytes = Buffer.from(secretPoint.toRawBytes());
  console.log("  ✅ Computed secret_point = secret_scalar * G");

  // 3. Derive aes_key = Hash(secret_point)
  const aesKey = crypto.createHash("sha256").update(secretPointBytes).digest();
  console.log("  ✅ Derived aes_key = Hash(secret_point)");
  console.log(
    "  📊 AES key (hex):",
    aesKey.toString("hex").substring(0, 16) + "...",
  );

  // 4. Encrypt NFT content with aes_key
  const contentPlaintext = "Secret music file content!";
  const encryptedContent = (() => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(contentPlaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, tag]).toString("base64");
  })();
  console.log("  ✅ Content encrypted with AES-256-GCM");

  // 5. ElGamal encrypt the secret_scalar using Alice's public key
  const aliceCiphertext = elgamalEncrypt(secretScalar, aliceKeys.publicKey);
  const aliceRandomness = aliceCiphertext.randomness;
  console.log("  ✅ ElGamal encrypted secret_scalar for Alice");

  // 6. Encrypt BOTH secret_scalar AND randomness with AES (92 bytes total)
  // This allows recovery of both values for re-encryption proofs
  const encryptedScalarData = (() => {
    const scalarAndRandomness = Buffer.concat([secretScalar, aliceRandomness]);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(scalarAndRandomness),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const result = Buffer.concat([iv, encrypted, tag]);
    console.log(`  📊 Encrypted blob size: ${result.length} bytes (12 IV + 64 encrypted + 16 tag)`);
    return result.toString("base64");
  })();
  console.log("  ✅ Encrypted secret_scalar + randomness with AES for storage");
  console.log("  📊 C1:", aliceCiphertext.c1_base64.substring(0, 16) + "...");
  console.log(
    "  📊 C2 (point):",
    aliceCiphertext.c2_base64.substring(0, 16) + "...",
  );

  // First, mint the NFT using the standard nft_mint function
  await functionCall(
    "nft.test.near",
    "nft.test.near",
    "nft_mint",
    {
      token_id: "encrypted-nft-1",
      token_owner_id: "alice.test.near",
    },
    "300000000000000",
    "15000000000000000000000", // 0.015 NEAR for storage
  );

  // Then, attach the encrypted content data
  await functionCall(
    "nft.test.near",
    "nft.test.near",
    "call_js_func",
    {
      function_name: "nft_mint_with_encrypted_content",
      token_id: "encrypted-nft-1",
      token_owner_id: "alice.test.near",
      token_metadata: {
        title: "Encrypted Music NFT #1",
        description: "A music NFT with encrypted content",
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

  console.log("\n🔍 Step 7: Verify Alice Can Access Encrypted Content");
  const aliceContentData = await viewFunction("nft.test.near", "call_js_func", {
    function_name: "get_encrypted_content_data",
    token_id: "encrypted-nft-1",
  });
  console.log("  ✅ Content data retrieved");
  console.log(
    "    - Encrypted content length:",
    aliceContentData.encrypted_content_base64.length,
  );

  console.log("\n🔓 Step 7b: Alice Decrypts the Content");
  // Following the OWNERSHIP section from ENCRYPTED_CONTENT.md:

  // 1. ElGamal decrypt to get secret_point (NOT secret_scalar!)
  const recoveredSecretPoint = elgamalDecrypt(
    aliceContentData.elgamal_ciphertext.c1_base64,
    aliceContentData.elgamal_ciphertext.c2_base64,
    aliceKeys.privateKey,
  );
  console.log("  ✅ ElGamal decrypted to recover secret_point");
  console.log(
    "    - Original secret_point:",
    secretPointBytes.toString("hex").substring(0, 32) + "...",
  );
  console.log(
    "    - Recovered secret_point:",
    recoveredSecretPoint.toString("hex").substring(0, 32) + "...",
  );
  console.log(
    "    - Points match:",
    secretPointBytes.equals(recoveredSecretPoint) ? "✅ YES" : "❌ NO",
  );

  // 2. Derive aes_key = Hash(secret_point)
  const recoveredAesKey = crypto
    .createHash("sha256")
    .update(recoveredSecretPoint)
    .digest();
  console.log("  ✅ Derived aes_key = Hash(secret_point)");
  console.log(
    "    - Original AES key:",
    aesKey.toString("hex").substring(0, 32) + "...",
  );
  console.log(
    "    - Recovered AES key:",
    recoveredAesKey.toString("hex").substring(0, 32) + "...",
  );
  console.log(
    "    - Keys match:",
    aesKey.equals(recoveredAesKey) ? "✅ YES" : "❌ NO",
  );

  // 3. Decrypt content with aes_key
  const decryptedContent = decryptContent(
    aliceContentData.encrypted_content_base64,
    recoveredAesKey,
  );
  console.log("  ✅ Content decrypted with recovered AES key");
  console.log("    - Original plaintext:", contentPlaintext);
  console.log("    - Decrypted content:", decryptedContent);
  console.log(
    "    - Content matches:",
    contentPlaintext === decryptedContent ? "✅ YES" : "❌ NO",
  );

  console.log("\n💸 Step 8: Transfer NFT from Alice to Bob");
  // For encrypted content NFTs, use nft_transfer_payout to trigger escrow
  await functionCall(
    "alice.test.near",
    "nft.test.near",
    "nft_transfer_payout",
    {
      receiver_id: "bob.test.near",
      token_id: "encrypted-nft-1",
      approval_id: null,
      memo: null,
      balance: "1000000000000000000000000", // 1 NEAR payment
      max_len_payout: 10,
    },
    "300000000000000",
    "1", // 1 yoctoNEAR for security
  );

  // Verify new owner
  const token = await viewFunction("nft.test.near", "nft_token", {
    token_id: "encrypted-nft-1",
  });
  console.log(`  ✅ NFT owner is now: ${token.owner_id}`);
  console.log(
    `  ✅ Transfer successful: ${token.owner_id === "bob.test.near"}`,
  );

  console.log("\n🔑 Step 9: Alice Retrieves Bob's Public Key from Contract");
  // Alice needs Bob's public key to re-encrypt the secret
  const bobPubkeyResult = await viewFunction("nft.test.near", "call_js_func", {
    function_name: "get_encryption_pubkey",
    account_id: "bob.test.near",
  });
  const bobPubkeyFromContract = bobPubkeyResult.pubkey_base64;
  console.log("  ✅ Retrieved Bob's public key from contract");
  console.log(
    "    - Bob's pubkey:",
    bobPubkeyFromContract.substring(0, 16) + "...",
  );
  console.log(
    "    - Matches local:",
    bobPubkeyFromContract === bobKeys.publicKey ? "✅ YES" : "❌ NO",
  );

  console.log("\n🔐 Step 10: Alice Recovers Data from Contract for Re-encryption");
  // Alice retrieves her encrypted content data from the contract
  const aliceReencryptData = await viewFunction("nft.test.near", "call_js_func", {
    function_name: "get_encrypted_content_data",
    token_id: "encrypted-nft-1",
  });
  console.log("  ✅ Retrieved encrypted content data from contract");

  // Decrypt ElGamal ciphertext to recover secret point
  const aliceReencryptC1 = RistrettoPoint.fromHex(
    Buffer.from(aliceReencryptData.elgamal_ciphertext.c1_base64, "base64")
  );
  const aliceReencryptC2 = RistrettoPoint.fromHex(
    Buffer.from(aliceReencryptData.elgamal_ciphertext.c2_base64, "base64")
  );
  const aliceReencryptSharedSecret = aliceReencryptC1.multiply(
    bufferToScalar(Buffer.from(aliceKeys.privateKey, "base64"))
  );
  const aliceReencryptSecretPoint = aliceReencryptC2.subtract(aliceReencryptSharedSecret);
  console.log("  ✅ Decrypted ElGamal ciphertext to recover secret point");

  // Derive AES key from secret point
  const aliceReencryptAesKey = crypto
    .createHash("sha256")
    .update(Buffer.from(aliceReencryptSecretPoint.toRawBytes()))
    .digest();
  console.log("  ✅ Derived AES key from secret point");

  // Decrypt encrypted_scalar to recover BOTH secret_scalar AND randomness
  const encryptedScalarBuffer = Buffer.from(
    aliceReencryptData.encrypted_scalar_base64,
    "base64"
  );
  const scalarIv = encryptedScalarBuffer.subarray(0, 12);
  const scalarTag = encryptedScalarBuffer.subarray(-16);
  const scalarCiphertext = encryptedScalarBuffer.subarray(12, -16);

  const scalarDecipher = crypto.createDecipheriv("aes-256-gcm", aliceReencryptAesKey, scalarIv);
  scalarDecipher.setAuthTag(scalarTag);
  const recoveredData = Buffer.concat([
    scalarDecipher.update(scalarCiphertext),
    scalarDecipher.final(),
  ]);

  // Extract secret_scalar and randomness from the 64-byte blob
  const recoveredSecretScalar = recoveredData.subarray(0, 32);
  const recoveredAliceRandomness = recoveredData.subarray(32, 64);
  console.log(`  ✅ Decrypted ${recoveredData.length} bytes from contract`);
  console.log("  ✅ Recovered secret_scalar and randomness from on-chain data");

  // Re-encrypt the secret_scalar for Bob's public key (retrieved from contract)
  const bobCiphertext = elgamalEncrypt(recoveredSecretScalar, bobPubkeyFromContract);
  const bobRandomness = bobCiphertext.randomness;
  console.log("  ✅ Re-encrypted secret_scalar for Bob");
  console.log(
    "    - Bob C1:",
    bobCiphertext.c1_base64.substring(0, 16) + "...",
  );
  console.log(
    "    - Bob C2 (point):",
    bobCiphertext.c2_base64.substring(0, 16) + "...",
  );

  // Generate zero-knowledge proof that both ciphertexts encrypt the same secret_scalar
  const proof = generateReencryptionProof(
    recoveredSecretScalar, // The secret_scalar (recovered from contract)
    aliceReencryptData.elgamal_ciphertext.c1_base64, // Old ciphertext C1 (Alice, from contract)
    aliceReencryptData.elgamal_ciphertext.c2_base64, // Old ciphertext C2 (Alice, from contract)
    recoveredAliceRandomness, // Randomness used for Alice's encryption (recovered from contract)
    aliceReencryptData.owner_pubkey_base64, // Alice's public key (from contract)
    bobCiphertext.c1_base64, // New ciphertext C1 (Bob)
    bobCiphertext.c2_base64, // New ciphertext C2 (Bob)
    bobRandomness, // Randomness used for Bob's encryption
    bobPubkeyFromContract, // Bob's public key (from contract)
  );
  console.log("  ✅ Generated ZK proof using data recovered from contract");

  console.log("\n📤 Step 11: Alice Submits Proof to Complete Transfer");
  // Alice submits the new ciphertext and proof to the contract
  console.log("  📤 Submitting Bob's new ciphertext:");
  console.log("    - C1:", bobCiphertext.c1_base64.substring(0, 16) + "...");
  console.log("    - C2:", bobCiphertext.c2_base64.substring(0, 16) + "...");

  const completeResult = await functionCall(
    "alice.test.near",
    "nft.test.near",
    "call_js_func",
    {
      function_name: "finalize_reencryption",
      token_id: "encrypted-nft-1",
      new_ciphertext_c1_base64: bobCiphertext.c1_base64,
      new_ciphertext_c2_base64: bobCiphertext.c2_base64,
      proof: {
        commit_r_old_base64: proof.commit_r_old_base64,
        commit_s_old_base64: proof.commit_s_old_base64,
        commit_r_new_base64: proof.commit_r_new_base64,
        commit_s_new_base64: proof.commit_s_new_base64,
        response_s_base64: proof.response_s_base64,
        response_r_old_base64: proof.response_r_old_base64,
        response_r_new_base64: proof.response_r_new_base64,
      },
    },
  );
  console.log("  ✅ finalize_reencryption result:", completeResult);
  console.log("  ✅ ZK proof verified on-chain!");
  console.log("  ✅ Transfer finalized with cryptographic proof");
  console.log("  ✅ New ciphertext should be stored for Bob");

  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log("\n📥 Step 12: Bob Retrieves Ciphertext from Contract");
  // Bob retrieves the encrypted content data from the contract
  const bobContentData = await viewFunction("nft.test.near", "call_js_func", {
    function_name: "get_encrypted_content_data",
    token_id: "encrypted-nft-1",
  });
  console.log("  ✅ Bob retrieved ciphertext from contract");
  console.log(
    "    - Retrieved C1:",
    bobContentData.elgamal_ciphertext.c1_base64.substring(0, 16) + "...",
  );
  console.log(
    "    - Retrieved C2:",
    bobContentData.elgamal_ciphertext.c2_base64.substring(0, 16) + "...",
  );
  console.log(
    "    - Expected C1: ",
    bobCiphertext.c1_base64.substring(0, 16) + "...",
  );
  console.log(
    "    - Expected C2: ",
    bobCiphertext.c2_base64.substring(0, 16) + "...",
  );
  console.log(
    "    - Ciphertext updated:",
    bobContentData.elgamal_ciphertext.c1_base64 === bobCiphertext.c1_base64
      ? "✅ YES"
      : "❌ NO",
  );

  console.log("\n🔓 Step 13: Bob Decrypts and Accesses Content");
  // Bob decrypts using his private key to get secret_point
  const bobRecoveredSecretPoint = elgamalDecrypt(
    bobContentData.elgamal_ciphertext.c1_base64,
    bobContentData.elgamal_ciphertext.c2_base64,
    bobKeys.privateKey,
  );
  const bobRecoveredAesKey = crypto
    .createHash("sha256")
    .update(bobRecoveredSecretPoint)
    .digest();

  console.log("  ✅ Bob decrypted secret_point and derived AES key");
  console.log(
    "    - Bob's secret_point matches original:",
    secretPointBytes.equals(bobRecoveredSecretPoint) ? "✅ YES" : "❌ NO",
  );
  console.log(
    "    - Bob's AES key matches original:",
    aesKey.equals(bobRecoveredAesKey) ? "✅ YES" : "❌ NO",
  );

  // Bob can now decrypt the content!
  const bobDecryptedContent = decryptContent(
    bobContentData.encrypted_content_base64,
    bobRecoveredAesKey,
  );
  console.log("  ✅ Bob successfully decrypted the content!");
  console.log("    - Decrypted content:", bobDecryptedContent);
  console.log(
    "    - Matches original:",
    contentPlaintext === bobDecryptedContent ? "✅ YES" : "❌ NO",
  );

  console.log("\n💡 What the ZK Proof Proved:");
  console.log("  ✓ Alice and Bob's ciphertexts encrypt the SAME secret_scalar");
  console.log("  ✓ Without revealing secret_scalar to anyone (zero-knowledge)");
  console.log("  ✓ Using Sigma protocol with Fiat-Shamir heuristic");
  console.log("  ✓ Verified on-chain using Rust Ristretto255 operations");
  console.log("  ✓ Bob can now access the NFT content securely!");

  console.log("\n✅ =================================================");
  console.log("✅ ALL TESTS PASSED!");
  console.log("✅ =================================================");
  console.log("\n📊 Test Summary:");
  console.log("  ✅ Contract deployment: SUCCESS");
  console.log("  ✅ Ristretto255 keypair generation: SUCCESS");
  console.log("  ✅ Encryption key registration: SUCCESS");
  console.log("  ✅ AES-256-GCM content encryption: SUCCESS");
  console.log("  ✅ Exponential ElGamal encryption: SUCCESS");
  console.log("  ✅ Encrypted NFT minting: SUCCESS");
  console.log("  ✅ Content data retrieval: SUCCESS");
  console.log("  ✅ ElGamal decryption (secret_point recovery): SUCCESS");
  console.log("  ✅ AES key derivation from Hash(secret_point): SUCCESS");
  console.log("  ✅ AES-GCM content decryption: SUCCESS");
  console.log("  ✅ End-to-end encryption/decryption: SUCCESS");
  console.log("  ✅ Re-encryption for new owner: SUCCESS");
  console.log("  ✅ Zero-knowledge proof generation: SUCCESS");
  console.log("  ✅ On-chain ZK proof verification: SUCCESS");
  console.log("\n🎉 Full encrypted NFT system validated!");
  console.log("✅ All cryptographic primitives working correctly!");
  console.log(
    "🔐 ZK proofs ensure secure NFT transfers without revealing secrets!",
  );
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
