use curve25519_dalek::ristretto::{RistrettoPoint, CompressedRistretto};
use curve25519_dalek::scalar::Scalar;
use curve25519_dalek::constants::RISTRETTO_BASEPOINT_TABLE;
use sha2::{Sha256, Digest};

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Clone, Debug)]
pub struct Ciphertext {
    pub c1: CompressedRistretto,
    pub c2: CompressedRistretto,
}

#[derive(Clone, Debug)]
pub struct ReencryptionProof {
    pub commit_r_old: CompressedRistretto,
    pub commit_s_old: CompressedRistretto,
    pub commit_r_new: CompressedRistretto,
    pub commit_s_new: CompressedRistretto,
    pub response_s: Scalar,
    pub response_r_old: Scalar,
    pub response_r_new: Scalar,
}

// ============================================================================
// Basic Ristretto Operations
// ============================================================================

/// Multiply a scalar by a point: scalar * point
pub fn ristretto_scalar_mul(scalar_bytes: &[u8], point_bytes: &[u8]) -> Result<Vec<u8>, String> {
    if scalar_bytes.len() != 32 {
        return Err("Invalid scalar length: must be 32 bytes".to_string());
    }
    if point_bytes.len() != 32 {
        return Err("Invalid point length: must be 32 bytes".to_string());
    }

    let mut scalar_arr = [0u8; 32];
    scalar_arr.copy_from_slice(scalar_bytes);
    // curve25519-dalek 4.x returns CtOption, need to use into() and check
    let scalar_option: Option<Scalar> = Scalar::from_canonical_bytes(scalar_arr).into();
    let scalar = match scalar_option {
        Some(s) => s,
        None => return Err("Invalid scalar".to_string()),
    };

    let mut point_arr = [0u8; 32];
    point_arr.copy_from_slice(point_bytes);
    let compressed = CompressedRistretto(point_arr);
    let point = compressed.decompress()
        .ok_or("Failed to decompress point")?;

    let result: RistrettoPoint = point * scalar;
    Ok(result.compress().to_bytes().to_vec())
}

/// Add two points: point1 + point2
pub fn ristretto_point_add(point1_bytes: &[u8], point2_bytes: &[u8]) -> Result<Vec<u8>, String> {
    if point1_bytes.len() != 32 {
        return Err("Invalid point1 length: must be 32 bytes".to_string());
    }
    if point2_bytes.len() != 32 {
        return Err("Invalid point2 length: must be 32 bytes".to_string());
    }

    let mut point1_arr = [0u8; 32];
    point1_arr.copy_from_slice(point1_bytes);
    let compressed1 = CompressedRistretto(point1_arr);
    let point1 = compressed1.decompress()
        .ok_or("Failed to decompress point1")?;

    let mut point2_arr = [0u8; 32];
    point2_arr.copy_from_slice(point2_bytes);
    let compressed2 = CompressedRistretto(point2_arr);
    let point2 = compressed2.decompress()
        .ok_or("Failed to decompress point2")?;

    let result = point1 + point2;
    Ok(result.compress().to_bytes().to_vec())
}

/// Subtract two points: point1 - point2
pub fn ristretto_point_sub(point1_bytes: &[u8], point2_bytes: &[u8]) -> Result<Vec<u8>, String> {
    if point1_bytes.len() != 32 {
        return Err("Invalid point1 length: must be 32 bytes".to_string());
    }
    if point2_bytes.len() != 32 {
        return Err("Invalid point2 length: must be 32 bytes".to_string());
    }

    let mut point1_arr = [0u8; 32];
    point1_arr.copy_from_slice(point1_bytes);
    let compressed1 = CompressedRistretto(point1_arr);
    let point1 = compressed1.decompress()
        .ok_or("Failed to decompress point1")?;

    let mut point2_arr = [0u8; 32];
    point2_arr.copy_from_slice(point2_bytes);
    let compressed2 = CompressedRistretto(point2_arr);
    let point2 = compressed2.decompress()
        .ok_or("Failed to decompress point2")?;

    let result = point1 - point2;
    Ok(result.compress().to_bytes().to_vec())
}

/// Multiply scalar by basepoint: scalar * G
pub fn ristretto_basepoint_mul(scalar_bytes: &[u8]) -> Result<Vec<u8>, String> {
    if scalar_bytes.len() != 32 {
        return Err("Invalid scalar length: must be 32 bytes".to_string());
    }

    let mut scalar_arr = [0u8; 32];
    scalar_arr.copy_from_slice(scalar_bytes);
    let scalar_option: Option<Scalar> = Scalar::from_canonical_bytes(scalar_arr).into();
    let scalar = match scalar_option {
        Some(s) => s,
        None => return Err("Invalid scalar".to_string()),
    };

    let result = *&RISTRETTO_BASEPOINT_TABLE * &scalar;
    Ok(result.compress().to_bytes().to_vec())
}

