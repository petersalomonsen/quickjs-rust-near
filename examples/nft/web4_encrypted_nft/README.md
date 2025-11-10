# Encrypted NFT Marketplace

A complete encrypted NFT marketplace with zero-knowledge re-encryption proofs on NEAR.

## 🎯 Features

- **End-to-end encryption**: NFT content is encrypted with Ristretto255 elliptic curve cryptography
- **Marketplace with escrow**: List, buy, and sell encrypted NFTs with funds held in escrow
- **Zero-knowledge proofs**: Verify correct re-encryption without revealing the content
- **Browser-based credentials**: Uses Password Credentials API for secure key management
- **Web4 integration**: Hosted on-chain at `contractname.near.page`

## 🚀 Quick Start

### 1. Access the Marketplace

Navigate to your deployed contract's Web4 URL:
```
https://yourcontract.testnet.page/
```

### 2. Create Credentials

Click the **Credentials** tab and create a new wallet:
- Generates Ed25519 signing keys (for transactions)
- Generates Ristretto255 encryption keys (for NFT content)
- Stores securely in browser's password manager

### 3. Mint an Encrypted NFT

Go to the **Mint** tab:
1. Select credentials from password manager
2. Enter token ID and content (text or file)
3. Mint - content is encrypted and stored on-chain

### 4. List for Sale

Go to the **List for Sale** tab:
1. Enter token ID and price
2. List - NFT appears on marketplace

### 5. Buy an NFT

Go to the **Buy** tab:
1. Create buyer credentials (separate wallet)
2. Enter token ID
3. Buy - funds locked in escrow

### 6. Complete Sale (Re-encryption)

Seller goes to **Complete Sale** tab:
1. Enter token ID
2. Complete - generates ZK proof and re-encrypts for buyer
3. Funds released from escrow to seller

### 7. View NFT Content

Go to **View NFT** tab:
1. Select credentials (must be owner)
2. Enter token ID
3. View - decrypt and display content

## 🔐 How It Works

### Encryption Architecture

```
Content (plaintext)
    ↓
[AES-256-GCM encryption with secret key S]
    ↓
Encrypted Content (stored on-chain)

Secret key S
    ↓
[ElGamal encryption with owner's public key]
    ↓
Ciphertext (C1, C2) stored on-chain
```

### Re-encryption Process

When Alice sells to Bob:

1. **Alice encrypts content** with secret `S` → stores `Enc(content)`
2. **Alice encrypts `S` for herself** → stores `ElGamal(S, PK_Alice)`
3. **Bob buys** → funds go to escrow
4. **Alice re-encrypts `S` for Bob**:
   - Decrypts old ciphertext to recover `S`
   - Encrypts `S` with Bob's public key → `ElGamal(S, PK_Bob)`
   - Generates ZK proof that both ciphertexts encrypt the same `S`
5. **Contract verifies proof** → releases funds to Alice
6. **Bob can now decrypt** using his private key

### Zero-Knowledge Proof

The proof demonstrates:
> **"Old and new ciphertexts encrypt the SAME secret, but I won't tell you what it is!"**

**What's proven:**
- `C2_old - C2_new = PK_old * r_old - PK_new * r_new` (public equation)
- Alice knows the secret `S` and randomness values
- But `S` is never revealed!

**How it works:**
1. **Commitment phase**: Alice generates random blinding factors and commits to them
2. **Challenge phase**: Hash all public data to create a challenge
3. **Response phase**: Alice computes responses using her secrets and blinding factors
4. **Verification**: Contract checks the proof equation without learning the secret

This is a **Sigma protocol** - a standard zero-knowledge proof technique.

## 📦 Deployment

### Build and Deploy

```bash
# Build the NFT contract
cd examples/nft
cargo near build

# Deploy contract
near deploy <your-account.testnet> out/nft.wasm

# Initialize NFT contract
near call <your-account.testnet> new '{}' --accountId <your-account.testnet>

# Build marketplace bundle (includes HTML viewer)
cd web4_encrypted_nft
node build.js

# Upload JavaScript with embedded marketplace
near call <your-account.testnet> post_javascript \
  "$(cat contract-bundle.js | jq -Rs '{javascript: .}')" \
  --accountId <your-account.testnet> \
  --gas 300000000000000
```

