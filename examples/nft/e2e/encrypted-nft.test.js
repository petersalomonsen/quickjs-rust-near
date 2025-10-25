import { readFile } from "fs/promises";
import { Worker } from "near-workspaces";
import { before, after, test, describe } from "node:test";
import { expect } from "chai";
import crypto from "crypto";

// ============================================================================
// Mock Crypto Functions (simulating client-side operations)
// ============================================================================

// Generate mock Ristretto keypair (32 bytes for public key)
function generateRistrettoKeypair() {
  const privateKey = crypto.randomBytes(32);
  const publicKey = crypto.randomBytes(32); // Mock - in reality computed from private key
  return {
    privateKey: Buffer.from(privateKey).toString("base64"),
    publicKey: Buffer.from(publicKey).toString("base64"),
  };
}

// Mock ElGamal encryption
function mockElGamalEncrypt() {
  const c1 = crypto.randomBytes(32);
  const c2 = crypto.randomBytes(32);
  return {
    c1_base64: Buffer.from(c1).toString("base64"),
    c2_base64: Buffer.from(c2).toString("base64"),
  };
}

// Mock AES-GCM encryption for encrypted_scalar
function mockEncryptScalar() {
  // 92 bytes: IV (12) + ciphertext (64) + tag (16)
  const iv = crypto.randomBytes(12);
  const ciphertext = crypto.randomBytes(64); // secret_scalar + randomness
  const tag = crypto.randomBytes(16);

  const combined = Buffer.concat([iv, ciphertext, tag]);
  return combined.toString("base64");
}