// ============================================================================
// ZK Proof Verification
// ============================================================================

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
    let mut hash_arr = [0u8; 32];
    hash_arr.copy_from_slice(&hash[..]);
    Scalar::from_bytes_mod_order(hash_arr)
}

/// Verify a re-encryption proof
/// Returns true if proof is valid, false otherwise
pub fn verify_reencryption_proof(
    old_ciphertext: &Ciphertext,
    old_pubkey: &RistrettoPoint,
    new_ciphertext: &Ciphertext,
    new_pubkey: &RistrettoPoint,
    proof: &ReencryptionProof,
) -> bool {
    // Decompress commitments
    let commit_r_old = match proof.commit_r_old.decompress() {
        Some(p) => p,
        None => return false,
    };
    let commit_s_old = match proof.commit_s_old.decompress() {
        Some(p) => p,
        None => return false,
    };
    let commit_r_new = match proof.commit_r_new.decompress() {
        Some(p) => p,
        None => return false,
    };
    let commit_s_new = match proof.commit_s_new.decompress() {
        Some(p) => p,
        None => return false,
    };

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

    let c1_old = match old_ciphertext.c1.decompress() {
        Some(p) => p,
        None => return false,
    };
    let c2_old = match old_ciphertext.c2.decompress() {
        Some(p) => p,
        None => return false,
    };
    let c1_new = match new_ciphertext.c1.decompress() {
        Some(p) => p,
        None => return false,
    };
    let c2_new = match new_ciphertext.c2.decompress() {
        Some(p) => p,
        None => return false,
    };

    // Verify equation 1: response_r_old*G = commit_r_old + challenge*C1_old
    let lhs1 = *&RISTRETTO_BASEPOINT_TABLE * &proof.response_r_old;
    let rhs1 = commit_r_old + c1_old * challenge;
    if lhs1 != rhs1 {
        return false;
    }

    // Verify equation 2: response_s*G + response_r_old*PK_old = commit_s_old + challenge*C2_old
    let lhs2 = *&RISTRETTO_BASEPOINT_TABLE * &proof.response_s + old_pubkey * proof.response_r_old;
    let rhs2 = commit_s_old + c2_old * challenge;
    if lhs2 != rhs2 {
        return false;
    }

    // Verify equation 3: response_r_new*G = commit_r_new + challenge*C1_new
    let lhs3 = *&RISTRETTO_BASEPOINT_TABLE * &proof.response_r_new;
    let rhs3 = commit_r_new + c1_new * challenge;
    if lhs3 != rhs3 {
        return false;
    }

    // Verify equation 4: response_s*G + response_r_new*PK_new = commit_s_new + challenge*C2_new
    // This uses the SAME response_s, proving both ciphertexts encrypt the same secret!
    let lhs4 = *&RISTRETTO_BASEPOINT_TABLE * &proof.response_s + new_pubkey * proof.response_r_new;
    let rhs4 = commit_s_new + c2_new * challenge;
    if lhs4 != rhs4 {
        return false;
    }

    true
}

// ============================================================================
// Helper functions for base64 encoding/decoding
// ============================================================================

