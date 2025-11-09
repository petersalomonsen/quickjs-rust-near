# Re-encryption Proof: Simple Explanation

## The Problem
Alice has encrypted content for herself. She sells it to Bob. How can she prove she re-encrypted it correctly for Bob **without revealing the secret content**?

## The Solution: Zero-Knowledge Proof

### What We're Proving
**"Both ciphertexts encrypt the SAME secret, but I won't tell you what the secret is!"**

---

## How It Works (Simplified)

### The Players
- **Secret**: `S` (the AES key, never revealed!)
- **Alice's keys**: Private key `a`, Public key `PK_Alice`
- **Bob's keys**: Private key `b`, Public key `PK_Bob`
- **Randomness**: `r_old` (Alice), `r_new` (Bob)

### The Ciphertexts
```
Alice's ciphertext: (C1_old, C2_old) = (r_old*G, S*G + r_old*PK_Alice)
Bob's ciphertext:   (C1_new, C2_new) = (r_new*G, S*G + r_new*PK_Bob)
```

**Notice**: Both contain `S*G`! That's what we're proving.

---

## The Proof Protocol (Interactive → Non-Interactive)

### Step 1: Seller Creates Random "Blinding Factors"
Pick random numbers: `t_r_old`, `t_r_new`, `t_s`

### Step 2: Seller Makes "Commitments" (Promises)
```
commit_r_old = t_r_old * G
commit_r_new = t_r_new * G
commit_s_old = t_s*G + t_r_old*PK_Alice
commit_s_new = t_s*G + t_r_new*PK_Bob
```

**Note**: Same `t_s` in both! This is the key to proving same secret.

### Step 3: Create Challenge (Fiat-Shamir Heuristic)
```
challenge = Hash(
    C1_old, C2_old, PK_Alice,
    C1_new, C2_new, PK_Bob,
    commit_r_old, commit_s_old,
    commit_r_new, commit_s_new
)
```

**Why hash all public data?** Makes it non-interactive and tamper-proof!

### Step 4: Seller Generates Responses
```
response_r_old = t_r_old + challenge * r_old
response_r_new = t_r_new + challenge * r_new
response_s     = t_s     + challenge * S        ← SAME for both!
```

### Step 5: Contract Verifies (4 Equations)

#### Equation 1: Check old randomness
```
response_r_old * G  ==  commit_r_old + challenge * C1_old
```

#### Equation 2: Check old secret + randomness
```
response_s*G + response_r_old*PK_Alice  ==  commit_s_old + challenge * C2_old
```

#### Equation 3: Check new randomness
```
response_r_new * G  ==  commit_r_new + challenge * C1_new
```

#### Equation 4: Check new secret + randomness (SAME SECRET!)
```
response_s*G + response_r_new*PK_Bob  ==  commit_s_new + challenge * C2_new
```

**Key insight**: Equations 2 and 4 both use `response_s`, proving the same secret `S` is in both ciphertexts!

---

## Visual Diagram

```
Seller (Alice) knows:
  ┌─────────────────────────────────────┐
  │ Secret S (never revealed!)          │
  │ Old randomness r_old                │
  │ New randomness r_new                │
  └─────────────────────────────────────┘
           │
           │ Creates proof
           ▼
  ┌─────────────────────────────────────┐
  │ Commitments (random masks):         │
  │   commit_r_old, commit_s_old        │
  │   commit_r_new, commit_s_new        │
  └─────────────────────────────────────┘
           │
           │ Hash all public data
           ▼
  ┌─────────────────────────────────────┐
  │ Challenge = Hash(everything public) │
  └─────────────────────────────────────┘
           │
           │ Mix challenge with secrets
           ▼
  ┌─────────────────────────────────────┐
  │ Responses:                          │
  │   response_r_old = t + c*r_old     │
  │   response_r_new = t + c*r_new     │
  │   response_s     = t + c*S  ◄──────┼─── SAME SECRET!
  └─────────────────────────────────────┘
           │
           │ Send to blockchain
           ▼
  ┌─────────────────────────────────────┐
  │ Contract verifies 4 equations       │
  │ All pass? ✅ Proof valid!           │
  │ Secret S never revealed! 🔒         │
  └─────────────────────────────────────┘
```

---

## Why This Works

### Zero-Knowledge Property
- The verifier (contract) never sees `S`, `r_old`, or `r_new`
- Only sees responses that are "blinded" by random values
- Can't extract secrets from the responses

### Soundness (Can't Cheat)
- If seller tries to use different secrets, equations 2 and 4 will fail
- Challenge is based on hash of all public data (can't be manipulated)
- Must know the actual secrets to create valid responses

### Completeness (Honest Seller Always Succeeds)
- If seller knows the secrets and creates proof correctly, all 4 equations verify
- The algebra always works out for honest proofs

---

## Analogy: The Locked Boxes

Imagine two locked boxes:

1. **Alice's box** locked with her key
2. **Bob's box** locked with his key

You claim both boxes contain the **same diamond**, but you won't open them.

**The proof is like:**
- You make some measurements through tiny holes
- You respond to a random challenge question
- The answers mathematically prove the boxes contain identical items
- Nobody ever sees inside the boxes! 🔒

---

## Key Takeaways

✅ **Same secret in both**: `response_s` is used in both equation 2 and 4
✅ **Different recipients**: `PK_Alice` vs `PK_Bob` in the equations
✅ **Different randomness**: `response_r_old` vs `response_r_new`
✅ **Zero-knowledge**: Secret `S` is never revealed
✅ **Non-interactive**: Uses Fiat-Shamir (hash-based challenge)
✅ **Cryptographically secure**: Based on discrete log hardness on Ristretto255

---

## Mathematical Intuition

The proof relies on **linear equations over elliptic curve points**:

```
response = random_mask + challenge * secret
```

When you multiply by `G` (the generator point):
```
response * G = random_mask*G + challenge * secret*G
```

Rearranging:
```
response * G = commitment + challenge * ciphertext_component
```

This holds if and only if the prover knows the secret! But the secret stays hidden due to the random mask.

---

## Implementation Note

This is a **Schnorr-style Sigma protocol** using:
- **Curve**: Ristretto255 (built on Curve25519)
- **Hash**: SHA-256 for Fiat-Shamir transform
- **Verified**: On-chain in Rust smart contract
- **Generated**: Client-side in JavaScript

The same `response_s` in equations 2 and 4 is the cryptographic guarantee that both ciphertexts encrypt the same secret!