### Access via Web4

Your marketplace is now live at:
```
https://<your-account>.testnet.page/
```

## 🧪 Testing

### Run Playwright Tests (UI)

Full browser-based test with credential management:

```bash
npx playwright test playwright-tests/marketplace.spec.js
```

Tests:
- Credential creation and selection
- Minting encrypted NFTs
- Listing for sale
- Buying with escrow
- Re-encryption and ZK proof verification
- Ownership transfer
- Content decryption after transfer

### Run Node.js Tests (Contract)

Pure contract test without browser:

```bash
node ../e2e/encrypted-nft-marketplace.test.js
```

Tests the same flow but with direct contract calls and Node.js cryptography.

## 📝 Contract Functions

### Marketplace Functions

- `list_for_sale(token_id, price)` - List NFT for sale
- `get_listing(token_id)` - Get listing details
- `buy(token_id, buyer_pubkey_base64)` - Purchase NFT (creates escrow)
- `get_escrow(token_id)` - Get escrow details
- `complete_sale(token_id, elgamal_ciphertext_c1_base64, elgamal_ciphertext_c2_base64, buyer_pubkey_base64, proof_*)` - Complete sale with ZK proof
- `cancel_purchase(token_id)` - Cancel purchase and refund buyer

### Content Functions

- `get_encrypted_content_data(token_id)` - Get encrypted content and ciphertext
- `nft_mint(token_id, token_owner_id, encrypted_content_base64, encrypted_scalar_base64, elgamal_ciphertext_c1_base64, elgamal_ciphertext_c2_base64, owner_pubkey_base64)` - Mint encrypted NFT

### Standard NFT Functions

- `nft_token(token_id)` - Get token metadata
- `nft_tokens_for_owner(account_id)` - List tokens owned by account
- `nft_metadata()` - Get contract metadata

## 🔧 Technical Details

### Cryptography Stack

- **Content encryption**: AES-256-GCM (symmetric)
- **Key encryption**: ElGamal on Ristretto255 curve (asymmetric)
- **Zero-knowledge proofs**: Sigma protocol with Fiat-Shamir heuristic
- **Signing**: Ed25519 for NEAR transactions

### Dependencies

- `@noble/curves` - Ristretto255 elliptic curve operations
- `near-api-js` - NEAR blockchain interaction
- `@near-js/*` - NEAR RPC and transaction utilities

### Browser Storage

Credentials are stored using the **Password Credentials API**:
- Private keys never leave the browser
- Isolated per-origin security
- Native browser password manager integration
- No server-side key storage

### Data Storage (On-Chain)

Per NFT token:
- `encrypted_content_base64` - AES-encrypted content
- `encrypted_scalar_base64` - AES-encrypted secret+randomness
- `elgamal_ciphertext_c1_base64` - ElGamal C1 component
- `elgamal_ciphertext_c2_base64` - ElGamal C2 component
- `owner_pubkey_base64` - Current owner's public key

Per listing:
- `seller` - Account selling the NFT
- `price` - Sale price in yoctoNEAR
- `listed_at` - Timestamp

Per escrow:
- `buyer` - Account buying the NFT
- `seller` - Account selling the NFT
- `buyer_pubkey` - Buyer's encryption public key
- `price` - Escrowed amount

## 📚 Further Reading

- [NEP-171: NFT Standard](https://nomicon.io/Standards/Tokens/NonFungibleToken/Core)
- [NEP-199: NFT Payouts](https://nomicon.io/Standards/Tokens/NonFungibleToken/Payout)
- [Web4 Protocol](https://github.com/vgrichina/web4)
- [Ristretto255](https://ristretto.group/)
- [Sigma Protocols](https://en.wikipedia.org/wiki/Proof_of_knowledge#Sigma_protocols)

## 🎥 Demo Video

The Playwright tests generate video recordings showing the full marketplace flow with the interactive credential picker UI.

## 🐛 Known Issues

- Requires HTTPS for Web Crypto API (use `.near.page` or `.testnet.page`)
- Browser must support Password Credentials API
- Large files (>100KB) may need storage deposit adjustments

## 📄 License

MIT
