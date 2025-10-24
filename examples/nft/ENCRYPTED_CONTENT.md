Encrypting NFT content, and re-encrypting on transfer
=====================================================

While NFT content is published publicly on-chain, it would also be desirable to lock content to be accessible for the owner only. This document describes the approach of encrypting such content and store it on-chain. The encryption/decryption key for the content, a symmetric key, should be encrypted with the owners public key, so that only the owner can decrypt it. Only the owner will then have access to the key for decrypting the content. This way we can have a full on-chain solution for NFTs with locked content, without relying on off-chain services.

When the NFT is transferred, the decryption key must be re-encrypted for the new owner. This should be done in the same moment as paying out to the previous owner. So the seller of the NFT, should not receive money without delivering the goods. We don't want to wait for the new owner to confirm that goods are delivered, so rather we want to be able to prove that the seller delivered the symmetric key for decrypting the content, and that it was encrypted for the new NFT owner. The NFT contract must be able to verify a proof provided by the previous owner, without being able to see the key that the new owner can use to decrypt the NFT content. The proof from the previous owner must be convnicing enough so that the contract can attest that indeed the NFT seller has re-encrypted the content decrypting key for the new owner. The previous owner can then receive the settlement, without having to wait for additional confirmation from the new owner. 

Below is a demonstration of this in Rust, which should be used as a basis for implementing it in the NFT smart contract.

The NFT smart contract should use the javascript functionality for adding this customization on top of the NFT standard features. The buyer must the provide a public key for re-encryption. When the marketplace calls `nft_transfer_payout` the funds should not be payed out to the previous owner, but to the NFT contract, but the new owner should be assigned for the NFT. When the seller re-encrypts, and calls the NFT contract to publish it, the NFT contract should, provided that the proof is valid, pay out to the previous owner.


