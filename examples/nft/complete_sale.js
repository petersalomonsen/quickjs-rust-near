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
const TOKEN_ID = process.argv[2] || "encrypted_nft_1762105724480";
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
