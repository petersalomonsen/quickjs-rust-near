# Quick Deployment Guide - Encrypted NFT with Web4 Viewer

This guide shows how to deploy and use the encrypted NFT contract with the built-in web4 viewer.

## 🎯 Quick Start (For wasmmusic.testnet)

The contract is already deployed! To mint an encrypted NFT:

### 1. Build the Web4 Bundle

```bash
cd examples/nft
yarn examples-nft-encrypted-web4bundle
```

### 2. Upload JavaScript (with embedded Web4 viewer)

```bash
cat > /tmp/upload_web4_js.json <<'EOF'
{
  "javascript":
EOF
cat web4_encrypted_nft/contract-bundle.js | jq -Rs . >> /tmp/upload_web4_js.json
echo '}' >> /tmp/upload_web4_js.json

near contract call-function as-transaction wasmmusic.testnet post_javascript file-args /tmp/upload_web4_js.json prepaid-gas '300.0 Tgas' attached-deposit '0 NEAR' sign-as wasmmusic.testnet network-config testnet sign-with-keychain send
```

### 3. Mint an Encrypted NFT

```bash
# Register encryption keys (only needed once per account)
near contract call-function as-transaction wasmmusic.testnet call_js_func json-args '{"function_name":"register_encryption_pubkey","pubkey_base64":"YOUR_PUBLIC_KEY_BASE64"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as YOUR_ACCOUNT.testnet network-config testnet sign-with-keychain send

# Mint the basic NFT
near contract call-function as-transaction wasmmusic.testnet nft_mint json-args '{"token_id":"my_nft_1","token_owner_id":"YOUR_ACCOUNT.testnet"}' prepaid-gas '300.0 Tgas' attached-deposit '0.015 NEAR' sign-as wasmmusic.testnet network-config testnet sign-with-keychain send

# Attach encrypted content (use helper script to generate the data)
node prepare_encrypted_nft.js
# Then run the command it outputs
```

### 4. Access the Web4 Viewer

View the encrypted NFT viewer at:
**https://near.org/wasmmusic.testnet/**

Or test it directly:
```bash
near contract call-function as-read-only wasmmusic.testnet call_js_func json-args '{"function_name":"web4_get","request":{"path":"/"}}' network-config testnet now
```

---

## 📖 Full Deployment Instructions (New Contract)

### Prerequisites

- NEAR CLI installed
- Testnet account with 10+ NEAR
- Node.js installed

### Step 1: Build the Contract

```bash
cd examples/nft
./build.sh
```

Output: `out/nft.wasm` (~1.0M)

### Step 2: Deploy WASM Contract

```bash
near contract deploy YOUR_ACCOUNT.testnet use-file out/nft.wasm without-init-call network-config testnet sign-with-keychain send
```

If you get "Balance required" error, use the faucet: https://near-faucet.io/

### Step 3: Initialize

```bash
near contract call-function as-transaction YOUR_ACCOUNT.testnet new json-args '{}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as YOUR_ACCOUNT.testnet network-config testnet sign-with-keychain send
```

### Step 4: Upload JavaScript with Web4 Viewer

```bash
# Build the web4 bundle
yarn examples-nft-encrypted-web4bundle

# Prepare upload file
cat > /tmp/upload_web4_js.json <<'EOF'
{
  "javascript":
EOF
cat web4_encrypted_nft/contract-bundle.js | jq -Rs . >> /tmp/upload_web4_js.json
echo '}' >> /tmp/upload_web4_js.json

# Upload
near contract call-function as-transaction YOUR_ACCOUNT.testnet post_javascript file-args /tmp/upload_web4_js.json prepaid-gas '300.0 Tgas' attached-deposit '0 NEAR' sign-as YOUR_ACCOUNT.testnet network-config testnet sign-with-keychain send
```

### Step 5: Verify Deployment

```bash
# Check NFT metadata
near contract call-function as-read-only YOUR_ACCOUNT.testnet call_js_func json-args '{"function_name":"nft_metadata"}' network-config testnet now

# Check web4 viewer
near contract call-function as-read-only YOUR_ACCOUNT.testnet call_js_func json-args '{"function_name":"web4_get","request":{"path":"/"}}' network-config testnet now
```

---

## 🎨 Minting Encrypted NFTs

### Option A: Using Helper Script (Recommended)