```rust
use curve25519_dalek::ristretto::{RistrettoPoint, CompressedRistretto};
use curve25519_dalek::scalar::Scalar;
use curve25519_dalek::constants::RISTRETTO_BASEPOINT_TABLE;
use sha2::{Sha256, Digest};
use rand::rngs::OsRng;
use rand::RngCore;

// ============================================================================
// VERIFIABLE NFT RE-ENCRYPTION SYSTEM
// ============================================================================
//
// OVERVIEW:
// This system allows secure NFT transfers where:
// 1. NFT content is encrypted with an AES key
// 2. The AES key is derived from a secret stored on-chain (encrypted for current owner)
// 3. On transfer, the seller re-encrypts the secret for the buyer
// 4. A zero-knowledge proof ensures the re-encryption is correct
// 5. The smart contract verifies the proof and updates ownership
//
// KEY INNOVATION:
// The secret_scalar is encrypted with the AES key it generates and stored on-chain.
// This allows any owner to recover the secret_scalar and perform re-encryption,
// without requiring off-chain secret transmission between owners.
//
// ============================================================================
// ARCHITECTURE
// ============================================================================
//
// ON-CHAIN STATE (stored in NFT smart contract):
// {
//   current_owner: Address,
//   current_owner_pubkey: RistrettoPoint,  // Owner's public key
//   ciphertext: Ciphertext,                // ElGamal ciphertext of secret
//   encrypted_scalar: [u8; 32],            // AES-encrypted secret_scalar (never changes)
//   nonce: u64,                            // Transaction counter (prevents replay)
// }
//
// OFF-CHAIN SECRETS (known only to current owner):
// - Owner's private key (privkey)
// - secret_scalar (recovered by decrypting on-chain data)
// - AES key (derived from secret_scalar)
//
// ============================================================================
// CRYPTOGRAPHIC PRIMITIVES
// ============================================================================
//
// 1. SECRET GENERATION (at minting, off-chain by minter):
//    secret_scalar = random 256-bit scalar
//    secret_point = secret_scalar * G (where G is the generator point)
//    aes_key = Hash(secret_point.bytes)  // Used to encrypt actual NFT content
//    encrypted_scalar = AES_Encrypt(secret_scalar.bytes, aes_key)
//
// 2. ELGAMAL ENCRYPTION (encrypts secret for specific owner):
//    Input: secret_scalar, owner_pubkey, randomness
//    C1 = randomness * G
//    C2 = secret_point + randomness * owner_pubkey
//    Output: Ciphertext { C1, C2 }
//
// 3. ELGAMAL DECRYPTION (recovers secret):
//    Input: ciphertext, owner_privkey
//    secret_point = C2 - privkey * C1
//    aes_key = Hash(secret_point.bytes)
//    secret_scalar = AES_Decrypt(encrypted_scalar, aes_key)
//
// 4. ZERO-KNOWLEDGE PROOF (proves correct re-encryption):
//    Proves: old_ciphertext and new_ciphertext encrypt the SAME secret_scalar
//    Without revealing: the secret_scalar itself
//    Using: Sigma protocol with Fiat-Shamir transform
//
// ============================================================================
// NFT LIFECYCLE
// ============================================================================
//
// MINTING (off-chain generation, on-chain storage):
// 1. Minter generates secret_scalar (random)
// 2. Minter computes secret_point = secret_scalar * G
// 3. Minter derives aes_key = Hash(secret_point)
// 4. Minter encrypts NFT content with aes_key → store off-chain (IPFS, etc.)
// 5. Minter encrypts secret_scalar: encrypted_scalar = AES(secret_scalar, aes_key)
// 6. Minter creates ElGamal ciphertext for their own pubkey
// 7. Store on-chain: { owner, owner_pubkey, ciphertext, encrypted_scalar, nonce: 0 }
//
// OWNERSHIP (current owner can access NFT content):
// 1. Owner queries contract → gets { ciphertext, encrypted_scalar }
// 2. Owner decrypts: secret_point = ElGamal_Decrypt(ciphertext, privkey)
// 3. Owner derives: aes_key = Hash(secret_point)
// 4. Owner decrypts: secret_scalar = AES_Decrypt(encrypted_scalar, aes_key)
// 5. Owner can now decrypt NFT content using aes_key
//
// TRANSFER (seller re-encrypts for buyer):
// OFF-CHAIN (seller generates proof):
// 1. Seller queries contract → gets { ciphertext_old, encrypted_scalar, nonce }
// 2. Seller decrypts to recover secret_scalar (as above)
// 3. Buyer provides their pubkey_new
// 4. Seller creates ciphertext_new = ElGamal_Encrypt(secret_scalar, pubkey_new, random)
// 5. Seller generates proof = prove_reencryption(
//      secret_scalar, ciphertext_old, pubkey_old,
//      ciphertext_new, pubkey_new, nft_id, nonce
//    )
// 6. Seller submits transaction: transfer(buyer_address, pubkey_new, ciphertext_new, proof)
//
// ON-CHAIN (contract verification):
// 1. Contract checks: msg.sender == current_owner
// 2. Contract verifies: proof is valid for (ciphertext_old, ciphertext_new, nft_id, nonce)
// 3. Contract updates state:
//    - current_owner = buyer_address
//    - current_owner_pubkey = pubkey_new
//    - ciphertext = ciphertext_new
//    - encrypted_scalar (unchanged!)
//    - nonce += 1
//
// ============================================================================
// SECURITY PROPERTIES
// ============================================================================
//
// 1. CONFIDENTIALITY:
//    - NFT content encrypted with AES key derived from secret_point
//    - secret_scalar encrypted on-chain (only owner can decrypt)
//    - ElGamal ciphertext only decryptable by current owner
//
// 2. INTEGRITY:
//    - Zero-knowledge proof ensures ciphertext_new encrypts correct secret
//    - Contract verifies proof before accepting transfer
//    - encrypted_scalar never changes (same secret throughout NFT lifetime)
//
// 3. AUTHENTICITY:
//    - Only current owner can create valid re-encryption
//    - Proof binds to specific NFT (via nft_id)
//    - Nonce prevents replay attacks
//
// 4. NON-REPUDIATION:
//    - All transfers recorded on-chain
//    - Proof of correct re-encryption is publicly verifiable
//
// ============================================================================
// Data Structures
// ============================================================================

#[derive(Clone, Debug)]
pub struct Ciphertext {
    pub c1: CompressedRistretto, // r*G
    pub c2: CompressedRistretto, // M + r*PubKey (where M = secret*G)
}

#[derive(Clone, Debug)]
pub struct ReencryptionProof {
    // Commitments for old ciphertext
    pub commit_r_old: CompressedRistretto,
    pub commit_s_old: CompressedRistretto,
    // Commitments for new ciphertext
    pub commit_r_new: CompressedRistretto,
    pub commit_s_new: CompressedRistretto,
    // Responses
    pub response_s: Scalar,      // Used in both old and new
    pub response_r_old: Scalar,
    pub response_r_new: Scalar,
}

// ============================================================================
// Core Cryptographic Operations
// ============================================================================

pub fn random_scalar() -> Scalar {
    let mut bytes = [0u8; 64];
    OsRng.fill_bytes(&mut bytes);
    Scalar::from_bytes_mod_order_wide(&bytes)
}

pub fn generate_keypair() -> (Scalar, RistrettoPoint) {
    let privkey = random_scalar();
    let pubkey = RISTRETTO_BASEPOINT_TABLE * &privkey;
    (privkey, pubkey)
}

pub fn encrypt(secret_scalar: &Scalar, pubkey: &RistrettoPoint, randomness: &Scalar) -> Ciphertext {
    let secret_point = RISTRETTO_BASEPOINT_TABLE * secret_scalar; // M = s*G
    let c1 = RISTRETTO_BASEPOINT_TABLE * randomness;              // r*G
    let c2 = secret_point + (pubkey * randomness);                  // M + r*PubKey

    Ciphertext {
        c1: c1.compress(),
        c2: c2.compress(),
    }
}

pub fn decrypt(ciphertext: &Ciphertext, privkey: &Scalar) -> RistrettoPoint {
    let c1 = ciphertext.c1.decompress().unwrap();
    let c2 = ciphertext.c2.decompress().unwrap();
    c2 - (c1 * privkey) // M = C2 - privkey*C1
}

// Derive AES key from the secret point
pub fn derive_aes_key(secret_point: &RistrettoPoint) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(secret_point.compress().as_bytes());
    hasher.finalize().into()
}

// ============================================================================
// Re-encryption Proof (proves old and new ciphertexts encrypt same secret)
// ============================================================================

pub fn prove_reencryption(
    secret_scalar: &Scalar,
    old_ciphertext: &Ciphertext,
    old_pubkey: &RistrettoPoint,
    old_randomness: &Scalar,
    new_ciphertext: &Ciphertext,
    new_pubkey: &RistrettoPoint,
    new_randomness: &Scalar,
) -> ReencryptionProof {
    // Random blinding factors
    let blind_s = random_scalar();
    let blind_r_old = random_scalar();
    let blind_r_new = random_scalar();

    // Commitments for old ciphertext
    let commit_r_old = RISTRETTO_BASEPOINT_TABLE * &blind_r_old;
    let commit_s_old = RISTRETTO_BASEPOINT_TABLE * &blind_s + old_pubkey * &blind_r_old;

    // Commitments for new ciphertext (uses same blind_s!)
    let commit_r_new = RISTRETTO_BASEPOINT_TABLE * &blind_r_new;
    let commit_s_new = RISTRETTO_BASEPOINT_TABLE * &blind_s + new_pubkey * &blind_r_new;

    // Fiat-Shamir challenge
    let challenge = compute_challenge(
        old_ciphertext,
        old_pubkey,
        new_ciphertext,
        new_pubkey,
        &commit_r_old,
        &commit_s_old,
        &commit_r_new,
        &commit_s_new,
    );

    // Responses
    let resp_s = blind_s + challenge * secret_scalar;
    let resp_r_old = blind_r_old + challenge * old_randomness;
    let resp_r_new = blind_r_new + challenge * new_randomness;

    ReencryptionProof {
        commit_r_old: commit_r_old.compress(),
        commit_s_old: commit_s_old.compress(),
        commit_r_new: commit_r_new.compress(),
        commit_s_new: commit_s_new.compress(),
        response_s: resp_s,
        response_r_old: resp_r_old,
        response_r_new: resp_r_new,
    }
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

// ============================================================================
// Proof Verification (On-chain)
// ============================================================================

pub fn verify_reencryption_proof(
    old_ciphertext: &Ciphertext,
    old_pubkey: &RistrettoPoint,
    new_ciphertext: &Ciphertext,
    new_pubkey: &RistrettoPoint,
    proof: &ReencryptionProof,
) -> bool {
    // Decompress commitments
    let commit_r_old = proof.commit_r_old.decompress().unwrap();
    let commit_s_old = proof.commit_s_old.decompress().unwrap();
    let commit_r_new = proof.commit_r_new.decompress().unwrap();
    let commit_s_new = proof.commit_s_new.decompress().unwrap();

    // Recompute challenge
    let challenge = compute_challenge(
        old_ciphertext,
        old_pubkey,
        new_ciphertext,
        new_pubkey,
        &commit_r_old,
        &commit_s_old,
        &commit_r_new,
        &commit_s_new,
    );

    let c1_old = old_ciphertext.c1.decompress().unwrap();
    let c2_old = old_ciphertext.c2.decompress().unwrap();
    let c1_new = new_ciphertext.c1.decompress().unwrap();
    let c2_new = new_ciphertext.c2.decompress().unwrap();

    // Verify equation 1: response_r_old*G = commit_r_old + challenge*C1_old
    let lhs1 = RISTRETTO_BASEPOINT_TABLE * &proof.response_r_old;
    let rhs1 = commit_r_old + c1_old * challenge;
    if lhs1 != rhs1 {
        println!("  ❌ Old C1 verification failed");
        return false;
    }

    // Verify equation 2: response_s*G + response_r_old*PK_old = commit_s_old + challenge*C2_old
    let lhs2 = RISTRETTO_BASEPOINT_TABLE * &proof.response_s + old_pubkey * &proof.response_r_old;
    let rhs2 = commit_s_old + c2_old * challenge;
    if lhs2 != rhs2 {
        println!("  ❌ Old C2 verification failed");
        return false;
    }

    // Verify equation 3: response_r_new*G = commit_r_new + challenge*C1_new
    let lhs3 = RISTRETTO_BASEPOINT_TABLE * &proof.response_r_new;
    let rhs3 = commit_r_new + c1_new * challenge;
    if lhs3 != rhs3 {
        println!("  ❌ New C1 verification failed");
        return false;
    }

    // Verify equation 4: response_s*G + response_r_new*PK_new = commit_s_new + challenge*C2_new
    // This uses the SAME response_s, proving both ciphertexts encrypt the same secret!
    let lhs4 = RISTRETTO_BASEPOINT_TABLE * &proof.response_s + new_pubkey * &proof.response_r_new;
    let rhs4 = commit_s_new + c2_new * challenge;
    if lhs4 != rhs4 {
        println!("  ❌ New C2 verification failed");
        return false;
    }

    true
}

// ============================================================================
// Main Demo
// ============================================================================

fn main() {
    println!("🔐 VERIFIABLE NFT RE-ENCRYPTION SYSTEM - DEMONSTRATION");
    println!("{}", "=".repeat(80));
    println!();
    println!("This demo shows how encrypted NFT content can be transferred securely");
    println!("using ElGamal encryption and zero-knowledge proofs.");
    println!();

    // ========================================================================
    // Step 1: NFT Minting (Off-Chain Preparation)
    // ========================================================================

    println!("📝 STEP 1: NFT MINTING (Off-Chain Preparation)");
    println!("{}", "-".repeat(80));
    println!();
    println!("The minter generates cryptographic secrets that will protect the NFT content.");
    println!();

    // Generate the secret scalar (this is the master secret)
    let secret_scalar = random_scalar();
    let secret_point = RISTRETTO_BASEPOINT_TABLE * &secret_scalar;
    let aes_key = derive_aes_key(&secret_point);

    println!("  1.1 Generate master secret:");
    println!("      secret_scalar = random 256-bit scalar (NEVER leaves owner's device)");
    println!("      secret_point = secret_scalar * G");
    println!("      └─> Secret Point: {:02x?}...", &secret_point.compress().as_bytes()[..8]);
    println!();

    println!("  1.2 Derive AES key for encrypting NFT content:");
    println!("      aes_key = Hash(secret_point)");
    println!("      └─> AES Key: {:02x?}...", &aes_key[..8]);
    println!();

    // Simulate encrypting the secret_scalar with the aes_key (for on-chain storage)
    // In production: encrypted_scalar = AES_Encrypt(secret_scalar.to_bytes(), aes_key)
    // For demo purposes, we'll just show the concept
    println!("  1.3 Encrypt secret_scalar for on-chain storage:");
    println!("      encrypted_scalar = AES_Encrypt(secret_scalar.bytes, aes_key)");
    println!("      └─> This allows future owners to recover secret_scalar");
    println!("      └─> Only those who can decrypt the ElGamal ciphertext can get aes_key");
    println!();

    // Owner 1 generates keypair
    let (owner1_privkey, owner1_pubkey) = generate_keypair();
    println!("  1.4 Minter (Owner 1) generates keypair:");
    println!("      owner1_privkey = random scalar (kept secret)");
    println!("      owner1_pubkey = owner1_privkey * G");
    println!("      └─> Public Key: {:02x?}...", &owner1_pubkey.compress().as_bytes()[..8]);
    println!();

    // Encrypt secret for Owner 1
    let randomness1 = random_scalar();
    let ciphertext1 = encrypt(&secret_scalar, &owner1_pubkey, &randomness1);

    println!("  1.5 Create ElGamal ciphertext for Owner 1:");
    println!("      ciphertext1 = ElGamal_Encrypt(secret_scalar, owner1_pubkey)");
    println!("      C1 = randomness * G");
    println!("      C2 = secret_point + randomness * owner1_pubkey");
    println!();

    println!("  1.6 What gets stored ON-CHAIN:");
    println!("      {{");
    println!("        current_owner: owner1_address,");
    println!("        current_owner_pubkey: {:02x?}...,", &owner1_pubkey.compress().as_bytes()[..8]);
    println!("        ciphertext: {{ C1, C2 }},");
    println!("        encrypted_scalar: AES(secret_scalar, aes_key),  // <-- KEY INNOVATION!");
    println!("        nonce: 0");
    println!("      }}");
    println!();

    println!("  ✅ Minting complete! NFT ready for on-chain deployment.");
    println!("  ✅ NFT content encrypted with aes_key and stored off-chain (e.g., IPFS)");
    println!();

    // ========================================================================
    // Step 2: Owner 1 Accesses NFT Content
    // ========================================================================

    println!("🔓 STEP 2: OWNER 1 ACCESSES NFT CONTENT (Off-Chain)");
    println!("{}", "-".repeat(80));
    println!();
    println!("Owner 1 queries the smart contract and decrypts the on-chain data.");
    println!();

    println!("  2.1 Query contract for NFT data:");
    println!("      → Retrieves: {{ ciphertext, encrypted_scalar }}");
    println!();

    let decrypted_point1 = decrypt(&ciphertext1, &owner1_privkey);

    println!("  2.2 Decrypt ElGamal ciphertext:");
    println!("      secret_point = C2 - owner1_privkey * C1");
    println!("      └─> Recovered: {:02x?}...", &decrypted_point1.compress().as_bytes()[..8]);
    println!();

    let recovered_aes_key1 = derive_aes_key(&decrypted_point1);
    println!("  2.3 Derive AES key:");
    println!("      aes_key = Hash(secret_point)");
    println!("      └─> AES Key: {:02x?}...", &recovered_aes_key1[..8]);
    println!();

    println!("  2.4 Decrypt secret_scalar (for re-encryption capability):");
    println!("      secret_scalar = AES_Decrypt(encrypted_scalar, aes_key)");
    println!("      └─> Owner 1 can now re-encrypt for future transfers");
    println!();

    if decrypted_point1 == secret_point && recovered_aes_key1 == aes_key {
        println!("  ✅ Owner 1 successfully recovered all secrets");
        println!("  ✅ Can decrypt NFT content using aes_key");
        println!("  ✅ Can re-encrypt for future buyers using secret_scalar");
    } else {
        println!("  ❌ Decryption failed!");
    }
    println!();

    // ========================================================================
    // Step 3: NFT Transfer (Owner 1 → Owner 2)
    // ========================================================================

    println!("🔄 STEP 3: NFT TRANSFER - Owner 1 → Owner 2 (Off-Chain Preparation)");
    println!("{}", "-".repeat(80));
    println!();
    println!("Owner 1 wants to sell/transfer the NFT to Owner 2.");
    println!("This requires re-encrypting the secret for Owner 2's public key.");
    println!();

    // Owner 2 generates keypair
    let (owner2_privkey, owner2_pubkey) = generate_keypair();
    println!("  3.1 Owner 2 (buyer) generates keypair:");
    println!("      owner2_privkey = random scalar (kept secret)");
    println!("      owner2_pubkey = owner2_privkey * G");
    println!("      └─> Public Key: {:02x?}...", &owner2_pubkey.compress().as_bytes()[..8]);
    println!("      └─> Buyer shares pubkey with seller (safe to be public)");
    println!();

    // Owner 1 re-encrypts the SAME secret for Owner 2
    let randomness2 = random_scalar();
    let ciphertext2 = encrypt(&secret_scalar, &owner2_pubkey, &randomness2);

    println!("  3.2 Owner 1 (seller) re-encrypts secret for Owner 2:");
    println!("      Uses recovered secret_scalar from step 2.4");
    println!("      ciphertext2 = ElGamal_Encrypt(secret_scalar, owner2_pubkey)");
    println!("      └─> Same secret, different encryption!");
    println!();

    // Owner 1 generates proof that both ciphertexts encrypt the same secret
    println!("  3.3 Owner 1 generates zero-knowledge proof:");
    println!("      Proves: ciphertext1 and ciphertext2 encrypt SAME secret_scalar");
    println!("      Without revealing: the secret_scalar itself");
    println!();
    println!("      Proof inputs:");
    println!("      - secret_scalar (private)");
    println!("      - ciphertext1 (old, from on-chain state)");
    println!("      - owner1_pubkey (old, from on-chain state)");
    println!("      - ciphertext2 (new, for buyer)");
    println!("      - owner2_pubkey (new, buyer's key)");
    println!();

    let proof = prove_reencryption(
        &secret_scalar,
        &ciphertext1,
        &owner1_pubkey,
        &randomness1,
        &ciphertext2,
        &owner2_pubkey,
        &randomness2,
    );

    println!("  ✅ Proof generated (size: ~160 bytes = 4 points + 3 scalars)");
    println!();

    println!("  3.4 Owner 1 submits transaction to contract:");
    println!("      transfer(");
    println!("        buyer_address: owner2_address,");
    println!("        buyer_pubkey: {:02x?}...,", &owner2_pubkey.compress().as_bytes()[..8]);
    println!("        new_ciphertext: ciphertext2,");
    println!("        proof: proof");
    println!("      )");
    println!();

    // ========================================================================
    // Step 4: Smart Contract Verification
    // ========================================================================

    println!("✅ STEP 4: SMART CONTRACT VERIFICATION (On-Chain)");
    println!("{}", "-".repeat(80));
    println!();
    println!("The contract receives the transfer transaction and validates it.");
    println!();

    println!("  4.1 Contract validation steps:");
    println!();
    println!("      a) Check sender is current owner:");
    println!("         require(msg.sender == current_owner)");
    println!();
    println!("      b) Retrieve on-chain state:");
    println!("         - stored_ciphertext (must match ciphertext1 from proof)");
    println!("         - stored_pubkey (must match owner1_pubkey from proof)");
    println!("         - nonce (for replay protection)");
    println!();
    println!("      c) Verify zero-knowledge proof:");
    println!("         verify_reencryption_proof(");
    println!("           stored_ciphertext,  // Old (from on-chain state)");
    println!("           stored_pubkey,      // Old (from on-chain state)");
    println!("           new_ciphertext,     // New (from transaction)");
    println!("           new_pubkey,         // New (from transaction)");
    println!("           proof               // From transaction");
    println!("         )");
    println!();

    let is_valid = verify_reencryption_proof(
        &ciphertext1,
        &owner1_pubkey,
        &ciphertext2,
        &owner2_pubkey,
        &proof,
    );

    if is_valid {
        println!("  ✅ PROOF VALID - All verifications passed!");
        println!();
        println!("  4.2 Contract updates state:");
        println!("      {{");
        println!("        current_owner: owner2_address,           // ← Updated");
        println!("        current_owner_pubkey: owner2_pubkey,    // ← Updated");
        println!("        ciphertext: ciphertext2,                // ← Updated");
        println!("        encrypted_scalar: <unchanged>,          // ← Same!");
        println!("        nonce: nonce + 1                        // ← Incremented");
        println!("      }}");
        println!();
        println!("  ✅ Transfer complete! Ownership transferred to Owner 2.");
        println!("  ✅ Owner 2 can now decrypt and access NFT content.");
    } else {
        println!("  ❌ PROOF INVALID - Transfer rejected!");
        println!("  ❌ State unchanged, NFT remains with Owner 1.");
    }
    println!();

    // ========================================================================
    // Step 5: Owner 2 Accesses NFT Content
    // ========================================================================

    println!("🔓 STEP 5: OWNER 2 ACCESSES NFT CONTENT (Off-Chain)");
    println!("{}", "-".repeat(80));
    println!();
    println!("Owner 2 is now the owner and can access the NFT content.");
    println!("The process is IDENTICAL to Step 2, showing the system works for any owner!");
    println!();

    println!("  5.1 Query contract for NFT data:");
    println!("      → Retrieves: {{ ciphertext2, encrypted_scalar }}");
    println!();

    let decrypted_point2 = decrypt(&ciphertext2, &owner2_privkey);

    println!("  5.2 Decrypt ElGamal ciphertext:");
    println!("      secret_point = C2 - owner2_privkey * C1");
    println!("      └─> Recovered: {:02x?}...", &decrypted_point2.compress().as_bytes()[..8]);
    println!();

    let recovered_aes_key2 = derive_aes_key(&decrypted_point2);

    println!("  5.3 Derive AES key:");
    println!("      aes_key = Hash(secret_point)");
    println!("      └─> AES Key: {:02x?}...", &recovered_aes_key2[..8]);
    println!();

    println!("  5.4 Decrypt secret_scalar (for future re-encryption):");
    println!("      secret_scalar = AES_Decrypt(encrypted_scalar, aes_key)");
    println!("      └─> Owner 2 can now transfer to Owner 3!");
    println!();

    if decrypted_point2 == secret_point && recovered_aes_key2 == aes_key {
        println!("  ✅ Owner 2 successfully recovered all secrets");
        println!("  ✅ AES key MATCHES the original (same secret transferred!)");
        println!("  ✅ Can decrypt NFT content using aes_key");
        println!("  ✅ Can re-encrypt for Owner 3 using secret_scalar");
        println!();
        println!("  🎉 TRANSFER SUCCESSFUL - Owner 2 has full access!");
    } else {
        println!("  ❌ Decryption failed!");
    }
    println!();

    // ========================================================================
    // Step 6: Security Testing
    // ========================================================================

    println!("🧪 STEP 6: SECURITY TESTING - Attack Scenarios");
    println!("{}", "-".repeat(80));
    println!();
    println!("Testing that the zero-knowledge proof cannot be forged or manipulated.");
    println!();

    // Test 1: Try to prove re-encryption of different secret
    println!("\n  Test 1: Trying to prove re-encryption of different secret...");
    let wrong_secret = random_scalar();
    let wrong_randomness = random_scalar();
    let wrong_ciphertext = encrypt(&wrong_secret, &owner2_pubkey, &wrong_randomness);
    let wrong_proof = prove_reencryption(
        &wrong_secret,
        &ciphertext1,
        &owner1_pubkey,
        &randomness1,
        &wrong_ciphertext,
        &owner2_pubkey,
        &wrong_randomness,
    );

    let is_valid_wrong = verify_reencryption_proof(
        &ciphertext1,
        &owner1_pubkey,
        &wrong_ciphertext,
        &owner2_pubkey,
        &wrong_proof,
    );

    if !is_valid_wrong {
        println!("  ✅ Correctly rejected proof for different secret");
    } else {
        println!("  ❌ ERROR: Accepted proof for different secret!");
    }

    // Test 2: Try to use wrong owner public key
    println!("\n  Test 2: Trying to verify with wrong public key...");
    let (_, owner3_pubkey) = generate_keypair();
    let is_valid_wrong_key = verify_reencryption_proof(
        &ciphertext1,
        &owner1_pubkey,
        &ciphertext2,
        &owner3_pubkey,  // Wrong pubkey
        &proof,
    );

    if !is_valid_wrong_key {
        println!("  ✅ Correctly rejected proof with wrong public key");
    } else {
        println!("  ❌ ERROR: Accepted proof with wrong public key!");
    }

    println!();
    println!("{}", "=".repeat(80));
    println!("✨ DEMONSTRATION COMPLETE!");
    println!("{}", "=".repeat(80));
    println!();
    println!("SYSTEM SUMMARY:");
    println!("{}", "-".repeat(80));
    println!();
    println!("CRYPTOGRAPHIC FOUNDATION:");
    println!("  • secret_scalar: 256-bit random scalar (master secret)");
    println!("  • secret_point: secret_scalar * G (curve point)");
    println!("  • aes_key: Hash(secret_point) - used to encrypt NFT content");
    println!("  • ElGamal encryption: Allows re-encryption without decryption");
    println!();
    println!("KEY INNOVATION - encrypted_scalar:");
    println!("  • encrypted_scalar = AES_Encrypt(secret_scalar.bytes, aes_key)");
    println!("  • Stored on-chain (public but encrypted)");
    println!("  • Only current owner can decrypt it (needs aes_key from ElGamal)");
    println!("  • Enables continuous re-encryption without off-chain secrets!");
    println!();
    println!("ON-CHAIN CONTRACT STATE:");
    println!("  • current_owner: Address of NFT owner");
    println!("  • current_owner_pubkey: Owner's public key (for encryption)");
    println!("  • ciphertext: ElGamal ciphertext (changes with each transfer)");
    println!("  • encrypted_scalar: Encrypted secret (NEVER changes)");
    println!("  • nonce: Transaction counter (prevents replay attacks)");
    println!();
    println!("TRANSFER PROCESS:");
    println!("  1. Seller decrypts on-chain ciphertext → gets secret_point");
    println!("  2. Seller derives aes_key from secret_point");
    println!("  3. Seller decrypts encrypted_scalar → gets secret_scalar");
    println!("  4. Seller re-encrypts secret_scalar for buyer's pubkey");
    println!("  5. Seller generates ZK proof (proves same secret)");
    println!("  6. Contract verifies proof and updates state");
    println!("  7. Buyer can now decrypt and access NFT content");
    println!();
    println!("SECURITY GUARANTEES:");
    println!("  ✅ Confidentiality: Only owner can access NFT content");
    println!("  ✅ Integrity: Proof ensures correct re-encryption");
    println!("  ✅ Authenticity: Only current owner can transfer");
    println!("  ✅ Non-repudiation: All transfers verified on-chain");
    println!("  ✅ Replay protection: Nonce prevents proof reuse");
    println!();
    println!("IMPLEMENTATION REQUIREMENTS:");
    println!("  • Elliptic curve: Ristretto255 (curve25519)");
    println!("  • Hash function: SHA-256");
    println!("  • Symmetric encryption: AES-256-GCM (for encrypted_scalar)");
    println!("  • Zero-knowledge proof: Sigma protocol + Fiat-Shamir");
    println!();
    println!("{}", "=".repeat(80));
    println!("Ready for smart contract implementation!");
    println!("{}", "=".repeat(80));
}
```

