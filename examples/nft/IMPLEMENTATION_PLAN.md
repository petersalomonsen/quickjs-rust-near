# NFT Encrypted Content - Implementation Plan

**Status:** Ready for Implementation
**Date:** 2025-10-24
**Reference:** See ENCRYPTED_CONTENT.md for cryptographic background and Q&A

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Summary](#architecture-summary)
3. [Component Specifications](#component-specifications)
   - [Rust Host Functions](#rust-host-functions)
   - [JavaScript Contract Functions](#javascript-contract-functions)
   - [Client-Side Library](#client-side-library)
   - [Data Structures & Storage](#data-structures--storage)
4. [Implementation Steps](#implementation-steps)
5. [Testing Plan](#testing-plan)

---

## Overview

This system enables NFTs with encrypted content where:
- **Content is encrypted** with an AES-256-GCM key stored on-chain (encrypted)
- **Ownership transfers** require cryptographic re-encryption by the seller
- **Zero-knowledge proofs** ensure the seller re-encrypted correctly
- **Escrow mechanism** holds funds until seller provides valid proof
- **Fully on-chain** with no off-chain services required

### Key Innovation

The `encrypted_scalar` (the master secret) is encrypted with the AES key it generates and stored on-chain. This allows any owner to:
1. Decrypt the ElGamal ciphertext → get secret_point
2. Derive AES key → Hash(secret_point)
3. Decrypt encrypted_scalar → get master secret
4. Re-encrypt for the next owner

---

## Architecture Summary

### Cryptographic Components

```
┌─────────────────────────────────────────────────────────────┐
│                    ON-CHAIN STORAGE                          │
├─────────────────────────────────────────────────────────────┤
│ Per NFT:                                                     │
│ • locked-content-{token_id}     → Encrypted content (30-50KB)│
│ • encrypted-scalar-{token_id}   → 92 bytes (IV+CT+Tag)      │
│ • elgamal-ciphertext-{token_id} → 64 bytes (C1+C2)          │
│ • owner-pubkey-{token_id}       → 32 bytes (Ristretto)      │
│                                                              │
│ Per Account:                                                 │
│ • encryption_key:{account_id}   → Registered Ristretto pubkey│
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    OFF-CHAIN (CLIENT)                        │
├─────────────────────────────────────────────────────────────┤
│ • Ristretto keypair generation                              │
│ • ElGamal encryption/decryption                             │
│ • AES-256-GCM encryption/decryption                         │
│ • ZK proof generation                                       │
│ • Content encryption/decryption                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    ON-CHAIN (CONTRACT)                       │
├─────────────────────────────────────────────────────────────┤
│ • ZK proof verification (via host functions)                │
│ • Escrow management                                         │
│ • State transitions                                         │
└─────────────────────────────────────────────────────────────┘
```

### Security Properties

✅ **Confidentiality:** Only owner can decrypt content
✅ **Integrity:** ZK proof ensures correct re-encryption
✅ **Authenticity:** Only current owner can generate valid proof
✅ **Atomic Transfer:** Payment only released after valid re-encryption
✅ **No Replay:** Each proof tied to specific stored ciphertext

---

## Component Specifications

### 1. Rust Host Functions

These functions are exposed to JavaScript via the `env` object.

#### File: `src/host_functions/crypto.rs` (new module)

```rust
use curve25519_dalek::ristretto::{RistrettoPoint, CompressedRistretto};
use curve25519_dalek::scalar::Scalar;
use curve25519_dalek::constants::RISTRETTO_BASEPOINT_TABLE;
use sha2::{Sha256, Digest};

// ============================================================================
// Basic Ristretto Operations
// ============================================================================

/// Multiply a scalar by a point: scalar * point
pub fn ristretto_scalar_mul(scalar_bytes: &[u8], point_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let scalar = Scalar::from_canonical_bytes(scalar_bytes.try_into().map_err(|_| "Invalid scalar")?)
        .ok_or("Invalid scalar")?;

    let compressed = CompressedRistretto::from_slice(point_bytes)
        .map_err(|_| "Invalid point")?;
    let point = compressed.decompress()
        .ok_or("Failed to decompress point")?;

    let result = point * scalar;
    Ok(result.compress().to_bytes().to_vec())
}

/// Add two points: point1 + point2
pub fn ristretto_point_add(point1_bytes: &[u8], point2_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let compressed1 = CompressedRistretto::from_slice(point1_bytes)
        .map_err(|_| "Invalid point1")?;
    let point1 = compressed1.decompress()
        .ok_or("Failed to decompress point1")?;

    let compressed2 = CompressedRistretto::from_slice(point2_bytes)
        .map_err(|_| "Invalid point2")?;
    let point2 = compressed2.decompress()
        .ok_or("Failed to decompress point2")?;

    let result = point1 + point2;
    Ok(result.compress().to_bytes().to_vec())
}

/// Subtract two points: point1 - point2
pub fn ristretto_point_sub(point1_bytes: &[u8], point2_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let compressed1 = CompressedRistretto::from_slice(point1_bytes)
        .map_err(|_| "Invalid point1")?;
    let point1 = compressed1.decompress()
        .ok_or("Failed to decompress point1")?;

    let compressed2 = CompressedRistretto::from_slice(point2_bytes)
        .map_err(|_| "Invalid point2")?;
    let point2 = compressed2.decompress()
        .ok_or("Failed to decompress point2")?;

    let result = point1 - point2;
    Ok(result.compress().to_bytes().to_vec())
}

/// Multiply scalar by basepoint: scalar * G
pub fn ristretto_basepoint_mul(scalar_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let scalar = Scalar::from_canonical_bytes(scalar_bytes.try_into().map_err(|_| "Invalid scalar")?)
        .ok_or("Invalid scalar")?;

    let result = &RISTRETTO_BASEPOINT_TABLE * &scalar;
    Ok(result.compress().to_bytes().to_vec())
}

// ============================================================================
// ZK Proof Verification (All-in-One)
// ============================================================================

pub struct Ciphertext {
    pub c1: CompressedRistretto,
    pub c2: CompressedRistretto,
}

pub struct ReencryptionProof {
    pub commit_r_old: CompressedRistretto,
    pub commit_s_old: CompressedRistretto,
    pub commit_r_new: CompressedRistretto,
    pub commit_s_new: CompressedRistretto,
    pub response_s: Scalar,
    pub response_r_old: Scalar,
    pub response_r_new: Scalar,
}

fn compute_challenge(
    old_ct: &Ciphertext,
    old_pk: &RistrettoPoint,
    new_ct: &Ciphertext,
    new_pk: &RistrettoPoint,
    commit_r_old: &RistrettoPoint,
    commit_s_old: &RistrettoPoint,
    commit_r_new: &RistrettoPoint,
    commit_s_new: &RistrettoPoint,
) -> Scalar {
    let mut hasher = Sha256::new();
    hasher.update(old_ct.c1.as_bytes());
    hasher.update(old_ct.c2.as_bytes());
    hasher.update(old_pk.compress().as_bytes());
    hasher.update(new_ct.c1.as_bytes());
    hasher.update(new_ct.c2.as_bytes());
    hasher.update(new_pk.compress().as_bytes());
    hasher.update(commit_r_old.compress().as_bytes());
    hasher.update(commit_s_old.compress().as_bytes());
    hasher.update(commit_r_new.compress().as_bytes());
    hasher.update(commit_s_new.compress().as_bytes());

    let hash = hasher.finalize();
    Scalar::from_bytes_mod_order(hash.into())
}

/// Verify a re-encryption proof
/// Takes base64-encoded strings, returns boolean
pub fn verify_reencryption_proof(
    old_ciphertext_c1_b64: &str,
    old_ciphertext_c2_b64: &str,
    old_pubkey_b64: &str,
    new_ciphertext_c1_b64: &str,
    new_ciphertext_c2_b64: &str,
    new_pubkey_b64: &str,
    proof_commit_r_old_b64: &str,
    proof_commit_s_old_b64: &str,
    proof_commit_r_new_b64: &str,
    proof_commit_s_new_b64: &str,
    proof_response_s_b64: &str,
    proof_response_r_old_b64: &str,
    proof_response_r_new_b64: &str,
) -> Result<bool, String> {
    // Decode base64 inputs
    let decode_point = |b64: &str| -> Result<CompressedRistretto, String> {
        let bytes = base64::decode(b64).map_err(|_| "Invalid base64")?;
        if bytes.len() != 32 {
            return Err("Invalid point length".to_string());
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        Ok(CompressedRistretto(arr))
    };

    let decode_scalar = |b64: &str| -> Result<Scalar, String> {
        let bytes = base64::decode(b64).map_err(|_| "Invalid base64")?;
        if bytes.len() != 32 {
            return Err("Invalid scalar length".to_string());
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        Scalar::from_canonical_bytes(arr).ok_or("Invalid scalar".to_string())
    };

    // Parse inputs
    let old_ciphertext = Ciphertext {
        c1: decode_point(old_ciphertext_c1_b64)?,
        c2: decode_point(old_ciphertext_c2_b64)?,
    };

    let old_pubkey = decode_point(old_pubkey_b64)?
        .decompress()
        .ok_or("Failed to decompress old_pubkey")?;

    let new_ciphertext = Ciphertext {
        c1: decode_point(new_ciphertext_c1_b64)?,
        c2: decode_point(new_ciphertext_c2_b64)?,
    };

    let new_pubkey = decode_point(new_pubkey_b64)?
        .decompress()
        .ok_or("Failed to decompress new_pubkey")?;

    let proof = ReencryptionProof {
        commit_r_old: decode_point(proof_commit_r_old_b64)?,
        commit_s_old: decode_point(proof_commit_s_old_b64)?,
        commit_r_new: decode_point(proof_commit_r_new_b64)?,
        commit_s_new: decode_point(proof_commit_s_new_b64)?,
        response_s: decode_scalar(proof_response_s_b64)?,
        response_r_old: decode_scalar(proof_response_r_old_b64)?,
        response_r_new: decode_scalar(proof_response_r_new_b64)?,
    };

    // Decompress commitments
    let commit_r_old = proof.commit_r_old.decompress()
        .ok_or("Failed to decompress commit_r_old")?;
    let commit_s_old = proof.commit_s_old.decompress()
        .ok_or("Failed to decompress commit_s_old")?;
    let commit_r_new = proof.commit_r_new.decompress()
        .ok_or("Failed to decompress commit_r_new")?;
    let commit_s_new = proof.commit_s_new.decompress()
        .ok_or("Failed to decompress commit_s_new")?;

    // Recompute challenge
    let challenge = compute_challenge(
        &old_ciphertext,
        &old_pubkey,
        &new_ciphertext,
        &new_pubkey,
        &commit_r_old,
        &commit_s_old,
        &commit_r_new,
        &commit_s_new,
    );

    let c1_old = old_ciphertext.c1.decompress()
        .ok_or("Failed to decompress c1_old")?;
    let c2_old = old_ciphertext.c2.decompress()
        .ok_or("Failed to decompress c2_old")?;
    let c1_new = new_ciphertext.c1.decompress()
        .ok_or("Failed to decompress c1_new")?;
    let c2_new = new_ciphertext.c2.decompress()
        .ok_or("Failed to decompress c2_new")?;

    // Verify equation 1: response_r_old*G = commit_r_old + challenge*C1_old
    let lhs1 = &RISTRETTO_BASEPOINT_TABLE * &proof.response_r_old;
    let rhs1 = commit_r_old + c1_old * challenge;
    if lhs1 != rhs1 {
        return Ok(false);
    }

    // Verify equation 2: response_s*G + response_r_old*PK_old = commit_s_old + challenge*C2_old
    let lhs2 = &RISTRETTO_BASEPOINT_TABLE * &proof.response_s + old_pubkey * proof.response_r_old;
    let rhs2 = commit_s_old + c2_old * challenge;
    if lhs2 != rhs2 {
        return Ok(false);
    }

    // Verify equation 3: response_r_new*G = commit_r_new + challenge*C1_new
    let lhs3 = &RISTRETTO_BASEPOINT_TABLE * &proof.response_r_new;
    let rhs3 = commit_r_new + c1_new * challenge;
    if lhs3 != rhs3 {
        return Ok(false);
    }

    // Verify equation 4: response_s*G + response_r_new*PK_new = commit_s_new + challenge*C2_new
    let lhs4 = &RISTRETTO_BASEPOINT_TABLE * &proof.response_s + new_pubkey * proof.response_r_new;
    let rhs4 = commit_s_new + c2_new * challenge;
    if lhs4 != rhs4 {
        return Ok(false);
    }

    Ok(true)
}
```

#### QuickJS Function Bindings

Update the QuickJS environment to expose these functions:

```rust
// In the QuickJS environment setup
context.add_function("ristretto_scalar_mul", |args| {
    // Parse base64 arguments
    // Call ristretto_scalar_mul
    // Return base64 result
});

context.add_function("ristretto_point_add", |args| { /* ... */ });
context.add_function("ristretto_point_sub", |args| { /* ... */ });
context.add_function("ristretto_basepoint_mul", |args| { /* ... */ });
context.add_function("verify_reencryption_proof", |args| { /* ... */ });
```

---

### 2. JavaScript Contract Functions

#### File: `examples/nft/src/contract.js`

Add these functions to the existing NFT contract:

```javascript
// ============================================================================
// Encryption Key Registration
// ============================================================================

/**
 * Register encryption public key for the caller
 * Must be called before receiving encrypted NFTs
 */
export function register_encryption_pubkey() {
  const { pubkey_base64 } = JSON.parse(env.input());
  const caller = env.signer_account_id();

  // Validate pubkey is 32 bytes (compressed Ristretto point)
  const decoded = env.base64_decode(pubkey_base64);
  if (decoded.length !== 32) {
    env.panic("Invalid pubkey: must be 32 bytes");
  }

  // Store: account → ristretto public key mapping
  env.storage_write(`encryption_key:${caller}`, pubkey_base64);
}

/**
 * Get registered encryption public key for an account
 */
export function get_encryption_pubkey() {
  const { account_id } = JSON.parse(env.input());
  const pubkey = env.storage_read(`encryption_key:${account_id}`);

  if (!pubkey) {
    return JSON.stringify(null);
  }

  return JSON.stringify({ pubkey_base64: pubkey });
}

// ============================================================================
// Minting with Encrypted Content
// ============================================================================

/**
 * Mint NFT with encrypted content
 * Caller must provide encrypted content and ElGamal ciphertext
 */
export function nft_mint_with_encrypted_content() {
  const caller = env.signer_account_id();

  // Only contract account can mint
  if (caller !== env.current_account_id()) {
    env.panic("only contract account can mint");
  }

  const {
    token_id,
    token_owner_id,
    token_metadata,
    encrypted_content_base64,      // Encrypted with AES-GCM key
    encrypted_scalar_base64,       // 92 bytes: IV + encrypted (secret_scalar + randomness) + tag
    elgamal_ciphertext_c1_base64,  // 32 bytes
    elgamal_ciphertext_c2_base64,  // 32 bytes
    owner_pubkey_base64,           // 32 bytes: owner's Ristretto pubkey
  } = JSON.parse(env.input());

  // Verify owner has registered encryption key
  const registered_pubkey = env.storage_read(`encryption_key:${token_owner_id}`);
  if (!registered_pubkey) {
    env.panic(`Owner ${token_owner_id} has not registered encryption key`);
  }

  if (registered_pubkey !== owner_pubkey_base64) {
    env.panic("Provided pubkey does not match registered key");
  }

  // Store encrypted content data
  env.storage_write(`locked-content:${token_id}`, encrypted_content_base64);
  env.storage_write(`encrypted-scalar:${token_id}`, encrypted_scalar_base64);
  env.storage_write(`elgamal-ciphertext-c1:${token_id}`, elgamal_ciphertext_c1_base64);
  env.storage_write(`elgamal-ciphertext-c2:${token_id}`, elgamal_ciphertext_c2_base64);
  env.storage_write(`owner-pubkey:${token_id}`, owner_pubkey_base64);

  // Call standard NFT mint (reuse existing logic)
  // This will create the token with standard metadata
  const mint_result = env.nft_mint_internal(token_id, token_owner_id, token_metadata);

  return mint_result;
}

// ============================================================================
// Transfer with Escrow
// ============================================================================

/**
 * Modified nft_payout to handle encrypted content escrow
 * Returns payout to contract instead of seller when encrypted content exists
 */
export function nft_payout() {
  const args = JSON.parse(env.input());
  const { token_id, balance } = args;

  const token = JSON.parse(env.nft_token(token_id));
  const token_owner_id = token.owner_id;
  const contract_owner = env.contract_owner();

  // Check if this token has encrypted content
  const has_encrypted_content = env.storage_read(`encrypted-scalar:${token_id}`) !== null;

  const payout = {};
  const balanceBigInt = BigInt(balance);

  const addPayout = (account, amount) => {
    if (!payout[account]) {
      payout[account] = 0n;
    }
    payout[account] += amount;
  };

  if (has_encrypted_content) {
    // Hold funds in escrow (pay to contract)
    // Seller will get paid after finalize_reencryption
    addPayout(env.current_account_id(), balanceBigInt);

    // Store escrow info
    const escrow_data = {
      token_id,
      previous_owner: token_owner_id,
      balance: balance,
      payout: {
        [token_owner_id]: ((balanceBigInt * 80n) / 100n).toString(),
        [contract_owner]: ((balanceBigInt * 20n) / 100n).toString(),
      },
    };
    env.storage_write(`escrow:${token_id}`, JSON.stringify(escrow_data));
  } else {
    // Regular payout (no encrypted content)
    addPayout(token_owner_id, (balanceBigInt * 80n) / 100n);
    addPayout(contract_owner, (balanceBigInt * 20n) / 100n);
  }

  // Convert BigInt to strings for return
  Object.keys(payout).forEach((k) => (payout[k] = payout[k].toString()));

  return JSON.stringify({ payout });
}

// ============================================================================
// Finalize Re-encryption
// ============================================================================

/**
 * Finalize re-encryption and release escrow payment
 * Called by previous owner after transfer
 */
export function finalize_reencryption() {
  const {
    token_id,
    new_ciphertext_c1_base64,
    new_ciphertext_c2_base64,
    proof,
  } = JSON.parse(env.input());

  const caller = env.signer_account_id();

  // Load escrow data
  const escrow_json = env.storage_read(`escrow:${token_id}`);
  if (!escrow_json) {
    env.panic(`No pending escrow for token ${token_id}`);
  }

  const escrow = JSON.parse(escrow_json);

  // Verify caller is the previous owner
  if (caller !== escrow.previous_owner) {
    env.panic("Only previous owner can finalize re-encryption");
  }

  // Load stored encryption state
  const old_ciphertext_c1 = env.storage_read(`elgamal-ciphertext-c1:${token_id}`);
  const old_ciphertext_c2 = env.storage_read(`elgamal-ciphertext-c2:${token_id}`);
  const old_pubkey = env.storage_read(`owner-pubkey:${token_id}`);

  // Get new owner's registered pubkey
  const token = JSON.parse(env.nft_token(token_id));
  const new_owner = token.owner_id;
  const new_pubkey = env.storage_read(`encryption_key:${new_owner}`);

  if (!new_pubkey) {
    env.panic(`New owner ${new_owner} has not registered encryption key`);
  }

  // Verify zero-knowledge proof
  const is_valid = env.verify_reencryption_proof(
    old_ciphertext_c1,
    old_ciphertext_c2,
    old_pubkey,
    new_ciphertext_c1_base64,
    new_ciphertext_c2_base64,
    new_pubkey,
    proof.commit_r_old_base64,
    proof.commit_s_old_base64,
    proof.commit_r_new_base64,
    proof.commit_s_new_base64,
    proof.response_s_base64,
    proof.response_r_old_base64,
    proof.response_r_new_base64
  );

  if (!is_valid) {
    env.panic("Invalid re-encryption proof");
  }

  // Update stored ciphertext for new owner
  env.storage_write(`elgamal-ciphertext-c1:${token_id}`, new_ciphertext_c1_base64);
  env.storage_write(`elgamal-ciphertext-c2:${token_id}`, new_ciphertext_c2_base64);
  env.storage_write(`owner-pubkey:${token_id}`, new_pubkey);

  // Release escrow payment
  Object.entries(escrow.payout).forEach(([account, amount]) => {
    env.promise_batch_action_transfer(account, amount);
  });

  // Clear escrow
  env.storage_remove(`escrow:${token_id}`);

  return JSON.stringify({ success: true });
}

// ============================================================================
// Cancel Transfer (Buyer Protection)
// ============================================================================

/**
 * Cancel transfer and refund if seller never provides re-encryption
 * Can only be called by new owner
 */
export function cancel_transfer_and_refund() {
  const { token_id } = JSON.parse(env.input());
  const caller = env.signer_account_id();

  // Load escrow data
  const escrow_json = env.storage_read(`escrow:${token_id}`);
  if (!escrow_json) {
    env.panic(`No pending escrow for token ${token_id}`);
  }

  const escrow = JSON.parse(escrow_json);

  // Verify caller is the current (new) owner
  const token = JSON.parse(env.nft_token(token_id));
  if (caller !== token.owner_id) {
    env.panic("Only current owner can cancel transfer");
  }

  // Revert ownership back to previous owner
  env.nft_transfer_internal(token_id, escrow.previous_owner);

  // Refund to current owner (who is canceling)
  env.promise_batch_action_transfer(caller, escrow.balance);

  // Clear escrow
  env.storage_remove(`escrow:${token_id}`);

  return JSON.stringify({ success: true, refunded_to: caller });
}

// ============================================================================
// Content Access
// ============================================================================

/**
 * Get encrypted content for an NFT
 * Only returns data, decryption happens client-side
 */
export function get_encrypted_content_data() {
  const { token_id } = JSON.parse(env.input());

  const encrypted_content = env.storage_read(`locked-content:${token_id}`);
  const encrypted_scalar = env.storage_read(`encrypted-scalar:${token_id}`);
  const ciphertext_c1 = env.storage_read(`elgamal-ciphertext-c1:${token_id}`);
  const ciphertext_c2 = env.storage_read(`elgamal-ciphertext-c2:${token_id}`);
  const owner_pubkey = env.storage_read(`owner-pubkey:${token_id}`);

  if (!encrypted_content) {
    return JSON.stringify({ error: "No encrypted content for this token" });
  }

  return JSON.stringify({
    encrypted_content_base64: encrypted_content,
    encrypted_scalar_base64: encrypted_scalar,
    elgamal_ciphertext: {
      c1_base64: ciphertext_c1,
      c2_base64: ciphertext_c2,
    },
    owner_pubkey_base64: owner_pubkey,
  });
}
```

---

### 3. Client-Side Library

Create a JavaScript/TypeScript library for client-side operations.

#### File: `examples/nft/client-lib/encrypted-nft.js`

```javascript
import { RistrettoPoint, Scalar } from '@noble/curves/ed25519';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { sha256 } from '@noble/hashes/sha256';

// ============================================================================
// Keypair Management
// ============================================================================

export class EncryptionKeypair {
  constructor(privateKey, publicKey) {
    this.privateKey = privateKey; // Scalar
    this.publicKey = publicKey;   // RistrettoPoint
  }

  static generate() {
    // Generate random scalar for private key
    const privKeyBytes = randomBytes(32);
    const privateKey = Scalar.fromBytes(privKeyBytes);

    // Compute public key = privkey * G
    const publicKey = RistrettoPoint.BASE.multiply(privateKey);

    return new EncryptionKeypair(privateKey, publicKey);
  }

  static fromPrivateKey(privKeyBytes) {
    const privateKey = Scalar.fromBytes(privKeyBytes);
    const publicKey = RistrettoPoint.BASE.multiply(privateKey);
    return new EncryptionKeypair(privateKey, publicKey);
  }

  getPublicKeyBase64() {
    return Buffer.from(this.publicKey.toRawBytes()).toString('base64');
  }

  getPrivateKeyBytes() {
    return this.privateKey.toBytes();
  }
}

// ============================================================================
// ElGamal Encryption/Decryption
// ============================================================================

export class ElGamalCiphertext {
  constructor(c1, c2) {
    this.c1 = c1; // RistrettoPoint
    this.c2 = c2; // RistrettoPoint
  }

  toBase64() {
    return {
      c1_base64: Buffer.from(this.c1.toRawBytes()).toString('base64'),
      c2_base64: Buffer.from(this.c2.toRawBytes()).toString('base64'),
    };
  }

  static fromBase64(c1_base64, c2_base64) {
    const c1 = RistrettoPoint.fromHex(Buffer.from(c1_base64, 'base64'));
    const c2 = RistrettoPoint.fromHex(Buffer.from(c2_base64, 'base64'));
    return new ElGamalCiphertext(c1, c2);
  }
}

export function elgamal_encrypt(secretScalar, recipientPubkey, randomness) {
  // secret_point = secret_scalar * G
  const secretPoint = RistrettoPoint.BASE.multiply(secretScalar);

  // C1 = randomness * G
  const c1 = RistrettoPoint.BASE.multiply(randomness);

  // C2 = secret_point + randomness * recipient_pubkey
  const c2 = secretPoint.add(recipientPubkey.multiply(randomness));

  return new ElGamalCiphertext(c1, c2);
}

export function elgamal_decrypt(ciphertext, privateKey) {
  // secret_point = C2 - privkey * C1
  const secretPoint = ciphertext.c2.subtract(ciphertext.c1.multiply(privateKey));
  return secretPoint;
}

// ============================================================================
// AES-GCM Operations
// ============================================================================

export function derive_aes_key(secretPoint) {
  // aes_key = SHA256(secret_point.bytes)
  const pointBytes = secretPoint.toRawBytes();
  return sha256(pointBytes);
}

export function aes_gcm_encrypt(plaintext, key, iv) {
  const cipher = gcm(key, iv);
  const ciphertext = cipher.encrypt(plaintext);
  return ciphertext; // Includes auth tag
}

export function aes_gcm_decrypt(ciphertext, key, iv) {
  const cipher = gcm(key, iv);
  const plaintext = cipher.decrypt(ciphertext);
  return plaintext;
}

// ============================================================================
// Encrypted Scalar Management
// ============================================================================

export function create_encrypted_scalar(secretScalar, randomness, aesKey) {
  // Generate random IV (12 bytes for GCM)
  const iv = randomBytes(12);

  // Combine secret_scalar (32 bytes) and randomness (32 bytes)
  const combined = new Uint8Array(64);
  combined.set(secretScalar.toBytes(), 0);
  combined.set(randomness.toBytes(), 32);

  // Encrypt with AES-GCM
  const ciphertext = aes_gcm_encrypt(combined, aesKey, iv);

  // Return: IV (12) + ciphertext (64) + tag (16) = 92 bytes
  const result = new Uint8Array(92);
  result.set(iv, 0);
  result.set(ciphertext, 12);

  return Buffer.from(result).toString('base64');
}

export function decrypt_encrypted_scalar(encryptedScalarBase64, aesKey) {
  const encryptedScalar = Buffer.from(encryptedScalarBase64, 'base64');

  // Parse: IV (12) + ciphertext (64) + tag (16) = 92 bytes
  const iv = encryptedScalar.slice(0, 12);
  const ciphertext = encryptedScalar.slice(12, 92);

  // Decrypt
  const combined = aes_gcm_decrypt(ciphertext, aesKey, iv);

  // Split into secret_scalar (32) and randomness (32)
  const secretScalar = Scalar.fromBytes(combined.slice(0, 32));
  const randomness = Scalar.fromBytes(combined.slice(32, 64));

  return { secretScalar, randomness };
}

// ============================================================================
// Zero-Knowledge Proof Generation
// ============================================================================

export function prove_reencryption(
  secretScalar,
  oldCiphertext,
  oldPubkey,
  oldRandomness,
  newCiphertext,
  newPubkey,
  newRandomness
) {
  // Generate random blinding factors
  const blindS = Scalar.fromBytes(randomBytes(32));
  const blindROld = Scalar.fromBytes(randomBytes(32));
  const blindRNew = Scalar.fromBytes(randomBytes(32));

  // Commitments for old ciphertext
  const commitROld = RistrettoPoint.BASE.multiply(blindROld);
  const commitSOld = RistrettoPoint.BASE.multiply(blindS)
    .add(oldPubkey.multiply(blindROld));

  // Commitments for new ciphertext (uses same blindS!)
  const commitRNew = RistrettoPoint.BASE.multiply(blindRNew);
  const commitSNew = RistrettoPoint.BASE.multiply(blindS)
    .add(newPubkey.multiply(blindRNew));

  // Compute Fiat-Shamir challenge
  const challenge = compute_challenge(
    oldCiphertext,
    oldPubkey,
    newCiphertext,
    newPubkey,
    commitROld,
    commitSOld,
    commitRNew,
    commitSNew
  );

  // Compute responses
  const responseS = blindS.add(challenge.multiply(secretScalar));
  const responseROld = blindROld.add(challenge.multiply(oldRandomness));
  const responseRNew = blindRNew.add(challenge.multiply(newRandomness));

  return {
    commit_r_old_base64: Buffer.from(commitROld.toRawBytes()).toString('base64'),
    commit_s_old_base64: Buffer.from(commitSOld.toRawBytes()).toString('base64'),
    commit_r_new_base64: Buffer.from(commitRNew.toRawBytes()).toString('base64'),
    commit_s_new_base64: Buffer.from(commitSNew.toRawBytes()).toString('base64'),
    response_s_base64: Buffer.from(responseS.toBytes()).toString('base64'),
    response_r_old_base64: Buffer.from(responseROld.toBytes()).toString('base64'),
    response_r_new_base64: Buffer.from(responseRNew.toBytes()).toString('base64'),
  };
}

function compute_challenge(
  oldCiphertext,
  oldPubkey,
  newCiphertext,
  newPubkey,
  commitROld,
  commitSOld,
  commitRNew,
  commitSNew
) {
  // Hash all public values
  const hasher = sha256.create();
  hasher.update(oldCiphertext.c1.toRawBytes());
  hasher.update(oldCiphertext.c2.toRawBytes());
  hasher.update(oldPubkey.toRawBytes());
  hasher.update(newCiphertext.c1.toRawBytes());
  hasher.update(newCiphertext.c2.toRawBytes());
  hasher.update(newPubkey.toRawBytes());
  hasher.update(commitROld.toRawBytes());
  hasher.update(commitSOld.toRawBytes());
  hasher.update(commitRNew.toRawBytes());
  hasher.update(commitSNew.toRawBytes());

  const hash = hasher.digest();
  return Scalar.fromBytes(hash);
}

// ============================================================================
// High-Level Operations
// ============================================================================

export class EncryptedNFT {
  /**
   * Mint: Create encrypted content and prepare minting data
   */
  static async prepareMint(content, ownerKeypair) {
    // 1. Generate master secret
    const secretScalar = Scalar.fromBytes(randomBytes(32));
    const secretPoint = RistrettoPoint.BASE.multiply(secretScalar);

    // 2. Derive AES key
    const aesKey = derive_aes_key(secretPoint);

    // 3. Encrypt content
    const contentIV = randomBytes(12);
    const encryptedContent = aes_gcm_encrypt(content, aesKey, contentIV);
    const encryptedContentBase64 = Buffer.from(encryptedContent).toString('base64');

    // 4. Create ElGamal ciphertext for owner
    const randomness = Scalar.fromBytes(randomBytes(32));
    const ciphertext = elgamal_encrypt(secretScalar, ownerKeypair.publicKey, randomness);

    // 5. Create encrypted_scalar (includes randomness for future re-encryption)
    const encryptedScalarBase64 = create_encrypted_scalar(secretScalar, randomness, aesKey);

    return {
      encrypted_content_base64: encryptedContentBase64,
      encrypted_scalar_base64: encryptedScalarBase64,
      ...ciphertext.toBase64(),
      owner_pubkey_base64: ownerKeypair.getPublicKeyBase64(),
    };
  }

  /**
   * Decrypt: Owner decrypts their NFT content
   */
  static async decryptContent(encryptedData, ownerKeypair) {
    // 1. Decrypt ElGamal ciphertext
    const ciphertext = ElGamalCiphertext.fromBase64(
      encryptedData.elgamal_ciphertext.c1_base64,
      encryptedData.elgamal_ciphertext.c2_base64
    );
    const secretPoint = elgamal_decrypt(ciphertext, ownerKeypair.privateKey);

    // 2. Derive AES key
    const aesKey = derive_aes_key(secretPoint);

    // 3. Decrypt encrypted_scalar to get master secret AND randomness
    const { secretScalar, randomness } = decrypt_encrypted_scalar(
      encryptedData.encrypted_scalar_base64,
      aesKey
    );

    // 4. Decrypt actual content
    const encryptedContent = Buffer.from(encryptedData.encrypted_content_base64, 'base64');
    const iv = encryptedContent.slice(0, 12);
    const ciphertext_data = encryptedContent.slice(12);
    const content = aes_gcm_decrypt(ciphertext_data, aesKey, iv);

    return {
      content,
      secretScalar, // Needed for re-encryption
      randomness,   // Needed for re-encryption proof
      aesKey,
    };
  }

  /**
   * Re-encrypt: Seller prepares re-encryption for buyer
   */
  static async prepareReencryption(
    encryptedData,
    sellerKeypair,
    buyerPubkeyBase64
  ) {
    // 1. Decrypt to get secret_scalar AND old randomness
    const { secretScalar, randomness: oldRandomness } = await this.decryptContent(encryptedData, sellerKeypair);

    // 2. Parse old ciphertext
    const oldCiphertext = ElGamalCiphertext.fromBase64(
      encryptedData.elgamal_ciphertext.c1_base64,
      encryptedData.elgamal_ciphertext.c2_base64
    );

    // 3. Create new ciphertext for buyer
    const buyerPubkey = RistrettoPoint.fromHex(Buffer.from(buyerPubkeyBase64, 'base64'));
    const newRandomness = Scalar.fromBytes(randomBytes(32));
    const newCiphertext = elgamal_encrypt(secretScalar, buyerPubkey, newRandomness);

    // 4. Generate proof (now we have oldRandomness!)
    const proof = prove_reencryption(
      secretScalar,
      oldCiphertext,
      sellerKeypair.publicKey,
      oldRandomness,  // ✅ Retrieved from encrypted_scalar
      newCiphertext,
      buyerPubkey,
      newRandomness
    );

    return {
      ...newCiphertext.toBase64(),
      proof,
    };
  }
}
```

---

### 4. Data Structures & Storage

#### On-Chain Storage Schema

```javascript
// Per Account
encryption_key:{account_id} → base64(32 bytes Ristretto pubkey)

// Per Token
locked-content:{token_id} → base64(encrypted content, ~30-50KB)
encrypted-scalar:{token_id} → base64(92 bytes: IV + encrypted (secret_scalar + randomness) + tag)
elgamal-ciphertext-c1:{token_id} → base64(32 bytes)
elgamal-ciphertext-c2:{token_id} → base64(32 bytes)
owner-pubkey:{token_id} → base64(32 bytes Ristretto pubkey)

// Escrow (temporary during transfer)
escrow:{token_id} → JSON({
  token_id,
  previous_owner,
  balance,
  payout: { account_id: amount, ... }
})
```

---

## Implementation Steps

### Phase 1: Rust Host Functions (Week 1)
1. Add `curve25519-dalek` dependency to `Cargo.toml`
2. Create `src/host_functions/crypto.rs`
3. Implement Ristretto operations
4. Implement `verify_reencryption_proof()`
5. Add QuickJS bindings
6. Write unit tests

### Phase 2: Contract Functions (Week 2)
1. Add encryption key registration functions
2. Modify `nft_mint` for encrypted content
3. Modify `nft_payout` for escrow
4. Implement `finalize_reencryption()`
5. Implement `cancel_transfer_and_refund()`
6. Add getter functions

### Phase 3: Client Library (Week 2-3)
1. Set up TypeScript/JavaScript library structure
2. Implement keypair generation
3. Implement ElGamal encrypt/decrypt
4. Implement AES-GCM operations
5. Implement proof generation
6. Create high-level `EncryptedNFT` class
7. Write documentation

### Phase 4: Testing (Week 3-4)
1. Write Rust unit tests for crypto operations
2. Write contract integration tests
3. Test full flow in NEAR sandbox:
   - Register encryption keys
   - Mint encrypted NFT
   - Transfer NFT
   - Finalize re-encryption
   - Decrypt content as new owner
4. Test edge cases:
   - Invalid proofs
   - Missing registration
   - Escrow cancellation
5. Gas profiling

### Phase 5: Example & Documentation (Week 4)
1. Create example web application
2. Write user documentation
3. Create developer guide
4. Security audit preparation

---

## Testing Plan

### Unit Tests (Rust)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ristretto_basepoint_mul() {
        let scalar = Scalar::random(&mut OsRng);
        let result = ristretto_basepoint_mul(scalar.as_bytes()).unwrap();
        assert_eq!(result.len(), 32);
    }

    #[test]
    fn test_verify_valid_proof() {
        // Generate keys and proof
        // Verify it passes
    }

    #[test]
    fn test_verify_invalid_proof() {
        // Generate invalid proof
        // Verify it fails
    }
}
```

### Integration Tests (JavaScript)

```javascript
describe("Encrypted NFT Flow", () => {
  test("should mint NFT with encrypted content", async () => {
    const ownerKeypair = EncryptionKeypair.generate();

    // Register key
    await contract.call("register_encryption_pubkey", {
      pubkey_base64: ownerKeypair.getPublicKeyBase64()
    });

    // Prepare mint data
    const content = Buffer.from("secret music data");
    const mintData = await EncryptedNFT.prepareMint(content, ownerKeypair);

    // Mint
    const result = await contract.call("nft_mint_with_encrypted_content", {
      token_id: "token1",
      token_owner_id: owner.accountId,
      token_metadata: {},
      ...mintData
    });

    expect(result).toBeDefined();
  });

  test("should transfer NFT with re-encryption", async () => {
    // Full transfer flow test
  });

  test("should allow buyer to cancel if seller doesn't re-encrypt", async () => {
    // Escrow cancellation test
  });
});
```

### Gas Profiling

Target gas limits:
- `register_encryption_pubkey`: < 5 TGas
- `nft_mint_with_encrypted_content`: < 50 TGas
- `verify_reencryption_proof`: < 100 TGas (critical!)
- `finalize_reencryption`: < 150 TGas

---

## Security Considerations

1. **Randomness:** All randomness must use cryptographically secure RNG
2. **Key Storage:** Private keys never transmitted or stored on-chain
3. **Proof Validation:** Contract must validate ALL proof components
4. **Escrow Safety:** Funds locked until valid proof provided
5. **Replay Prevention:** Ciphertext changes prevent proof reuse
6. **DoS Protection:** Gas limits prevent malicious proof verification spam

---

## Open Questions / TODO

1. **Gas Optimization:** Is `verify_reencryption_proof` within NEAR gas limits?
   - May need to benchmark on testnet
   - Consider batching or optimizations

2. **Key Rotation:** What if user loses their encryption key?
   - No recovery possible (by design)
   - Document this clearly

3. **Multiple Access Keys:** NEAR accounts can have multiple keys
   - Each key gets separate encryption registration
   - Document best practices

## Resolved

✅ **Randomness Storage:** Solved by storing randomness with secret_scalar in the encrypted 92-byte blob. Both values are encrypted together and passed to the next owner.

---

## Success Criteria

✅ All tests pass
✅ Gas usage within limits
✅ Full transfer flow works in sandbox
✅ Security audit completed
✅ Documentation complete
✅ Example application functional

---

**This plan is ready for implementation. Begin with Phase 1 (Rust Host Functions).**
