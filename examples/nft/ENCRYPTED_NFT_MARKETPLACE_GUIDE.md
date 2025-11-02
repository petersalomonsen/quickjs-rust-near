# Encrypted NFT Marketplace Guide

Complete guide for minting, selling, and buying encrypted NFTs with zero-knowledge re-encryption proofs on NEAR testnet.

## Prerequisites

- Node.js v22+ installed
- NEAR CLI installed (`npm install -g near-cli`)
- Two NEAR testnet accounts with credentials:
  - **Seller account** (e.g., `apsolomo.testnet`)
  - **Buyer account** (e.g., `psalomo.testnet`)
- Access keys stored in `~/.near-credentials/testnet/`

## Overview

The encrypted NFT marketplace allows:
1. Minting NFTs with encrypted content
2. Listing encrypted NFTs for sale
3. Purchasing with escrow-based payment
4. Zero-knowledge proof verification of re-encryption
5. Secure content transfer without revealing secrets

## Part 1: Deploy Contract

### 1.1 Build and Deploy the Contract

```bash
cd examples/nft/web4_encrypted_nft

# Build the contract bundle
node build.js

# Deploy to testnet (replace wasmmusic.testnet with your contract account)
near contract call-function as-transaction wasmmusic.testnet update_js_contract \
  file-args contract-bundle.js \
  prepaid-gas '300.0 Tgas' \
  attached-deposit '0 NEAR' \
  sign-as wasmmusic.testnet \
  network-config testnet \
  sign-with-keychain \
  send
```

## Part 2: Mint an Encrypted NFT

### 2.1 Create Minting Script

Create `mint_encrypted_nft.js`:

```javascript
import { RistrettoPoint } from '@noble/curves/ed25519';
import crypto from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';

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
  let value = scalar;
  for (let i = 0; i < 32; i++) {
    buffer[i] = Number(value & 0xFFn);
    value = value >> 8n;
  }
  return buffer;
}

// Configuration
const OWNER_ACCOUNT = "apsolomo.testnet";
const OWNER_PRIVATE_KEY_HEX = "e3a1778dd97e99d410762eb4017777d01bdd5debd861e1211076952c4aff9c62";
const NFT_CONTENT = `In circuits deep where shadows play,
A whisper locked in cryptic sway,
Through curves and points the secrets flow,
Where only chosen keys may go.