# Question and answers

Questions & Gaps That Need Clarification

1. QuickJS Integration (CRITICAL)

The document shows Rust code, but your NFT contract uses JavaScript in QuickJS. How will this work?

- Will you expose the cryptographic primitives as native host functions to JavaScript?

Answer: yes. Like other functions are exposed from Rust to JS, additional needed functions should be exposed

- Or implement the curve operations in pure JavaScript? (likely too slow)

Answer: no, use the Rust libraries

- What's the interface between JS contract code and the crypto operations?

Answer: Host functions provided from Rust are available on the `env` object in JS. See existing examples/nft/e2e/lockedcontent.test.js for this.

2. AES Encryption Implementation

Lines 401-406 say "For demo purposes, we'll just show the concept" - but this is critical:
// In production: encrypted_scalar = AES_Encrypt(secret_scalar.to_bytes(), aes_key)
- What AES mode exactly? (GCM mentioned, but not implemented)

Answer: I don't know, I need a recommendation here

- How is the nonce/IV handled for AES-GCM?

Answer: I haven't thought about it. Is it critical when this is encrypted/decrypted off-chain? 

- Where does the AES encryption/decryption happen? (client-side or contract?)

Answer: happens off-chain ( client side )

3. Payment Flow Details (CRITICAL for NFT transfers)