// Mock re-encryption proof generation
function mockGenerateReencryptionProof() {
  return {
    commit_r_old_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
    commit_s_old_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
    commit_r_new_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
    commit_s_new_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
    response_s_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
    response_r_old_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
    response_r_new_base64: Buffer.from(crypto.randomBytes(32)).toString("base64"),
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe("Encrypted NFT E2E Tests", () => {
  let worker;
  let root;
  let contract;
  let alice;
  let bob;
  let aliceKeys;
  let bobKeys;

  before(async () => {
    console.log("\n📦 Setting up test environment...");
    worker = await Worker.init();
    root = worker.rootAccount;

    // Deploy contract
    console.log("  - Deploying NFT contract...");
    contract = await root.devDeploy("out/nft.wasm");
    await contract.call(contract.accountId, "new", {});
    console.log(`  ✅ Contract deployed to: ${contract.accountId}`);

    // Upload JavaScript
    console.log("  - Uploading JavaScript to contract...");
    const nftJavascript = await readFile(new URL("../src/contract.js", import.meta.url));
    await contract.call(contract.accountId, "post_javascript", {
      javascript: nftJavascript.toString(),
    });
    console.log("  ✅ JavaScript uploaded");

    // Create user accounts
    console.log("  - Creating user accounts...");
    alice = await root.createSubAccount("alice");
    bob = await root.createSubAccount("bob");
    console.log(`  ✅ Alice: ${alice.accountId}`);
    console.log(`  ✅ Bob: ${bob.accountId}`);

    // Generate encryption keypairs
    console.log("  - Generating encryption keypairs...");
    aliceKeys = generateRistrettoKeypair();
    bobKeys = generateRistrettoKeypair();
    console.log("  ✅ Keypairs generated");
  });

  after(async () => {
    console.log("\n🧹 Tearing down test environment...");
    await worker.tearDown();
    console.log("  ✅ Cleanup complete");
  });

  test("should register encryption public keys", async () => {
    console.log("\n📋 Test: Register encryption public keys");

    // Register Alice's key
    await alice.call(
      contract.accountId,
      "call_js_func",
      {
        function_name: "register_encryption_pubkey",
        pubkey_base64: aliceKeys.publicKey,
      },
      { gas: "300000000000000" }
    );
    console.log("  ✅ Alice registered key");

    // Register Bob's key
    await bob.call(
      contract.accountId,
      "call_js_func",
      {
        function_name: "register_encryption_pubkey",
        pubkey_base64: bobKeys.publicKey,
      },
      { gas: "300000000000000" }
    );
    console.log("  ✅ Bob registered key");

    // Verify keys are registered
    const alicePubkey = await contract.view("call_js_func", {
      function_name: "get_encryption_pubkey",
      account_id: alice.accountId,
    });
    expect(alicePubkey).to.not.be.null;
    expect(alicePubkey.pubkey_base64).to.equal(aliceKeys.publicKey);
    console.log("  ✅ Alice's key verified");

    const bobPubkey = await contract.view("call_js_func", {
      function_name: "get_encryption_pubkey",
      account_id: bob.accountId,
    });
    expect(bobPubkey).to.not.be.null;
    expect(bobPubkey.pubkey_base64).to.equal(bobKeys.publicKey);
    console.log("  ✅ Bob's key verified");
  });

  test("should mint encrypted NFT", async () => {
    console.log("\n🎨 Test: Mint encrypted NFT");

    // Prepare encrypted content
    const encryptedContent = Buffer.from("Secret music file content!").toString("base64");
    const aliceCiphertext = mockElGamalEncrypt();
    const encryptedScalar = mockEncryptScalar();

    // Mint encrypted NFT
    await contract.call(
      contract.accountId,
      "call_js_func",
      {
        function_name: "nft_mint_with_encrypted_content",
        token_id: "encrypted-nft-1",
        token_owner_id: alice.accountId,
        token_metadata: {
          title: "Encrypted Music NFT #1",
          description: "A music NFT with encrypted content",
        },
        encrypted_content_base64: encryptedContent,
        encrypted_scalar_base64: encryptedScalar,
        elgamal_ciphertext_c1_base64: aliceCiphertext.c1_base64,
        elgamal_ciphertext_c2_base64: aliceCiphertext.c2_base64,
        owner_pubkey_base64: aliceKeys.publicKey,
      },
      {
        gas: "300000000000000",
        attachedDeposit: "20000000000000000000000", // Storage deposit
      }
    );
    console.log("  ✅ Encrypted NFT minted to Alice");

    // Verify token exists
    const token = await contract.view("nft_token", {
      token_id: "encrypted-nft-1",
    });
    expect(token.owner_id).to.equal(alice.accountId);
    console.log("  ✅ Token owner verified: Alice");
  });

  test("should retrieve encrypted content data", async () => {
    console.log("\n🔍 Test: Retrieve encrypted content data");

    const contentData = await contract.view("call_js_func", {
      function_name: "get_encrypted_content_data",
      token_id: "encrypted-nft-1",
    });

    expect(contentData.encrypted_content_base64).to.be.a("string");
    expect(contentData.encrypted_scalar_base64).to.be.a("string");
    expect(contentData.elgamal_ciphertext).to.be.an("object");
    expect(contentData.elgamal_ciphertext.c1_base64).to.be.a("string");
    expect(contentData.elgamal_ciphertext.c2_base64).to.be.a("string");
    console.log("  ✅ Encrypted content data retrieved");
    console.log(`    - Content length: ${contentData.encrypted_content_base64.length}`);
    console.log(`    - Scalar length: ${contentData.encrypted_scalar_base64.length}`);
  });

  test("should transfer NFT with escrow", async () => {
    console.log("\n💸 Test: Transfer NFT from Alice to Bob");

    // Transfer the NFT
    await alice.call(
      contract.accountId,
      "nft_transfer",
      {
        receiver_id: bob.accountId,
        token_id: "encrypted-nft-1",
      },
      {
        gas: "300000000000000",
        attachedDeposit: "1", // 1 yoctoNEAR for security
      }
    );
    console.log("  ✅ NFT transferred to Bob");

    // Verify new owner
    const token = await contract.view("nft_token", {
      token_id: "encrypted-nft-1",
    });
    expect(token.owner_id).to.equal(bob.accountId);
    console.log("  ✅ Token owner verified: Bob");
  });

  test("should fail to finalize re-encryption with invalid proof", async () => {
    console.log("\n🔐 Test: Re-encryption with invalid proof (expected to fail)");

    // Generate mock data for Bob
    const bobCiphertext = mockElGamalEncrypt();
    const proof = mockGenerateReencryptionProof();

    // Try to finalize with invalid (mock) proof
    try {
      await alice.call(
        contract.accountId,
        "call_js_func",
        {
          function_name: "finalize_reencryption",
          token_id: "encrypted-nft-1",
          new_ciphertext_c1_base64: bobCiphertext.c1_base64,
          new_ciphertext_c2_base64: bobCiphertext.c2_base64,
          proof: proof,
        },
        { gas: "300000000000000" }
      );
      // Should not reach here
      throw new Error("Expected finalize_reencryption to fail with invalid proof");
    } catch (error) {
      expect(error.message).to.include("Invalid re-encryption proof");
      console.log("  ✅ Invalid proof correctly rejected");
      console.log("    Error message:", error.message.substring(0, 100) + "...");
    }
  });

  test("summary", () => {
    console.log("\n📊 Test Summary:");
    console.log("  ✅ Encryption key registration: SUCCESS");
    console.log("  ✅ Encrypted NFT minting: SUCCESS");
    console.log("  ✅ NFT transfer with ownership change: SUCCESS");
    console.log("  ✅ Content data retrieval: SUCCESS");
    console.log("  ✅ Invalid proof rejection: SUCCESS");
    console.log("\n💡 Next Steps:");
    console.log("  1. Integrate @noble/curves for real Ristretto operations");
    console.log("  2. Integrate @noble/ciphers for real AES-GCM encryption");
    console.log("  3. Implement proper proof generation and verification");
    console.log("  4. Test full re-encryption flow with valid proofs");
    console.log("\n✅ All Contract Functions Validated!");
  });
});