On chains of trust the token rests,
Encrypted dreams in digital nests,
A proof of ownership, sealed and true,
Beyond the veil, for only you.`;

const TOKEN_ID = `encrypted_nft_${Date.now()}`;

console.log('🎨 Minting Encrypted NFT');
console.log('========================\n');
console.log('Token ID:', TOKEN_ID);
console.log('Owner:', OWNER_ACCOUNT);
console.log('\n');

// 1. Generate owner's keypair
const ownerPrivateScalar = bufferToScalar(Buffer.from(OWNER_PRIVATE_KEY_HEX, 'hex'));
const ownerPublicKey = RistrettoPoint.BASE.multiply(ownerPrivateScalar);
const ownerPublicKeyBytes = Buffer.from(ownerPublicKey.toRawBytes());

console.log('🔑 Owner public key:', ownerPublicKeyBytes.toString('base64'));
console.log('');

// 2. Generate random secret scalar (the encryption key)
const secretScalar = crypto.randomBytes(32);
const secretScalarBigInt = bufferToScalar(secretScalar);
const secretPoint = RistrettoPoint.BASE.multiply(secretScalarBigInt);

// 3. Generate random ElGamal randomness
const randomness = crypto.randomBytes(32);
const randomnessScalar = bufferToScalar(randomness);

// 4. Create ElGamal encryption: (r*G, r*PK + S)
const c1 = RistrettoPoint.BASE.multiply(randomnessScalar);
const c2 = ownerPublicKey.multiply(randomnessScalar).add(secretPoint);

const c1Bytes = Buffer.from(c1.toRawBytes());
const c2Bytes = Buffer.from(c2.toRawBytes());

console.log('📦 ElGamal ciphertext created');
console.log('');

// 5. Derive AES key from secret point
const aesKey = crypto.createHash('sha256').update(Buffer.from(secretPoint.toRawBytes())).digest();

// 6. Encrypt the content with AES-256-GCM
const contentIv = crypto.randomBytes(12);
const contentCipher = crypto.createCipheriv('aes-256-gcm', aesKey, contentIv);
const encryptedContent = Buffer.concat([
  contentCipher.update(Buffer.from(NFT_CONTENT, 'utf8')),
  contentCipher.final(),
]);
const contentTag = contentCipher.getAuthTag();
const encryptedContentBlob = Buffer.concat([contentIv, encryptedContent, contentTag]);

console.log('🔐 Content encrypted (', encryptedContentBlob.length, 'bytes)');
console.log('');

// 7. Encrypt secret_scalar + randomness together (92-byte format)
const scalarAndRandomness = Buffer.concat([secretScalar, randomness]);
const scalarIv = crypto.randomBytes(12);
const scalarCipher = crypto.createCipheriv('aes-256-gcm', aesKey, scalarIv);
const encryptedScalar = Buffer.concat([
  scalarCipher.update(scalarAndRandomness),
  scalarCipher.final(),
]);
const scalarTag = scalarCipher.getAuthTag();
const encryptedScalarBlob = Buffer.concat([scalarIv, encryptedScalar, scalarTag]);

console.log('🔐 Secret scalar + randomness encrypted (', encryptedScalarBlob.length, 'bytes)');
console.log('');

// 8. Save mint arguments to file
const mintArgs = {
  token_id: TOKEN_ID,
  token_owner_id: OWNER_ACCOUNT,
  encrypted_content_base64: encryptedContentBlob.toString('base64'),
  encrypted_scalar_base64: encryptedScalarBlob.toString('base64'),
  elgamal_ciphertext_c1_base64: c1Bytes.toString('base64'),
  elgamal_ciphertext_c2_base64: c2Bytes.toString('base64'),
  owner_pubkey_base64: ownerPublicKeyBytes.toString('base64'),
};

const filename = `${TOKEN_ID}_mint_args.json`;
fs.writeFileSync(filename, JSON.stringify(mintArgs, null, 2));
console.log('💾 Mint arguments saved to:', filename);
console.log('');

// 9. Save crypto data for later use
const cryptoData = {
  token_id: TOKEN_ID,
  secret_scalar_hex: secretScalar.toString('hex'),
  randomness_hex: randomness.toString('hex'),
  owner_private_key_hex: OWNER_PRIVATE_KEY_HEX,
  owner_public_key_base64: ownerPublicKeyBytes.toString('base64'),
};

const cryptoFilename = `${TOKEN_ID}_crypto_data.json`;
fs.writeFileSync(cryptoFilename, JSON.stringify(cryptoData, null, 2));
console.log('🔐 Crypto data saved to:', cryptoFilename);
console.log('⚠️  Keep this file SECRET!');
console.log('');

console.log('📤 Minting NFT on testnet...');
console.log('');

// 10. Call nft_mint to register the token
try {
  const result = execSync(
    `near contract call-function as-transaction wasmmusic.testnet nft_mint ` +
    `json-args '${JSON.stringify(mintArgs)}' ` +
    `prepaid-gas '100.0 Tgas' ` +
    `attached-deposit '0.012 NEAR' ` +
    `sign-as ${OWNER_ACCOUNT} ` +
    `network-config testnet ` +
    `sign-with-access-key-file ~/.near-credentials/testnet/${OWNER_ACCOUNT}.json ` +
    `send`,
    { encoding: 'utf8' }
  );

  console.log(result);
  console.log('');
  console.log('✅ NFT minted successfully!');
  console.log('🎉 Token ID:', TOKEN_ID);
} catch (error) {
  console.error('❌ Minting failed:', error.message);
  process.exit(1);
}
```