Line 10 mentions a complex payment flow but it's underspecified:

"When the marketplace calls nft_transfer_payout the funds should not be payed out to the previous owner, but to the NFT contract, but the 
new owner should be assigned for the NFT."

Questions:
- How long do funds stay locked in escrow?

Answer:  `nft_transfer_payout` will returns payment instructions to the marketplace. Normally it will instruct payment to the previous owner ( the seller ), but in this case we will hold the funds in the contract until the seller re-encrypts the content access key for the new owner

- What if the seller never provides the re-encryption proof?

Answer: The seller is not the registered owner of the NFT anymore, and so does have an incentive to provide the content access key to receive the funds. I am not able to see why the seller should be interested in not providing the re-encryption proof. Note that the seller will not only provide proof, but will also submit the encrypted content access key along with it. (it will be stored on chain for the new owner to pick up)

- Can the buyer cancel and get a refund?

Answer: This might be an option if the seller never provide the proof. We can have this as a function for the buyer

- Should there be a deadline mechanism?

Answer: Not needed, it can be a manual cancellation option, but can consider this to only be activated after some time.

4. Client-Side vs. Contract Responsibilities

It's unclear where each operation happens:

| Operation           | Where?                |
|---------------------|-----------------------|
| Decrypt ciphertext  | Client (off-chain) ✓  |
| Generate ZK proof   | Client (off-chain) ✓  |
| Verify ZK proof     | Contract (on-chain) ✓ |
| AES encrypt/decrypt | Client ( off-chain )  |
| Store NFT content   | On-chain (like we do in the example for wasm-music here) ✓    |

