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
  viewAccount,
} from "@near-js/jsonrpc-client";
import { RistrettoPoint } from "@noble/curves/ed25519";

console.log("🚀 Starting Encrypted NFT Contract E2E Test (Sandbox)");

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

  // Note: result can legitimately be null (e.g., listing not found)
  // so we only check for undefined
  if (result === undefined) {
    throw new Error("Empty response from contract");
  }

  return result;
}

// ============================================================================
// Ristretto255 ElGamal Encryption/Decryption
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

/**
 * Decrypt ElGamal ciphertext using private key
 * Returns the decrypted secret point (not scalar!)
 */
function elgamalDecrypt(c1Base64, c2Base64, privateKeyBase64) {
  const c1Bytes = Buffer.from(c1Base64, "base64");
  const c2Bytes = Buffer.from(c2Base64, "base64");
  const privateKeyBytes = Buffer.from(privateKeyBase64, "base64");

  const privateKeyScalar = bufferToScalar(privateKeyBytes);
  const c1Point = RistrettoPoint.fromHex(c1Bytes);
  const c2Point = RistrettoPoint.fromHex(c2Bytes);

  // Decrypt: S = C2 - sk * C1
  const secretPoint = c2Point.subtract(c1Point.multiply(privateKeyScalar));
  return Buffer.from(secretPoint.toRawBytes());
}

/**
 * Decrypt AES-GCM encrypted content
 */