### 2.2 Run Minting Script

```bash
cd examples/nft
node mint_encrypted_nft.js
```

**Output**: You'll get a token ID like `encrypted_nft_1762100792700` and two files:
- `encrypted_nft_1762100792700_mint_args.json` - Mint arguments
- `encrypted_nft_1762100792700_crypto_data.json` - Secret data (keep secure!)

## Part 3: List NFT for Sale

### 3.1 List for Sale

```bash
# List NFT for 2 NEAR
near contract call-function as-transaction wasmmusic.testnet call_js_func_mut \
  json-args '{
    "function_name": "list_for_sale",
    "token_id": "encrypted_nft_1762100792700",
    "price": "2000000000000000000000000"
  }' \
  prepaid-gas '100.0 Tgas' \
  attached-deposit '0.001 NEAR' \
  sign-as apsolomo.testnet \
  network-config testnet \
  sign-with-access-key-file ~/.near-credentials/testnet/apsolomo.testnet.json \
  send
```

### 3.2 Verify Listing

```bash
near contract call-function as-read-only wasmmusic.testnet call_js_func \
  json-args '{
    "function_name": "get_listing",
    "token_id": "encrypted_nft_1762100792700"
  }' \
  network-config testnet \
  now
```

## Part 4: Generate Buyer Keypair

### 4.1 Create Keypair Generation Script

The buyer needs a Ristretto255 keypair. Create `generate_keypair.js`:

```javascript
import { RistrettoPoint } from '@noble/curves/ed25519';
import crypto from 'crypto';
import fs from 'fs';

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
  let value = scalar;
  for (let i = 0; i < 32; i++) {
    buffer[i] = Number(value & 0xFFn);
    value = value >> 8n;
  }
  return buffer;
}

const ACCOUNT_ID = process.argv[2] || 'buyer.testnet';

const privateScalar = bufferToScalar(crypto.randomBytes(32));
const privateScalarBytes = scalarToBuffer(privateScalar);
const publicKey = RistrettoPoint.BASE.multiply(privateScalar);
const publicKeyBytes = publicKey.toRawBytes();

const keypair = {
  account_id: ACCOUNT_ID,
  private_scalar_base64: privateScalarBytes.toString('base64'),
  private_scalar_hex: privateScalarBytes.toString('hex'),
  public_key_base64: Buffer.from(publicKeyBytes).toString('base64'),
  public_key_hex: Buffer.from(publicKeyBytes).toString('hex'),
  generated_at: new Date().toISOString()
};

const filename = `${ACCOUNT_ID.replace('.testnet', '')}_keypair.json`;
fs.writeFileSync(filename, JSON.stringify(keypair, null, 2));

console.log('Keypair generated for', ACCOUNT_ID);
console.log('');
console.log('Private Scalar (hex):');
console.log(keypair.private_scalar_hex);
console.log('');
console.log('Public Key (base64):');
console.log(keypair.public_key_base64);
console.log('');
console.log('⚠️  Keep the private scalar SECRET and secure!');
console.log('✅ Share only the public key when buying NFTs.');
console.log('');
console.log('💾 Keypair saved to:', filename);
```

### 4.2 Generate Keypair

```bash
node generate_keypair.js psalomo.testnet
```

**Output**: Creates `psalomo_keypair.json` with the buyer's keypair.

## Part 5: Purchase NFT

### 5.1 Buy NFT

```bash
# Get buyer's public key from keypair file
BUYER_PUBKEY=$(cat psalomo_keypair.json | jq -r '.public_key_base64')

# Purchase NFT (2 NEAR goes into escrow)
near contract call-function as-transaction wasmmusic.testnet call_js_func_mut \
  json-args "{
    \"function_name\": \"buy\",
    \"token_id\": \"encrypted_nft_1762100792700\",
    \"buyer_pubkey_base64\": \"$BUYER_PUBKEY\"
  }" \
  prepaid-gas '100.0 Tgas' \
  attached-deposit '2 NEAR' \
  sign-as psalomo.testnet \
  network-config testnet \
  sign-with-access-key-file ~/.near-credentials/testnet/psalomo.testnet.json \
  send
```