5. Serialization Format

How will you serialize for on-chain storage?
- RistrettoPoint → 32 bytes (CompressedRistretto) ✓
- Scalar → 32 bytes ✓
- Ciphertext → 64 bytes (two points) ✓
- ReencryptionProof → ~160 bytes ✓

But what's the encoding? Base64? Hex? Borsh?

Answer: It is submitted to the smart contract as function call parameters. Likely base64 encoded for the binary content. It can be stored as binary data in the NEAR smart contract storage.

6. Gas/Performance Analysis

- What's the gas cost of verify_reencryption_proof() on NEAR?
- Is it feasible within NEAR's gas limits?
- Have you profiled the verification cost?

Answer: We need to test all of this in the near-sandbox

7. JavaScript API Design

What will the NFT contract's JavaScript interface look like?

// Example - is this the plan?
function nft_transfer_payout(receiver_id, new_pubkey, new_ciphertext, proof) {
// Hold funds in escrow
// Update owner to receiver_id
// Store re_encryption_pending state
// ...
}

function finalize_reencryption(new_ciphertext, proof) {
// Verify proof (how? call native function?)
let is_valid = host_verify_proof(old_ct, old_pk, new_ct, new_pk, proof);
if (is_valid) {
    // Pay out to previous owner
    // Update ciphertext
}
}