```bash
# 1. Generate encryption keypair and mint script
node mint_test_simple.js

# 2. Register your encryption key (copy public key from step 1)
near contract call-function as-transaction CONTRACT.testnet call_js_func json-args '{"function_name":"register_encryption_pubkey","pubkey_base64":"YOUR_PUBKEY"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as OWNER.testnet network-config testnet sign-with-keychain send

# 3. Mint basic NFT
near contract call-function as-transaction CONTRACT.testnet nft_mint json-args '{"token_id":"my_nft_1","token_owner_id":"OWNER.testnet"}' prepaid-gas '300.0 Tgas' attached-deposit '0.015 NEAR' sign-as CONTRACT.testnet network-config testnet sign-with-keychain send

# 4. Generate encrypted content
node prepare_encrypted_nft.js
# Follow the prompts, then run the generated command

# 5. Verify
near contract call-function as-read-only CONTRACT.testnet call_js_func json-args '{"function_name":"get_encrypted_content_data","token_id":"my_nft_1"}' network-config testnet now
```

### Option B: Encrypt a WASM File

```bash
# Encrypt and mint a WASM file
node mint_wasm_nft.js /path/to/file.wasm

# This will output a complete near CLI command to attach the encrypted WASM
```

---

## 🌐 Using the Web4 Viewer

### Access the Viewer

1. **Via NEAR Social:** https://near.org/YOUR_CONTRACT.testnet/
2. **Direct RPC Call:** See test command in Step 5 above

### Decrypt Your NFT

1. Open the web4 viewer URL
2. Enter:
   - Network: testnet
   - Contract: YOUR_CONTRACT.testnet
   - Token ID: your_nft_id
   - Private Key: (in hex format from your saved key file)
3. Click "Decrypt Content"

The viewer will:
- Fetch encrypted content from the blockchain
- Verify you own the NFT using your private key
- Decrypt content client-side (your key never leaves your browser)
- Display text content or download WASM files automatically

---

## 📋 Helper Scripts

| Script | Purpose |
|--------|---------|
| `mint_test_simple.js` | Generate encryption keypair and basic mint commands |
| `prepare_encrypted_nft.js` | Interactive script to encrypt content and generate mint command |
| `mint_wasm_nft.js` | Encrypt and mint a WASM file as encrypted NFT |
| `decrypt_with_key.js` | Decrypt NFT content using saved key file |

---

## 🔍 Testing

### Check NFT Ownership

```bash
near contract call-function as-read-only CONTRACT.testnet nft_token json-args '{"token_id":"my_nft_1"}' network-config testnet now
```

### Retrieve Encrypted Data

```bash
near contract call-function as-read-only CONTRACT.testnet call_js_func json-args '{"function_name":"get_encrypted_content_data","token_id":"my_nft_1"}' network-config testnet now
```

### Verify Encryption Key Registration

```bash
near contract call-function as-read-only CONTRACT.testnet call_js_func json-args '{"function_name":"get_encryption_pubkey","account_id":"ACCOUNT.testnet"}' network-config testnet now
```

---

## ⚠️ Troubleshooting

### "Balance required to complete the action"
- Add funds via https://near-faucet.io/
- Contract deployment needs ~0.48 NEAR for storage

### "MethodNotFound" error
- JavaScript functions must be called through `call_js_func`
- Verify JavaScript was uploaded successfully

### "Owner X has not registered encryption key"
- Both minter and recipient must register keys first
- Use `get_encryption_pubkey` to verify

### Private key format error in Web4 viewer
- Private key must be 64 hex characters (32 bytes)
- Example: `e3a1778dd97e99d410762eb4017777d01bdd5debd861e1211076952c4aff9c62`

### Web4 viewer shows "Not Found"
- Verify JavaScript was uploaded: check `nft_metadata` returns correctly
- Try accessing with `?path=/` parameter

---

## 🔐 Security Notes

1. **Private Keys**: Helper scripts generate keys NOT saved by default. Use proper key management in production.
2. **Client-Side Decryption**: The web4 viewer decrypts entirely in the browser - keys never leave your device.
3. **Zero-Knowledge Proofs**: NFT transfers use ZK proofs to verify re-encryption without revealing content.
4. **On-Chain Storage**: All encrypted data is public but useless without the private key.

---

## 🚀 Live Deployment

**Testnet Contract:** wasmmusic.testnet
**Web4 Viewer:** https://near.org/wasmmusic.testnet/
**Explorer:** https://explorer.testnet.near.org/accounts/wasmmusic.testnet

---

## 📚 Next Steps

- Transfer an NFT with encrypted content (requires ZK proof generation)
- Test the re-encryption flow during NFT transfers
- Explore revenue split mechanism with encrypted content escrow
- Integrate the viewer into your own application

For encryption architecture details, see `ENCRYPTED_CONTENT.md`.