### 5.2 Verify Escrow

```bash
near contract call-function as-read-only wasmmusic.testnet call_js_func \
  json-args '{
    "function_name": "get_escrow",
    "token_id": "encrypted_nft_1762100792700"
  }' \
  network-config testnet \
  now
```

**Expected output**: Shows buyer, seller, price, and buyer_pubkey

## Part 6: Complete Sale (Re-encryption with ZK Proof)

### 6.1 Create Sale Completion Script

Create `complete_sale.js`:

```javascript
import { RistrettoPoint } from '@noble/curves/ed25519';
import crypto from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';

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
  let value = scalar;
  for (let i = 0; i < 32; i++) {
    buffer[i] = Number(value & 0xFFn);
    value = value >> 8n;
  }
  return buffer;
}

// Read token ID and owner info from command line or files
const TOKEN_ID = process.argv[2] || "encrypted_nft_1762100792700";
const CRYPTO_DATA_FILE = process.argv[3] || `${TOKEN_ID}_crypto_data.json`;
const SELLER_ACCOUNT = process.argv[4] || "apsolomo.testnet";

console.log('🔄 Completing sale for:', TOKEN_ID);
console.log('');

// Load crypto data
const cryptoData = JSON.parse(fs.readFileSync(CRYPTO_DATA_FILE, 'utf8'));
const OWNER_PRIVATE_KEY_HEX = cryptoData.owner_private_key_hex;

// Get escrow data
console.log('📥 Fetching escrow data...');
const escrowDataJson = execSync(
  `near contract call-function as-read-only wasmmusic.testnet call_js_func json-args '{"function_name":"get_escrow","token_id":"${TOKEN_ID}"}' network-config testnet now`,
  { encoding: 'utf8' }
);
const escrowData = JSON.parse(escrowDataJson);
console.log('✅ Escrow data retrieved');
console.log('   Buyer:', escrowData.buyer);
console.log('   Price:', escrowData.price);
console.log('');

// Get encrypted content data
console.log('📥 Fetching encrypted content data...');
const contentDataJson = execSync(
  `near contract call-function as-read-only wasmmusic.testnet call_js_func json-args '{"function_name":"get_encrypted_content_data","token_id":"${TOKEN_ID}"}' network-config testnet now`,
  { encoding: 'utf8' }
);
const contentData = JSON.parse(contentDataJson);
console.log('✅ Retrieved encrypted content data');
console.log('');

// Decrypt ElGamal to recover secret point
console.log('🔓 Decrypting ElGamal ciphertext...');
const ownerPrivateScalar = bufferToScalar(Buffer.from(OWNER_PRIVATE_KEY_HEX, 'hex'));
const c1Bytes = Buffer.from(contentData.elgamal_ciphertext.c1_base64, 'base64');
const c2Bytes = Buffer.from(contentData.elgamal_ciphertext.c2_base64, 'base64');

const c1Point = RistrettoPoint.fromHex(c1Bytes);
const c2Point = RistrettoPoint.fromHex(c2Bytes);

const sharedSecret = c1Point.multiply(ownerPrivateScalar);
const secretPoint = c2Point.subtract(sharedSecret);
const secretPointBytes = Buffer.from(secretPoint.toRawBytes());
console.log('✅ Recovered secret point');
console.log('');

// Derive AES key
const aesKey = crypto.createHash('sha256').update(secretPointBytes).digest();

// Decrypt encrypted_scalar to get secret_scalar + randomness
console.log('🔓 Decrypting encrypted_scalar...');
const encryptedScalarBuffer = Buffer.from(contentData.encrypted_scalar_base64, 'base64');
const iv = encryptedScalarBuffer.subarray(0, 12);
const tag = encryptedScalarBuffer.subarray(-16);
const ciphertext = encryptedScalarBuffer.subarray(12, -16);

const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
decipher.setAuthTag(tag);
const decryptedData = Buffer.concat([
  decipher.update(ciphertext),
  decipher.final(),
]);

const secretScalar = decryptedData.subarray(0, 32);
const randomness = decryptedData.subarray(32, 64);
console.log('✅ Recovered secret_scalar and randomness');
console.log('');

// Generate re-encryption for buyer
console.log('🔄 Generating re-encryption for buyer...');
const buyerPubkeyBytes = Buffer.from(escrowData.buyer_pubkey, 'base64');
const buyerPublicKey = RistrettoPoint.fromHex(buyerPubkeyBytes);
const randomnessScalar = bufferToScalar(randomness);

const c1New = RistrettoPoint.BASE.multiply(randomnessScalar);
const c2New = buyerPublicKey.multiply(randomnessScalar).add(secretPoint);

const c1NewBytes = Buffer.from(c1New.toRawBytes());
const c2NewBytes = Buffer.from(c2New.toRawBytes());
console.log('✅ Re-encryption completed');
console.log('');

// Generate zero-knowledge proof
console.log('🔐 Generating zero-knowledge proof...');

const ownerPubkeyBytes = Buffer.from(contentData.owner_pubkey_base64, 'base64');
const ownerPublicKey = RistrettoPoint.fromHex(ownerPubkeyBytes);
const secretScalarBigInt = bufferToScalar(secretScalar);

const r_old = randomnessScalar;
const r_new = randomnessScalar;
const m = secretScalarBigInt;

// Generate random blinding factors
const t_r_old = bufferToScalar(crypto.randomBytes(32));
const t_r_new = bufferToScalar(crypto.randomBytes(32));
const t_s = bufferToScalar(crypto.randomBytes(32));

// Compute commitments
const commit_r_old = RistrettoPoint.BASE.multiply(t_r_old);
const commit_r_new = RistrettoPoint.BASE.multiply(t_r_new);
const commit_s_old = RistrettoPoint.BASE.multiply(t_s).add(ownerPublicKey.multiply(t_r_old));
const commit_s_new = RistrettoPoint.BASE.multiply(t_s).add(buyerPublicKey.multiply(t_r_new));

// Compute challenge hash
const challengeHash = crypto.createHash('sha256')
  .update(c1Bytes)
  .update(c2Bytes)
  .update(ownerPubkeyBytes)
  .update(c1NewBytes)
  .update(c2NewBytes)
  .update(buyerPubkeyBytes)
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

console.log('✅ Zero-knowledge proof generated');
console.log('');

// Prepare complete_sale arguments
const completeSaleArgs = {
  function_name: 'complete_sale',
  token_id: TOKEN_ID,
  elgamal_ciphertext_c1_base64: c1NewBytes.toString('base64'),
  elgamal_ciphertext_c2_base64: c2NewBytes.toString('base64'),
  buyer_pubkey_base64: escrowData.buyer_pubkey,
  proof_commit_r_old: Buffer.from(commit_r_old.toRawBytes()).toString('base64'),
  proof_commit_s_old: Buffer.from(commit_s_old.toRawBytes()).toString('base64'),
  proof_commit_r_new: Buffer.from(commit_r_new.toRawBytes()).toString('base64'),
  proof_commit_s_new: Buffer.from(commit_s_new.toRawBytes()).toString('base64'),
  proof_response_s: scalarToBuffer(response_s).toString('base64'),
  proof_response_r_old: scalarToBuffer(response_r_old).toString('base64'),
  proof_response_r_new: scalarToBuffer(response_r_new).toString('base64'),
};

console.log('📤 Calling complete_sale...');
console.log('');

// Call complete_sale
const result = execSync(
  `near contract call-function as-transaction wasmmusic.testnet call_js_func_mut ` +
  `json-args '${JSON.stringify(completeSaleArgs)}' ` +
  `prepaid-gas '100.0 Tgas' ` +
  `attached-deposit '0 NEAR' ` +
  `sign-as ${SELLER_ACCOUNT} ` +
  `network-config testnet ` +
  `sign-with-access-key-file ~/.near-credentials/testnet/${SELLER_ACCOUNT}.json ` +
  `send`,
  { encoding: 'utf8' }
);

console.log(result);
console.log('');
console.log('✅ Sale completed!');
console.log('🎉 NFT transferred to buyer with re-encrypted content');
console.log('💰 Escrow released to seller');
```