Answer: YES. Regarding holding funds in escrow, this is as simple as setting the return payout instructions to be for the NFT contract, and not to the buyer.

8. Factory Contract Interaction

Looking at your git status, you have factory/minimumweb4/ - how does this factory pattern work with encrypted NFTs?

Answer: Let's not worry about that. We can put those changes in another branch and forget about them for now

## Critical Questions

1. AES-GCM IV/Nonce Handling (CRITICAL - Security Issue)

Recommendation: Use AES-256-GCM with proper IV handling.

Your question: "Is it critical when this is encrypted/decrypted off-chain?"

Answer: YES, extremely critical! Even though encryption/decryption happens off-chain, you MUST handle the
IV correctly or the encryption is broken. Here's why:

Problem: The encrypted_scalar is stored on-chain as [u8; 32], but AES-GCM requires:
- 32 bytes for the ciphertext
- 12 bytes for the IV/nonce (standard GCM)
- 16 bytes for the authentication tag

Options:

Option A (Recommended): Derive IV deterministically
// Derive IV from secret_point (deterministic but unique per NFT)
let iv = &derive_aes_key(&secret_point)[0..12];
encrypted_scalar = AES_GCM_Encrypt(secret_scalar, aes_key, iv)
- Pro: Only 32 bytes stored on-chain (no extra space needed)
- Pro: Deterministic - always get same ciphertext for same input
- Con: Must use authenticated encryption (GCM tag protects against tampering)

Option B: Store IV + ciphertext + tag
encrypted_scalar = [iv(12) || ciphertext(32) || tag(16)] = 60 bytes total
- Pro: Standard approach, maximum security
- Con: Need to store 60 bytes instead of 32 bytes on-chain

Question: Which approach do you prefer?

**Answer**: 60 bytes is no problem. Should work. The requirement from my side is that content stored on-chain should be encrypted securely with the key that only owners will know about. At minting, we also call a smart contract function for uploading content, which will be encrypted with this key. The key will be encrypted and also uploaded as regular content, and re-encrypted and re-uploaded for every owner change.

2. NFT Content Storage Size

You said: "Store NFT content on-chain (like we do in the example for wasm-music here)"

Looking at the test, you're storing a .wasm file base64 encoded. This could be very large (music files,
images, videos).

Questions:
- What's the expected size range for encrypted NFT content? (KB? MB?)
- Are you aware of NEAR storage costs? (~1Ⓝ per 100KB permanently)
- Would IPFS/Arweave be more cost-effective for large content?
- Or is the plan to only encrypt the content key, and store the actual content elsewhere?

Clarification needed: When you say "encrypted NFT content", do you mean:
1. The actual content (image/video/audio) encrypted and stored on-chain? OR
2. Just the metadata or a small content key that unlocks off-chain content?

**Answer**: "WebAssembly Music" is stored on chain. The wasm binary are in the size of 30-50 kb so it is not a problem

