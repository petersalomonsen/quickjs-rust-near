import { KeyPairEd25519 } from "near-workspaces";
const keypair = KeyPairEd25519.fromRandom();
console.log(
  `export REPLACE_REFUND_SIGNATURE_PUBLIC_KEY=${JSON.stringify(Array.from(keypair.getPublicKey().data))}`,
);
console.log(`export SPIN_VARIABLE_REFUND_SIGNING_KEY=${keypair.secretKey}`);