### 6.2 Complete the Sale

```bash
node complete_sale.js encrypted_nft_1762100792700
```

**What happens**:
1. Seller retrieves encrypted content and randomness from contract
2. Decrypts using their private key
3. Re-encrypts for buyer's public key
4. Generates zero-knowledge proof proving correct re-encryption
5. Contract verifies proof
6. NFT ownership transfers to buyer
7. Escrow (2 NEAR) released to seller

## Part 7: Verify Buyer Can Decrypt

### 7.1 Create Verification Script

Create `verify_decryption.js`:

```javascript
import { RistrettoPoint } from '@noble/curves/ed25519';
import crypto from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';

const CURVE_ORDER = 2n ** 252n + 27742317777372353535851937790883648493n;

function bufferToScalar(buffer) {
  let value = 0n;
  for (let i = buffer.length - 1; i >= 0; i--) {
    value = (value << 8n) | BigInt(buffer[i]);
  }
  value = value % CURVE_ORDER;
  return value === 0n ? 1n : value;
}

const TOKEN_ID = process.argv[2] || "encrypted_nft_1762100792700";
const KEYPAIR_FILE = process.argv[3] || "psalomo_keypair.json";

console.log('🔐 Verifying buyer can decrypt NFT');
console.log('Token ID:', TOKEN_ID);
console.log('');

// Load buyer's keypair
const keypairData = fs.readFileSync(KEYPAIR_FILE, 'utf8');
const keypair = JSON.parse(keypairData);
const privateScalarBigInt = bufferToScalar(Buffer.from(keypair.private_scalar_hex, 'hex'));

// Get encrypted content data
console.log('📥 Fetching encrypted content data...');
const contentDataJson = execSync(
  `near contract call-function as-read-only wasmmusic.testnet call_js_func json-args '{"function_name":"get_encrypted_content_data","token_id":"${TOKEN_ID}"}' network-config testnet now`,
  { encoding: 'utf8' }
);

const contentData = JSON.parse(contentDataJson);
console.log('✅ Retrieved encrypted content data');
console.log('   Owner public key:', contentData.owner_pubkey_base64);
console.log('');

// Decrypt ElGamal ciphertext
console.log('🔓 Decrypting ElGamal ciphertext...');
const c1Bytes = Buffer.from(contentData.elgamal_ciphertext.c1_base64, 'base64');
const c2Bytes = Buffer.from(contentData.elgamal_ciphertext.c2_base64, 'base64');

const c1Point = RistrettoPoint.fromHex(c1Bytes);
const c2Point = RistrettoPoint.fromHex(c2Bytes);

const sharedSecret = c1Point.multiply(privateScalarBigInt);
const secretPoint = c2Point.subtract(sharedSecret);
const secretPointBytes = Buffer.from(secretPoint.toRawBytes());
console.log('✅ Recovered secret point');
console.log('');

// Derive AES key
const aesKey = crypto.createHash('sha256').update(secretPointBytes).digest();

// Decrypt content
console.log('🔓 Decrypting content...');
const encryptedContentBuffer = Buffer.from(contentData.encrypted_content_base64, 'base64');
const contentIv = encryptedContentBuffer.subarray(0, 12);
const contentTag = encryptedContentBuffer.subarray(-16);
const contentCiphertext = encryptedContentBuffer.subarray(12, -16);

const contentDecipher = crypto.createDecipheriv('aes-256-gcm', aesKey, contentIv);
contentDecipher.setAuthTag(contentTag);
const decryptedContent = Buffer.concat([
  contentDecipher.update(contentCiphertext),
  contentDecipher.final(),
]);

console.log('✅ Successfully decrypted!');
console.log('');
console.log('📜 Decrypted Content:');
console.log('═'.repeat(60));
console.log(decryptedContent.toString('utf8'));
console.log('═'.repeat(60));
console.log('');
console.log('🎉 Success! Buyer can decrypt the NFT content!');
```