3. Ristretto Keypair Management

Questions:
- Where do users generate/store their Ristretto (curve25519) keypair?
- Is this separate from their NEAR Ed25519 keypair?
- Does the wallet manage this? Or a separate app?
- How do users back it up?
- Can we derive the Ristretto keypair from the NEAR Ed25519 keypair?
- This would be simpler (no extra key management)
- But Ed25519 uses a different curve than Ristretto255

My recommendation: Consider using the NEAR account's Ed25519 public key converted to Curve25519 for ElGamal
encryption. This is possible because Ed25519 keys can be converted to X25519 (Curve25519) keys. This
eliminates the need for separate key management.

Question: Should we derive Ristretto keys from NEAR keys, or require separate keypairs?

**Answer**: If NEAR keys can be used then let's do that. However the receipient public key still needs to be registered with the contract, since this is the only way it could be known which key to re-encrypt for ( NEAR accounts can have different access keys ).

4. State Machine & Escrow Details

You said funds are held in escrow by setting payout to the NFT contract. We need to define the exact state
transitions:

Proposed State Machine:
// NFT extended state
{
// ... normal NFT fields ...
encrypted_content_state: null | {
    status: "pending_reencryption" | "active",
    previous_owner: "alice.near",  // who needs to re-encrypt
    escrow_balance: "1000000000000000000000000",  // yoctoNEAR
    escrow_payout: { "alice.near": "800...", "creator.near": "200..." },
    deadline: 1234567890000,  // timestamp ms (optional)
}
}

Questions:
- Should the deadline be required or optional?
- If seller doesn't re-encrypt by deadline, does escrow:
- Return to buyer automatically? OR
- Require manual buyer cancellation?
- What's a reasonable deadline? (24 hours? 7 days?)

**Answer**: Let's implement without a deadline in this first iteration.

5. Host Functions Needed

Based on the Rust crypto code, you'll need these new env functions exposed:

// Ristretto/Curve25519 operations
env.ristretto_scalar_mul(scalar_bytes, point_bytes) -> point_bytes
env.ristretto_point_add(point1_bytes, point2_bytes) -> point_bytes
env.ristretto_point_sub(point1_bytes, point2_bytes) -> point_bytes
env.ristretto_basepoint_mul(scalar_bytes) -> point_bytes
env.ristretto_compress_point(point_bytes) -> compressed_32_bytes
env.ristretto_decompress_point(compressed_bytes) -> point_bytes

// Proof verification (all-in-one for gas efficiency)
env.verify_reencryption_proof(
old_ciphertext_c1, old_ciphertext_c2,
old_pubkey,
new_ciphertext_c1, new_ciphertext_c2,
new_pubkey,
proof_commit_r_old, proof_commit_s_old,
proof_commit_r_new, proof_commit_s_new,
proof_response_s, proof_response_r_old, proof_response_r_new
) -> boolean

// AES-GCM (for client-side encrypt/decrypt of encrypted_scalar)
env.aes_gcm_encrypt(plaintext, key, iv) -> ciphertext
env.aes_gcm_decrypt(ciphertext, key, iv) -> plaintext

// Already exists
env.sha256_bytes(data) -> hash_bytes

Question: Does this list match your expectations? Any you'd like to add/remove/combine?

**Answer**: Makes sense

6. Challenge Hash Must Include NFT ID & Nonce

Looking at line 266-290 of the Rust code, the compute_challenge() function doesn't include nft_id or nonce.
This is critical for security!

Security issue: Without nft_id in the hash, an attacker could replay a valid proof from one NFT to another
NFT they don't own.

Fix needed: Update compute_challenge to:
fn compute_challenge(
    nft_id: &str,      // ← ADD THIS
    nonce: u64,        // ← ADD THIS
    old_ct: &Ciphertext,
    // ... rest
) -> Scalar {
    let mut hasher = Sha256::new();
    hasher.update(nft_id.as_bytes());           // ← ADD THIS
    hasher.update(&nonce.to_le_bytes());        // ← ADD THIS
    hasher.update(old_ct.c1.as_bytes());
    // ... rest
}

Question: Confirm you agree this is needed?

**Answer**: I don't understand how an attacker can replay anything, since proof is a one time operation. Calling the smart contract function for submitting the proof should only be possible for the previous owner. The smart contract function can check who calls this function. If the proof is valid, then everything is settled and it will not be possible for the previous owner to call this function again. Please explain to me what risk you see here.

7. Error Handling & Edge Cases

Questions:
- What if verify_reencryption_proof() fails? Show user error message? Log and return generic "transfer
failed"?
- What if deserialization of proof bytes fails (malformed base64, wrong size)?
- What if the new owner never claims their NFT / never accesses it?
- Should there be a cancel_pending_transfer() function for the new owner to return the NFT + refund before
re-encryption?

**Answer**: If verification or deserialization fails, then it should have no effect. The NFT contract should still hold the funds, and will wait for the previous owner to submit a valid proof. The new owner still owns the NFT, but is not able to decrypt the content yet.

8. Backwards Compatibility

Question: How do encrypted NFTs coexist with regular NFTs?

Suggestion: Add an optional encrypted_content field to token metadata:
{
token_id: "123",
owner_id: "alice.near",
metadata: { ... },
encrypted_content: null | {  // ← NEW: null = regular NFT
    current_owner_pubkey: "base64...",
    ciphertext_c1: "base64...",
    ciphertext_c2: "base64...",
    encrypted_scalar: "base64...",
    nonce: 0
}
}

Then nft_transfer_payout() checks: if encrypted_content !== null, use escrow flow; otherwise use normal
flow.

Question: Does this approach work for your use case?

**Answer**: As from the locked content example, this is separate logic from the standard NFT metadata features. The contract has functions for getting the content. Please study the examples

## Critical Questions and answers round 2

1. NFT ID & Nonce in Challenge Hash - Security Explanation

You asked: "I don't understand how an attacker can replay anything..."

You're right that the seller can only call the function once per transfer. However, there are two attack 
vectors that require nft_id and nonce in the challenge hash:

Attack Vector 1: Cross-NFT Replay (without nft_id)

