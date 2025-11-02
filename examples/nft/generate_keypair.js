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

// Generate random 32-byte private scalar
const privateScalar = bufferToScalar(crypto.randomBytes(32));
const privateScalarBytes = scalarToBuffer(privateScalar);

// Compute public key: P = scalar * G (basepoint)
const publicKey = RistrettoPoint.BASE.multiply(privateScalar);

// Get compressed point representation (32 bytes)
const publicKeyBytes = publicKey.toRawBytes();

const keypair = {
  account_id: 'psalomo.testnet',
  private_scalar_base64: privateScalarBytes.toString('base64'),
  private_scalar_hex: privateScalarBytes.toString('hex'),
  public_key_base64: Buffer.from(publicKeyBytes).toString('base64'),
  public_key_hex: Buffer.from(publicKeyBytes).toString('hex'),
  generated_at: new Date().toISOString()
};

// Save to file
const filename = 'psalomo_testnet_keypair.json';
fs.writeFileSync(filename, JSON.stringify(keypair, null, 2));

console.log('Keypair generated for psalomo.testnet:\n');
console.log('Private Scalar (hex):');
console.log(keypair.private_scalar_hex);
console.log('\nPrivate Scalar (base64):');
console.log(keypair.private_scalar_base64);
console.log('\nPublic Key (hex):');
console.log(keypair.public_key_hex);
console.log('\nPublic Key (base64):');
console.log(keypair.public_key_base64);
console.log('\n⚠️  Keep the private scalar SECRET and secure!');
console.log('✅ Share only the public key when buying NFTs.');
console.log(`\n💾 Keypair saved to: ${filename}`);