### 7.2 Verify Decryption

```bash
node verify_decryption.js encrypted_nft_1762100792700 psalomo_keypair.json
```

**Expected output**: Shows the decrypted NFT content, proving the buyer can access it!

## Part 8: Check Final Status

### 8.1 Verify Ownership Transfer

```bash
near contract call-function as-read-only wasmmusic.testnet nft_token \
  json-args '{"token_id":"encrypted_nft_1762100792700"}' \
  network-config testnet \
  now
```

**Expected**: `owner_id` should be `psalomo.testnet` (the buyer)

### 8.2 Verify Escrow Cleared

```bash
near contract call-function as-read-only wasmmusic.testnet call_js_func \
  json-args '{
    "function_name":"get_escrow",
    "token_id":"encrypted_nft_1762100792700"
  }' \
  network-config testnet \
  now
```

**Expected**: `null` (escrow released)

### 8.3 Verify Listing Cleared

```bash
near contract call-function as-read-only wasmmusic.testnet call_js_func \
  json-args '{
    "function_name":"get_listing",
    "token_id":"encrypted_nft_1762100792700"
  }' \
  network-config testnet \
  now
```

**Expected**: `null` (listing removed)

## Security Features

### Zero-Knowledge Re-encryption Proof

The ZK proof proves that:
1. **Same secret encrypted**: Both old and new ciphertexts encrypt the same secret
2. **Correct re-encryption**: Seller used the same randomness for both
3. **No secret revealed**: Seller doesn't reveal private keys or secrets
4. **Verifiable on-chain**: Contract verifies proof cryptographically