Scenario:
- Alice owns NFT #1 and NFT #2 (both with encrypted content)
- Alice transfers NFT #1 to Bob, generating proof_1
- Contract verifies proof_1 ✓ and updates NFT #1
- Attack: Alice submits the SAME proof_1 when transferring NFT #2 to Charlie
- Without nft_id in the hash, proof_1 is mathematically valid for NFT #2 too!
- Contract accepts it, but Charlie gets the wrong encrypted key (for NFT #1's content, not #2's)

Fix: Include nft_id in the challenge hash. Now proof_1 only works for NFT #1.

**Answer**: The `nft_payout_transfer` function has already been called in this case, which sets the owner to Bob. The contract should verify that the proof is encrypted with Bobs public key

Attack Vector 2: Replay After Multiple Transfers (without nonce)

Scenario:
- Alice owns NFT #1, transfers to Bob (proof includes old ciphertext)
- Bob owns NFT #1, transfers to Charlie (new proof with new ciphertext)
- Charlie owns NFT #1, transfers to Alice (new proof)
- Attack: Alice now owns NFT #1 again. She could try to re-submit an old proof from a previous transfer
- Without nonce, an old proof might still verify if the ciphertext matches

Fix: Include nonce (incremented on each transfer) in the challenge hash. Old proofs become invalid.

Recommendation

Yes, you MUST include both nft_id and nonce in compute_challenge(). The contract will provide these values
when verifying, so the seller's off-chain proof must include them when generating the challenge.

Question: Do you agree to add nft_id and nonce to the challenge hash now?

---
2. Ed25519 to Curve25519/Ristretto Key Derivation

You said: "If NEAR keys can be used then let's do that."

Good news: Ed25519 keys CAN be converted to Curve25519 keys using a standard conversion process. However:

Important Clarifications:

1. Ed25519 → X25519 (Curve25519) conversion exists, but it's for Diffie-Hellman, not for Ristretto
2. Ristretto255 is built on top of Curve25519 but uses a different encoding
3. The conversion is one-way (public key only, private key is trickier)

Proposed Approach:

Option A (Simpler): Direct Ed25519 key conversion
- Convert NEAR Ed25519 public key → Curve25519 public key → Ristretto point
- Pro: Users don't need separate keypairs
- Con: Requires careful implementation; Ed25519 private key can't directly decrypt Ristretto ciphertext

Option B (Recommended): Derive separate Ristretto keypair deterministically
// Derive Ristretto keypair from NEAR Ed25519 keypair
let seed = sha256(near_ed25519_privkey.as_bytes() || "ristretto_derivation");
let ristretto_privkey = Scalar::from_bytes_mod_order(seed);
let ristretto_pubkey = &RISTRETTO_BASEPOINT_TABLE * &ristretto_privkey;
- Pro: Clean separation, cryptographically sound
- Con: Users need to "unlock" their Ristretto key with NEAR key (extra step)

Registration Flow

You said: "The recipient public key still needs to be registered with the contract, since NEAR accounts can
have different access keys."

Proposed:
// Contract function
export function register_encryption_key() {
const caller = env.signer_account_id();
const near_pubkey = env.signer_account_pk(); // Ed25519 public key from transaction

// Derive or convert to Ristretto
const ristretto_pubkey = env.ed25519_to_ristretto(near_pubkey);

// Store: account → ristretto public key mapping
env.storage_write(`encryption_key:${caller}`, ristretto_pubkey);
}

Question: Should we implement deterministic derivation (Option B) or direct conversion (Option A)?

**Answer**: Let's just leave it to the owners to generate random keypairs off-chain that will be used for content. Let's not  connect it to NEAR keys.

---
3. AES-GCM with IV Storage - Implementation

You confirmed: "60 bytes is no problem."

Storage Format

encrypted_scalar = [
    iv[0..12],        // 12 bytes: random IV
    ciphertext[0..32], // 32 bytes: AES-GCM encrypted secret_scalar
    tag[0..16]         // 16 bytes: GCM authentication tag
] // Total: 60 bytes

Client-Side Operations

// Off-chain: Minting
const secret_scalar = randomScalar();
const secret_point = basepoint_mul(secret_scalar);
const aes_key = sha256(secret_point);

const iv = randomBytes(12);
const { ciphertext, tag } = aes_gcm_encrypt(secret_scalar, aes_key, iv);
const encrypted_scalar = concat(iv, ciphertext, tag); // 60 bytes

// Upload to contract
await contract.post_encrypted_content({
key: `encrypted-scalar-${token_id}`,
value_base64: base64(encrypted_scalar)
});

// Off-chain: Owner decrypts
const encrypted_scalar = base64_decode(await contract.get_encrypted_scalar(token_id));
const iv = encrypted_scalar.slice(0, 12);
const ciphertext = encrypted_scalar.slice(12, 44);
const tag = encrypted_scalar.slice(44, 60);

const secret_point = elgamal_decrypt(owner_ciphertext, owner_privkey);
const aes_key = sha256(secret_point);
const secret_scalar = aes_gcm_decrypt(ciphertext, aes_key, iv, tag);

Confirmed: This approach works for your needs?

**Answer**: Yes!

---
4. Content Encryption Key Storage

You said: "The key will be encrypted and also uploaded as regular content, and re-encrypted and re-uploaded
for every owner change."

So the on-chain content storage looks like:
// Per-NFT storage
{
"locked-content-${token_id}": "base64(...encrypted NFT content...)",     // 30-50KB, encrypted with 
aes_key
"encrypted-scalar-${token_id}": "base64(...60 bytes...)",                // The encrypted secret_scalar
"elgamal-ciphertext-${token_id}": "base64(...64 bytes c1+c2...)",       // ElGamal for current owner
"owner-pubkey-${token_id}": "base64(...32 bytes...)",                    // Current owner's Ristretto 
pubkey
"nonce-${token_id}": 0                                                    // Transfer counter
}

Question: Is this the right structure? Or should we group these fields differently?

**Answer**: Yes, but do you think the nonce is needed is still needed, given the answer to question one?

---
5. Host Functions - Additional Ones Needed

Based on the client-side operations above, we also need:

// Ed25519 ↔ Ristretto conversion
env.ed25519_to_ristretto_pubkey(ed25519_pubkey_bytes) -> ristretto_pubkey_bytes
env.derive_ristretto_from_ed25519(ed25519_privkey_bytes) -> ristretto_privkey_bytes

// AES-GCM (these need to be callable client-side via WebAssembly or JS library)
// Actually, these might be better as client-side JS library operations, not host functions
// Unless you want them available in the contract JS too?

// Random number generation (for client-side proof generation)
env.random_bytes(length) -> bytes  // Or use Web Crypto API client-side

Question: Should AES-GCM be:
- A) Exposed as host functions (callable from contract JS)
- B) Client-side library only (like noble-curves or tweetnacl)

I'd recommend B (client-side only) since the contract only needs to verify proofs, not encrypt/decrypt.

**Answer**: Yes B, client-side only
