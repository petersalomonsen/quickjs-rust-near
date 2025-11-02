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

const TOKEN_ID = process.argv[2] || "encrypted_nft_1762105724480";
const KEYPAIR_FILE = process.argv[3] || "psalomo_testnet_keypair.json";

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