### Encryption Format (92 bytes)

The `encrypted_scalar` stores:
- **12 bytes**: AES-GCM IV
- **64 bytes**: Encrypted (secret_scalar + randomness)
  - 32 bytes: secret_scalar (derives AES key for content)
  - 32 bytes: randomness (needed for ZK proof)
- **16 bytes**: AES-GCM authentication tag

This allows sellers to retrieve the original randomness from on-chain data for re-encryption proofs.

## Troubleshooting

### Issue: "Insufficient storage deposit"

**Solution**: Increase attached deposit in `nft_mint`:
```bash
attached-deposit '0.015 NEAR'  # Increase if needed
```

### Issue: "Invalid re-encryption proof"

**Cause**: Wrong randomness or incorrect proof generation

**Solution**:
1. Verify randomness was recovered correctly from `encrypted_scalar`
2. Ensure all proof commitments use correct curve points
3. Check challenge hash includes all parameters in correct order

### Issue: "Buyer pubkey does not match escrow record"

**Solution**: Ensure `buyer_pubkey_base64` parameter in `complete_sale` exactly matches the value from `get_escrow`

### Issue: NFT not found in registry

**Solution**: Call `nft_mint` (Rust method) not just the JavaScript storage functions. The Rust method registers the token in the NFT registry.

## Web4 Viewer

The encrypted NFT has a web viewer at:
```
https://wasmmusic.testnet.page/?tokenId=encrypted_nft_1762100792700
```

Users can paste their private key to decrypt and view the content in their browser.

## Summary

This marketplace demonstrates:
- ✅ **End-to-end encryption**: Content never exposed on-chain
- ✅ **Secure ownership transfer**: Re-encryption without revealing secrets
- ✅ **Zero-knowledge proofs**: Cryptographic verification of correctness
- ✅ **Escrow-based payments**: Funds protected until proof verification
- ✅ **Decentralized**: All operations on NEAR blockchain

The buyer receives NFT ownership AND the ability to decrypt the content, while the seller receives payment - all without exposing any private keys or secrets!
