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
const WASM_FILE = process.argv[2] || "/Users/peter/Downloads/monsterisclose.wasm";

if (!fs.existsSync(WASM_FILE)) {
  console.error(`❌ WASM file not found: ${WASM_FILE}`);
  process.exit(1);
}

const wasmContent = fs.readFileSync(WASM_FILE);
const wasmFilename = WASM_FILE.split('/').pop();
const TOKEN_ID = `wasm_nft_${wasmFilename.replace('.wasm', '')}_${Date.now()}`;

console.log('🎨 Minting Encrypted WASM NFT');
console.log('============================\n');
console.log('WASM File:', wasmFilename);
console.log('File Size:', wasmContent.length, 'bytes');
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

// 6. Encrypt the WASM content with AES-256-GCM
const contentIv = crypto.randomBytes(12);
const contentCipher = crypto.createCipheriv('aes-256-gcm', aesKey, contentIv);
const encryptedContent = Buffer.concat([
  contentCipher.update(wasmContent),
  contentCipher.final(),
]);
const contentTag = contentCipher.getAuthTag();
const encryptedContentBlob = Buffer.concat([contentIv, encryptedContent, contentTag]);

console.log('🔐 WASM content encrypted');
console.log('   Original size:', wasmContent.length, 'bytes');
console.log('   Encrypted size:', encryptedContentBlob.length, 'bytes');
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
  wasm_filename: wasmFilename,
  original_size: wasmContent.length,
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

// Calculate required storage deposit
// The contract calculates: encrypted_content + encrypted_scalar + ciphertexts + metadata
// Plus overhead for the NFT struct itself
// Safe approach: use the full NFT size estimate with generous buffer
const totalDataSize = encryptedContentBlob.length + encryptedScalarBlob.length + 64 + 64 + 200; // content + scalar + c1 + c2 + overhead
const storageCostPerByte = 0.00001;
const totalStorageCost = totalDataSize * storageCostPerByte;
const depositAmount = (totalStorageCost + 0.15).toFixed(4); // Add 0.15 NEAR buffer for safety

console.log('💰 Storage calculation:');
console.log('   Encrypted size:', encryptedContentBlob.length, 'bytes');
console.log('   Storage cost:', totalStorageCost.toFixed(4), 'NEAR');
console.log('   Deposit amount:', depositAmount, 'NEAR (with buffer)');
console.log('');

console.log('📤 Minting WASM NFT on testnet...');
console.log('');

// 10. Call nft_mint to register the token
try {
  const result = execSync(
    `near contract call-function as-transaction wasmmusic.testnet nft_mint ` +
    `json-args '${JSON.stringify(mintArgs)}' ` +
    `prepaid-gas '100.0 Tgas' ` +
    `attached-deposit '${depositAmount} NEAR' ` +
    `sign-as ${OWNER_ACCOUNT} ` +
    `network-config testnet ` +
    `sign-with-access-key-file ~/.near-credentials/testnet/${OWNER_ACCOUNT}.json ` +
    `send`,
    { encoding: 'utf8' }
  );

  console.log(result);
  console.log('');
  console.log('✅ WASM NFT minted successfully!');
  console.log('🎉 Token ID:', TOKEN_ID);
  console.log('📦 WASM File:', wasmFilename);
  console.log('🔐 Encrypted Size:', encryptedContentBlob.length, 'bytes');
} catch (error) {
  console.error('❌ Minting failed:', error.message);
  process.exit(1);
}