fn decode_base64_to_32bytes(b64: &str) -> Result<[u8; 32], String> {
    let bytes = near_sdk::base64::decode(b64).map_err(|_| "Invalid base64")?;
    if bytes.len() != 32 {
        return Err(format!("Invalid length: expected 32 bytes, got {}", bytes.len()));
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

/// Verify a re-encryption proof from base64-encoded strings
/// This is the function exposed to JavaScript
pub fn verify_reencryption_proof_base64(
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
    // Parse inputs
    let old_ciphertext = Ciphertext {
        c1: CompressedRistretto(decode_base64_to_32bytes(old_ciphertext_c1_b64)?),
        c2: CompressedRistretto(decode_base64_to_32bytes(old_ciphertext_c2_b64)?),
    };

    let old_pubkey_arr = decode_base64_to_32bytes(old_pubkey_b64)?;
    let old_pubkey = CompressedRistretto(old_pubkey_arr).decompress()
        .ok_or("Failed to decompress old_pubkey")?;

    let new_ciphertext = Ciphertext {
        c1: CompressedRistretto(decode_base64_to_32bytes(new_ciphertext_c1_b64)?),
        c2: CompressedRistretto(decode_base64_to_32bytes(new_ciphertext_c2_b64)?),
    };

    let new_pubkey_arr = decode_base64_to_32bytes(new_pubkey_b64)?;
    let new_pubkey = CompressedRistretto(new_pubkey_arr).decompress()
        .ok_or("Failed to decompress new_pubkey")?;

    // Parse scalars with proper CtOption handling
    let response_s: Option<Scalar> = Scalar::from_canonical_bytes(decode_base64_to_32bytes(proof_response_s_b64)?).into();
    let response_r_old: Option<Scalar> = Scalar::from_canonical_bytes(decode_base64_to_32bytes(proof_response_r_old_b64)?).into();
    let response_r_new: Option<Scalar> = Scalar::from_canonical_bytes(decode_base64_to_32bytes(proof_response_r_new_b64)?).into();

    let proof = ReencryptionProof {
        commit_r_old: CompressedRistretto(decode_base64_to_32bytes(proof_commit_r_old_b64)?),
        commit_s_old: CompressedRistretto(decode_base64_to_32bytes(proof_commit_s_old_b64)?),
        commit_r_new: CompressedRistretto(decode_base64_to_32bytes(proof_commit_r_new_b64)?),
        commit_s_new: CompressedRistretto(decode_base64_to_32bytes(proof_commit_s_new_b64)?),
        response_s: response_s.ok_or("Invalid response_s scalar")?,
        response_r_old: response_r_old.ok_or("Invalid response_r_old scalar")?,
        response_r_new: response_r_new.ok_or("Invalid response_r_new scalar")?,
    };

    Ok(verify_reencryption_proof(
        &old_ciphertext,
        &old_pubkey,
        &new_ciphertext,
        &new_pubkey,
        &proof,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ristretto_basepoint_mul() {
        // Test with scalar = 1 (valid canonical scalar)
        let mut scalar_bytes = [0u8; 32];
        scalar_bytes[0] = 1;
        let result = ristretto_basepoint_mul(&scalar_bytes);
        assert!(result.is_ok());
        let point_bytes = result.unwrap();
        assert_eq!(point_bytes.len(), 32);
    }

    #[test]
    fn test_ristretto_point_add() {
        // Generate two points with valid small scalars
        let mut scalar1 = [0u8; 32];
        scalar1[0] = 1;
        let mut scalar2 = [0u8; 32];
        scalar2[0] = 2;
        let point1 = ristretto_basepoint_mul(&scalar1).unwrap();
        let point2 = ristretto_basepoint_mul(&scalar2).unwrap();

        // Add them
        let result = ristretto_point_add(&point1, &point2);
        assert!(result.is_ok());
    }

    #[test]
    fn test_ristretto_point_sub() {
        // Generate two points with valid small scalars
        let mut scalar1 = [0u8; 32];
        scalar1[0] = 2;
        let mut scalar2 = [0u8; 32];
        scalar2[0] = 1;
        let point1 = ristretto_basepoint_mul(&scalar1).unwrap();
        let point2 = ristretto_basepoint_mul(&scalar2).unwrap();

        // Subtract them
        let result = ristretto_point_sub(&point1, &point2);
        assert!(result.is_ok());

        // The result should equal scalar2*G (since 2*G - 1*G = 1*G)
        let expected = ristretto_basepoint_mul(&scalar2).unwrap();
        assert_eq!(result.unwrap(), expected);
    }

    #[test]
    fn test_ristretto_scalar_mul() {
        // Generate a point (1*G)
        let mut scalar1 = [0u8; 32];
        scalar1[0] = 1;
        let point = ristretto_basepoint_mul(&scalar1).unwrap();

        // Multiply by 2
        let mut scalar2 = [0u8; 32];
        scalar2[0] = 2;
        let result = ristretto_scalar_mul(&scalar2, &point);
        assert!(result.is_ok());

        // Should equal 2 * (1*G) = 2*G
        let expected = ristretto_basepoint_mul(&scalar2).unwrap();
        assert_eq!(result.unwrap(), expected);
    }

    #[test]
    fn test_invalid_scalar_length() {
        let invalid_scalar = vec![1u8; 16]; // Wrong length
        let result = ristretto_basepoint_mul(&invalid_scalar);
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_point_length() {
        let scalar = [1u8; 32];
        let invalid_point = vec![1u8; 16]; // Wrong length
        let result = ristretto_scalar_mul(&scalar, &invalid_point);
        assert!(result.is_err());
    }
}