function aesDecrypt(key, encryptedContentBase64) {
  const encryptedBuffer = Buffer.from(encryptedContentBase64, "base64");
  const iv = encryptedBuffer.subarray(0, 12);
  const tag = encryptedBuffer.subarray(-16);
  const ciphertext = encryptedBuffer.subarray(12, -16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
}

/**
 * Generate zero-knowledge proof that two ElGamal ciphertexts encrypt the same secret
 */
function generateReencryptionProof(
  secretScalar,
  oldCiphertextC1Base64,
  oldCiphertextC2Base64,
  oldRandomness,
  oldPubkeyBase64,
  newCiphertextC1Base64,
  newCiphertextC2Base64,
  newRandomness,
  newPubkeyBase64,
) {
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

  // Generate random blinding factors
  const t_r_old = bufferToScalar(crypto.randomBytes(32));
  const t_r_new = bufferToScalar(crypto.randomBytes(32));
  const t_s = bufferToScalar(crypto.randomBytes(32));

  // Compute commitments
  const commit_r_old = RistrettoPoint.BASE.multiply(t_r_old);
  const commit_r_new = RistrettoPoint.BASE.multiply(t_r_new);
  const commit_s_old = RistrettoPoint.BASE.multiply(t_s).add(
    oldPubkey.multiply(t_r_old),
  );
  const commit_s_new = RistrettoPoint.BASE.multiply(t_s).add(
    newPubkey.multiply(t_r_new),
  );

  // Compute challenge hash
  const challengeHash = crypto
    .createHash("sha256")
    .update(oldC1)
    .update(oldC2)
    .update(Buffer.from(oldPubkey.toRawBytes()))
    .update(newC1)
    .update(newC2)
    .update(Buffer.from(newPubkey.toRawBytes()))
    .update(Buffer.from(commit_r_old.toRawBytes()))
    .update(Buffer.from(commit_s_old.toRawBytes()))
    .update(Buffer.from(commit_r_new.toRawBytes()))
    .update(Buffer.from(commit_s_new.toRawBytes()))
    .digest();
  const challenge = bufferToScalar(challengeHash);

  // Compute responses
  const response_r_old = (t_r_old + challenge * r_old) % CURVE_ORDER;
  const response_r_new = (t_r_new + challenge * r_new) % CURVE_ORDER;
  const response_s = (t_s + challenge * m) % CURVE_ORDER;

  return {
    commit_r_old_base64: Buffer.from(commit_r_old.toRawBytes()).toString("base64"),
    commit_s_old_base64: Buffer.from(commit_s_old.toRawBytes()).toString("base64"),
    commit_r_new_base64: Buffer.from(commit_r_new.toRawBytes()).toString("base64"),
    commit_s_new_base64: Buffer.from(commit_s_new.toRawBytes()).toString("base64"),
    response_s_base64: Buffer.from(scalarToBuffer(response_s)).toString("base64"),
    response_r_old_base64: Buffer.from(scalarToBuffer(response_r_old)).toString("base64"),
    response_r_new_base64: Buffer.from(scalarToBuffer(response_r_new)).toString("base64"),
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

  const nftJavascript = await readFile(
    new URL("../web4_encrypted_nft/contract-bundle.js", import.meta.url),
    "utf-8"
  );

  console.log(`  📄 Bundled contract size: ${nftJavascript.length} bytes`);

  await functionCall("nft.test.near", "nft.test.near", "post_javascript", {
    javascript: nftJavascript,
  });
  console.log("  ✅ Uploaded bundled JavaScript with embedded HTML viewer");

  console.log("\n👤 Step 3: Create Alice and Mint Encrypted NFT");
  await createAccount("alice.test.near");

  const aliceKeys = generateRistrettoKeypair();
  console.log("  ✅ Generated encryption keys for Alice");

  // Create encrypted NFT
  const secretScalar = crypto.randomBytes(32);
  const secretScalarBigInt = bufferToScalar(secretScalar);
  const secretPoint = RistrettoPoint.BASE.multiply(secretScalarBigInt);
  const secretPointBytes = Buffer.from(secretPoint.toRawBytes());
  const aesKey = crypto.createHash("sha256").update(secretPointBytes).digest();

  // Encrypt content
  const contentPlaintext = "Secret music file - Node.js decryption test!";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(contentPlaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const encryptedContent = Buffer.concat([iv, encrypted, tag]).toString("base64");

  // Encrypt secret_scalar and randomness together (64 bytes total)
  const randomness = crypto.randomBytes(32);
  const scalarAndRandomness = Buffer.concat([secretScalar, randomness]);

  const iv2 = crypto.randomBytes(12);
  const cipher2 = crypto.createCipheriv("aes-256-gcm", aesKey, iv2);
  const encryptedScalarData = Buffer.concat([
    iv2,
    cipher2.update(scalarAndRandomness),
    cipher2.final(),
    cipher2.getAuthTag(),
  ]).toString("base64");

  // ElGamal encrypt
  const aliceCiphertext = elgamalEncrypt(secretScalar, aliceKeys.publicKey);

  const totalStorageBytes = encryptedContent.length + encryptedScalarData.length + 500;
  const totalStorageCost = BigInt(totalStorageBytes) * BigInt("10000000000000000000") + BigInt("20000000000000000000000");

  // Mint NFT
  await functionCall(
    "alice.test.near",
    "nft.test.near",
    "nft_mint",
    {
      token_id: "test-nft-1",
      token_owner_id: "alice.test.near",
      encrypted_content_base64: encryptedContent,
      encrypted_scalar_base64: encryptedScalarData,
      elgamal_ciphertext_c1_base64: aliceCiphertext.c1_base64,
      elgamal_ciphertext_c2_base64: aliceCiphertext.c2_base64,
      owner_pubkey_base64: aliceKeys.publicKey,
    },
    "300000000000000",
    totalStorageCost.toString(),
  );
  console.log("  ✅ Alice minted encrypted NFT: test-nft-1");

  console.log("\n🔍 Step 4: Alice Retrieves and Decrypts NFT Content (Node.js)");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Get encrypted content data
  const contentData = await viewFunction("nft.test.near", "call_js_func", {
    function_name: "get_encrypted_content_data",
    token_id: "test-nft-1",
  });

  console.log("  ✅ Retrieved encrypted content data from contract");

  // Decrypt using Alice's private key
  const secretPointBytes_recovered = elgamalDecrypt(
    contentData.elgamal_ciphertext.c1_base64,
    contentData.elgamal_ciphertext.c2_base64,
    aliceKeys.privateKey
  );

  const aesKey_recovered = crypto.createHash("sha256").update(secretPointBytes_recovered).digest();
  const decryptedContent = aesDecrypt(aesKey_recovered, contentData.encrypted_content_base64);

  console.log("  ✅ Alice successfully decrypted NFT content!");
  console.log("    - Decrypted text:", decryptedContent.toString("utf8"));

  if (decryptedContent.toString("utf8") === contentPlaintext) {
    console.log("  ✅ Decrypted content matches original!");
  } else {
    throw new Error("Decrypted content does not match!");
  }

  console.log("\n🛒 Step 5: Alice Lists NFT for Sale");
  const salePrice = "2000000000000000000000000"; // 2 NEAR

  await functionCall("alice.test.near", "nft.test.near", "call_js_func_mut", {
    function_name: "list_for_sale",
    token_id: "test-nft-1",
    price: salePrice,
  });
  console.log("  ✅ Alice listed NFT for 2 NEAR");

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const listing = await viewFunction("nft.test.near", "call_js_func", {
    function_name: "get_listing",
    token_id: "test-nft-1",
  });
  console.log("  ✅ Listing confirmed - Price:", listing.price);

  console.log("\n👤 Step 6: Create Bob and Purchase NFT");
  await createAccount("bob.test.near");
  const bobKeys = generateRistrettoKeypair();
  console.log("  ✅ Generated encryption keys for Bob");

  await functionCall(
    "bob.test.near",
    "nft.test.near",
    "call_js_func_mut",
    {
      function_name: "buy",
      token_id: "test-nft-1",
      buyer_pubkey_base64: bobKeys.publicKey,
    },
    "300000000000000",
    salePrice,
  );
  console.log("  ✅ Bob purchased NFT - funds locked in escrow");

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const escrow = await viewFunction("nft.test.near", "call_js_func", {
    function_name: "get_escrow",
    token_id: "test-nft-1",
  });
  console.log("  ✅ Escrow created - Buyer:", escrow.buyer);

  console.log("\n🔄 Step 7: Alice Completes Sale with Re-encryption");

  // Alice decrypts to get the secret scalar and randomness
  const encryptedScalarBuffer = Buffer.from(encryptedScalarData, "base64");
  const scalarIv = encryptedScalarBuffer.subarray(0, 12);
  const scalarTag = encryptedScalarBuffer.subarray(-16);
  const scalarCiphertext = encryptedScalarBuffer.subarray(12, -16);

  const scalarDecipher = crypto.createDecipheriv("aes-256-gcm", aesKey_recovered, scalarIv);
  scalarDecipher.setAuthTag(scalarTag);
  const recoveredScalarAndRandomness = Buffer.concat([
    scalarDecipher.update(scalarCiphertext),
    scalarDecipher.final(),
  ]);

  const recoveredSecretScalar = recoveredScalarAndRandomness.subarray(0, 32);
  const recoveredRandomness = recoveredScalarAndRandomness.subarray(32, 64);

  console.log("  ✅ Alice recovered secret scalar and randomness");

  // Re-encrypt for Bob
  const bobCiphertext = elgamalEncrypt(recoveredSecretScalar, bobKeys.publicKey);
  console.log("  ✅ Re-encrypted secret scalar for Bob");

  // Generate zero-knowledge proof
  const proof = generateReencryptionProof(
    recoveredSecretScalar,
    aliceCiphertext.c1_base64,
    aliceCiphertext.c2_base64,
    aliceCiphertext.randomness,
    aliceKeys.publicKey,
    bobCiphertext.c1_base64,
    bobCiphertext.c2_base64,
    bobCiphertext.randomness,
    bobKeys.publicKey,
  );

  console.log("  ✅ Generated zero-knowledge re-encryption proof");

  // Complete sale
  await functionCall(
    "alice.test.near",
    "nft.test.near",
    "call_js_func_mut",
    {
      function_name: "complete_sale",
      token_id: "test-nft-1",
      elgamal_ciphertext_c1_base64: bobCiphertext.c1_base64,
      elgamal_ciphertext_c2_base64: bobCiphertext.c2_base64,
      buyer_pubkey_base64: bobKeys.publicKey,
      proof_commit_r_old: proof.commit_r_old_base64,
      proof_commit_s_old: proof.commit_s_old_base64,
      proof_commit_r_new: proof.commit_r_new_base64,
      proof_commit_s_new: proof.commit_s_new_base64,
      proof_response_s: proof.response_s_base64,
      proof_response_r_old: proof.response_r_old_base64,
      proof_response_r_new: proof.response_r_new_base64,
    },
  );
  console.log("  ✅ Sale completed with proof - ownership transferred");

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("\n🔍 Step 8: Verify Ownership Transfer");
  const finalToken = await viewFunction("nft.test.near", "nft_token", {
    token_id: "test-nft-1",
  });

  if (finalToken.owner_id === "bob.test.near") {
    console.log("  ✅ Ownership successfully transferred to Bob!");
  } else {
    throw new Error(`Expected owner bob.test.near, got ${finalToken.owner_id}`);
  }

  console.log("\n🔓 Step 9: Bob Retrieves and Decrypts NFT Content (Node.js)");

  // Get updated encrypted content data (with Bob's ciphertext)
  const contentDataForBob = await viewFunction("nft.test.near", "call_js_func", {
    function_name: "get_encrypted_content_data",
    token_id: "test-nft-1",
  });

  console.log("  ✅ Bob retrieved encrypted content data");

  // Bob decrypts using his private key
  const bobSecretPoint = elgamalDecrypt(
    contentDataForBob.elgamal_ciphertext.c1_base64,
    contentDataForBob.elgamal_ciphertext.c2_base64,
    bobKeys.privateKey
  );

  const bobAesKey = crypto.createHash("sha256").update(bobSecretPoint).digest();
  const bobDecryptedContent = aesDecrypt(bobAesKey, contentDataForBob.encrypted_content_base64);

  console.log("  ✅ Bob successfully decrypted NFT content!");
  console.log("    - Decrypted text:", bobDecryptedContent.toString("utf8"));

  if (bobDecryptedContent.toString("utf8") === contentPlaintext) {
    console.log("  ✅ Bob's decrypted content matches original!");
  } else {
    throw new Error("Bob's decrypted content does not match!");
  }

  console.log("\n✅ =================================================");
  console.log("✅ ALL CONTRACT TESTS PASSED!");
  console.log("✅ =================================================");
  console.log("\n📊 Test Summary:");
  console.log("  ✅ Contract deployment: SUCCESS");
  console.log("  ✅ Bundled JavaScript upload: SUCCESS");
  console.log("  ✅ Encrypted NFT minting: SUCCESS");
  console.log("  ✅ Alice content decryption (Node.js): SUCCESS");
  console.log("  ✅ Marketplace listing: SUCCESS");
  console.log("  ✅ NFT purchase with escrow: SUCCESS");
  console.log("  ✅ Re-encryption for buyer: SUCCESS");
  console.log("  ✅ Sale completion with ZK proof: SUCCESS");
  console.log("  ✅ Ownership transfer verification: SUCCESS");
  console.log("  ✅ Bob content decryption (Node.js): SUCCESS");
  console.log("\n🎉 Full encrypted NFT marketplace validated!");
  console.log("🔐 Content encryption/decryption works correctly!");
  console.log("🛒 Marketplace cycle: List → Buy → Escrow → Re-encrypt → Transfer!");
  console.log("💰 Alice sold, Bob owns and can decrypt the NFT!");
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
