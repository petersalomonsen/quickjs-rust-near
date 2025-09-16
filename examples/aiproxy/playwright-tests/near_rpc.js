import { Sandbox, DEFAULT_PRIVATE_KEY, DEFAULT_PUBLIC_KEY } from "near-sandbox";
import { KeyPair, transactions, utils } from "near-api-js";
import crypto from "crypto";
import {
  NearRpcClient,
  broadcastTxCommit,
  status,
  block,
  viewAccessKey,
  query,
} from "@near-js/jsonrpc-client";
import { readFile } from "fs/promises";
import { createServer } from "http";

//process.env.NEAR_ENABLE_SANDBOX_LOG="1";

// Start sandbox with version 2.8.0 which supports global contracts
// Configure test.near account to use the default keypair
const sandbox = await Sandbox.start({
  version: "2.8.0",
  config: {
    rpcPort: 14500,
    additionalGenesis: {
      records: [
        {
          Account: {
            account_id: "test.near",
            account: {
              amount: "1000000000000000000000000000000000",
              locked: "50000000000000000000000000000000",
              code_hash: "11111111111111111111111111111111",
              storage_usage: 0,
              version: "V1",
            },
          },
        },
        {
          AccessKey: {
            account_id: "test.near",
            public_key: DEFAULT_PUBLIC_KEY,
            access_key: { nonce: 0, permission: "FullAccess" },
          },
        },
        {
          Account: {
            account_id: "near",
            account: {
              amount: "1000000000000000000000000000000000",
              locked: "0",
              code_hash: "11111111111111111111111111111111",
              storage_usage: 0,
              version: "V1",
            },
          },
        },
        {
          AccessKey: {
            account_id: "near",
            public_key: DEFAULT_PUBLIC_KEY,
            access_key: { nonce: 0, permission: "FullAccess" },
          },
        },
        {
          Account: {
            account_id: "sandbox",
            account: {
              amount: "10000000000000000000000000000",
              locked: "0",
              code_hash: "11111111111111111111111111111111",
              storage_usage: 182,
            },
          },
        },
        {
          AccessKey: {
            account_id: "sandbox",
            public_key: DEFAULT_PUBLIC_KEY,
            access_key: { nonce: 0, permission: "FullAccess" },
          },
        },
      ],
    },
  },
});

const sandboxRpcUrl = sandbox.rpcUrl;
console.log(`Sandbox started with RPC URL: ${sandboxRpcUrl}`);

// Wait for sandbox to be ready
await new Promise((resolve) => setTimeout(resolve, 3000));
console.log(`Sandbox ready, proceeding with setup...`);

const sandboxRpcClient = new NearRpcClient(sandboxRpcUrl);

// Verify RPC connection
try {
  const result = await status(sandboxRpcClient);
  console.log(`✅ RPC connection verified - Chain ID: ${result.chainId}`);
} catch (e) {
  console.error("Failed to connect to RPC:", e);
  throw e;
}

// Use the default keypair for all accounts
const defaultKeyPair = KeyPair.fromString(DEFAULT_PRIVATE_KEY);

// Store key pairs for accounts we create
const accountKeys = new Map();
accountKeys.set("test.near", defaultKeyPair);
accountKeys.set("near", defaultKeyPair);
accountKeys.set("sandbox", defaultKeyPair);

process.on("exit", async () => {
  console.log("Tearing down sandbox worker");
  await sandbox.tearDown();
});

// Helper to get latest block hash
async function getLatestBlockHash() {
  const result = await block(sandboxRpcClient, { finality: "final" });
  return result.header.hash;
}

// Helper to get access key nonce
async function getAccessKeyNonce(accountId, publicKey) {
  const result = await viewAccessKey(sandboxRpcClient, {
    accountId,
    publicKey,
    finality: "final",
  });
  return result.nonce;
}

// Helper to create accounts
async function createAccount(
  accountId,
  initialBalance = "100000000000000000000000000",
) {
  const newKeyPair = KeyPair.fromRandom("ed25519");
  accountKeys.set(accountId, newKeyPair);

  const actions = [
    transactions.createAccount(),
    transactions.transfer(
      utils.format.parseNearAmount(initialBalance.replace(/0{24}$/, "")),
    ),
    transactions.addKey(
      newKeyPair.getPublicKey(),
      transactions.fullAccessKey(),
    ),
  ];

  const blockHash = await getLatestBlockHash();
  const parentAccount = accountId.endsWith("test.near") ? "test.near" : "near";
  const nonce = await getAccessKeyNonce(
    parentAccount,
    defaultKeyPair.getPublicKey().toString(),
  );

  const tx = transactions.createTransaction(
    parentAccount,
    defaultKeyPair.getPublicKey(),
    accountId,
    nonce + 1,
    actions,
    utils.serialize.base_decode(blockHash),
  );

  // Serialize and sign the transaction
  const serializedTx = utils.serialize.serialize(
    transactions.SCHEMA.Transaction,
    tx,
  );
  const txHash = crypto.createHash("sha256").update(serializedTx).digest();
  const signature = defaultKeyPair.sign(txHash);

  const signedTx = new transactions.SignedTransaction({
    transaction: tx,
    signature: new transactions.Signature({
      keyType: tx.publicKey.keyType,
      data: signature.signature,
    }),
  });

  const signedTxBytes = signedTx.encode();
  const signedTxBase64 = Buffer.from(signedTxBytes).toString("base64");
  const result = await broadcastTxCommit(sandboxRpcClient, {
    signedTxBase64: signedTxBase64,
    waitUntil: "FINAL", // Wait until the transaction is executed
  });

  if (result.status.SuccessValue !== undefined) {
    console.log(`Created account: ${accountId}`);
  } else if (result.status.Failure) {
    console.error(
      `Failed to create account ${accountId}:`,
      result.status.Failure,
    );
  }

  return newKeyPair;
}

// Helper to deploy contract
async function deployContract(accountId, wasmCode) {
  const keyPair = accountKeys.get(accountId);
  if (!keyPair) throw new Error(`No key for account ${accountId}`);

  const actions = [transactions.deployContract(wasmCode)];

  const blockHash = await getLatestBlockHash();
  await new Promise((resolve) => setTimeout(() => resolve(), 2000));
  const nonce = await getAccessKeyNonce(
    accountId,
    keyPair.getPublicKey().toString(),
  );

  const tx = transactions.createTransaction(
    accountId,
    keyPair.getPublicKey(),
    accountId,
    nonce + 1,
    actions,
    utils.serialize.base_decode(blockHash),
  );

  // Serialize and sign the transaction
  const serializedTx = utils.serialize.serialize(
    transactions.SCHEMA.Transaction,
    tx,
  );
  const txHash = crypto.createHash("sha256").update(serializedTx).digest();
  const signature = keyPair.sign(txHash);

  const signedTx = new transactions.SignedTransaction({
    transaction: tx,
    signature: new transactions.Signature({
      keyType: tx.publicKey.keyType,
      data: signature.signature,
    }),
  });

  const signedTxBytes = signedTx.encode();
  const signedTxBase64 = Buffer.from(signedTxBytes).toString("base64");
  const result = await broadcastTxCommit(sandboxRpcClient, {
    signedTxBase64,
    waitUntil: "FINAL",
  });

  if (result.status.SuccessValue !== undefined) {
    console.log(`Deployed contract to: ${accountId}`);
  } else if (result.status.Failure) {
    console.error(`Failed to deploy to ${accountId}:`, result.status.Failure);
  }
}

// Helper to call contract function
async function functionCall(
  accountId,
  contractId,
  methodName,
  args,
  gas = "30000000000000",
  deposit = "0",
) {
  const keyPair = accountKeys.get(accountId);
  if (!keyPair) throw new Error(`No key for account ${accountId}`);

  const actions = [
    transactions.functionCall(methodName, args, BigInt(gas), BigInt(deposit)),
  ];

  const blockHash = await getLatestBlockHash();
  const nonce = await getAccessKeyNonce(
    accountId,
    keyPair.getPublicKey().toString(),
  );

  const tx = transactions.createTransaction(
    accountId,
    keyPair.getPublicKey(),
    contractId,
    nonce + 1,
    actions,
    utils.serialize.base_decode(blockHash),
  );

  // Serialize and sign the transaction
  const serializedTx = utils.serialize.serialize(
    transactions.SCHEMA.Transaction,
    tx,
  );
  const txHash = crypto.createHash("sha256").update(serializedTx).digest();
  const signature = keyPair.sign(txHash);

  const signedTx = new transactions.SignedTransaction({
    transaction: tx,
    signature: new transactions.Signature({
      keyType: tx.publicKey.keyType,
      data: signature.signature,
    }),
  });

  const signedTxBytes = signedTx.encode();
  const signedTxBase64 = Buffer.from(signedTxBytes).toString("base64");
  const result = await broadcastTxCommit(sandboxRpcClient, {
    signedTxBase64,
    waitUntil: "FINAL",
  });

  if (result.status.SuccessValue !== undefined) {
    console.log(`Called ${methodName} on ${contractId}`);
  } else if (result.status.Failure) {
    console.error(
      `Failed to call ${methodName} on ${contractId}:`,
      result.status.Failure,
    );
  }

  return result;
}

// Helper to get contract code from mainnet
async function getContractCode(accountId) {
  const mainnetRpcClient = new NearRpcClient("https://rpc.mainnet.near.org");
  try {
    const result = await query(mainnetRpcClient, {
      requestType: "view_code",
      finality: "final",
      accountId,
    });
    return result.codeBase64 ? Buffer.from(result.codeBase64, "base64") : null;
  } catch (e) {
    // Contract doesn't exist or other error
    return null;
  }
}

// Helper to import contract from mainnet
async function importMainnetContract(
  mainnetContractId,
  localAccountId,
  initialBalance = "100000000000000000000000000",
) {
  // Create account first
  await createAccount(localAccountId, initialBalance);

  // Fetch contract code from mainnet
  const contractCode = await getContractCode(mainnetContractId);

  if (contractCode) {
    await deployContract(localAccountId, contractCode);
  }
}

// Create AI token account and deploy
await createAccount("aitoken.test.near");
const aiTokenWasm = await readFile(
  new URL("../../fungibletoken/out/fungible_token.wasm", import.meta.url),
);
await deployContract("aitoken.test.near", aiTokenWasm);

// Import mainnet "near" contract directly to sandbox "near" account
const nearContractCode = await getContractCode("near");
if (nearContractCode) {
  await deployContract("near", nearContractCode);
  await new Promise((resolve) => setTimeout(() => resolve(), 1000));
  await functionCall("near", "near", "new", {});
}

// Import web4factory contract
await importMainnetContract(
  "web4factory.near",
  "web4factory.near",
  "10000000000000000000000000",
);

// Initialize AI token contract
await functionCall(
  "aitoken.test.near",
  "aitoken.test.near",
  "new_default_meta",
  {
    owner_id: "aitoken.test.near",
    total_supply: "1000000000000",
  },
);

// Import NFT contract
await createAccount("webassemblymusic.near", "100000000000000000000000000");

// Import NFT contract from mainnet
const nftCode = await getContractCode("webassemblymusic.near");
if (nftCode) {
  await deployContract("webassemblymusic.near", nftCode);
  await new Promise((resolve) => setTimeout(() => resolve(), 2000));
}

await functionCall("webassemblymusic.near", "webassemblymusic.near", "new", {});

const nftJavascript = await readFile(
  new URL("../../nft/src/contract.js", import.meta.url),
);
await functionCall(
  "webassemblymusic.near",
  "webassemblymusic.near",
  "post_javascript",
  {
    javascript: nftJavascript.toString(),
  },
);

// Set up refund signature public key
// Use a default key if the environment variable is not set
const refundSigningKey =
  process.env.SPIN_VARIABLE_REFUND_SIGNING_KEY ||
  "3KyUuch8pYjBGvvtRYj8kfgqNAGdgr4L95pEZqhYn2MJBL8NtfC5fWky4DQd7PKV5xCwnRyuDuWD5roBGKCQ8rbU";
const publicKeyBytes = KeyPair.fromString(
  "ed25519:" + refundSigningKey,
).getPublicKey().data;

const javascript = (
  await readFile(
    new URL("../../fungibletoken/e2e/aiconversation.js", import.meta.url),
  )
)
  .toString()
  .replace(
    "REPLACE_REFUND_SIGNATURE_PUBLIC_KEY",
    JSON.stringify(Array.from(publicKeyBytes)),
  );

await functionCall(
  "aitoken.test.near",
  "aitoken.test.near",
  "post_javascript",
  { javascript },
);

// Create AI user account
await createAccount("aiuser.test.near");
await new Promise((resolve) => setTimeout(() => resolve(), 1000));
await functionCall(
  "aiuser.test.near",
  "aitoken.test.near",
  "storage_deposit",
  {
    account_id: "aiuser.test.near",
    registration_only: true,
  },
  "30000000000000",
  "10000000000000000000000000",
);

await functionCall(
  "aitoken.test.near",
  "aitoken.test.near",
  "ft_transfer",
  {
    receiver_id: "aiuser.test.near",
    amount: (100n * 128_000_000n).toString(),
  },
  "30000000000000",
  "1",
);

// Create unregistered AI user
await createAccount("unregisteredaiuser.test.near");

await functionCall(
  "webassemblymusic.near",
  "webassemblymusic.near",
  "nft_mint",
  {
    token_id: "123",
    token_owner_id: "unregisteredaiuser.test.near",
    token_metadata: {},
  },
  "300000000000000",
  "16250000000000000000000",
);

await functionCall(
  "webassemblymusic.near",
  "webassemblymusic.near",
  "post_content",
  {
    key: "locked-123",
    valuebase64: btoa("locked content"),
  },
  "300000000000000",
);

// Set up function access key
const functionAccessKeyPair = KeyPair.fromRandom("ed25519");
const aiuserKeyPair = accountKeys.get("aiuser.test.near");

// Add function call access key using transactions API
const addKeyActions = [
  transactions.addKey(
    functionAccessKeyPair.getPublicKey(),
    transactions.functionCallAccessKey(
      "aitoken.test.near",
      ["call_js_func"],
      BigInt(utils.format.parseNearAmount("0.25")),
    ),
  ),
];

const addKeyBlockHash = await getLatestBlockHash();
const addKeyNonce = await getAccessKeyNonce(
  "aiuser.test.near",
  aiuserKeyPair.getPublicKey().toString(),
);

const addKeyTx = transactions.createTransaction(
  "aiuser.test.near",
  aiuserKeyPair.getPublicKey(),
  "aiuser.test.near",
  addKeyNonce + 1,
  addKeyActions,
  utils.serialize.base_decode(addKeyBlockHash),
);

// Serialize and sign the add key transaction
const serializedAddKeyTx = utils.serialize.serialize(
  transactions.SCHEMA.Transaction,
  addKeyTx,
);
const addKeyTxHash = crypto
  .createHash("sha256")
  .update(serializedAddKeyTx)
  .digest();
const addKeySignature = aiuserKeyPair.sign(addKeyTxHash);

const addKeySignedTx = new transactions.SignedTransaction({
  transaction: addKeyTx,
  signature: new transactions.Signature({
    keyType: addKeyTx.publicKey.keyType,
    data: addKeySignature.signature,
  }),
});

const addKeySignedTxBytes = addKeySignedTx.encode();
const addKeySignedTxBase64 =
  Buffer.from(addKeySignedTxBytes).toString("base64");
await broadcastTxCommit(sandboxRpcClient, {
  signedTxBase64: addKeySignedTxBase64,
});
console.log("Added function access key for aiuser.test.near");

// Get keys for the response
const aiuserKey = accountKeys.get("aiuser.test.near");
const unregisteredKey = accountKeys.get("unregisteredaiuser.test.near");

// Start HTTP server
const server = createServer(async (_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      publicKey: aiuserKey.getPublicKey().toString(),
      functionAccessKeyPair: functionAccessKeyPair.toString(),
      accountId: "aiuser.test.near",
      contractId: "aitoken.test.near",
      unregisteredaiuser: {
        accountId: "unregisteredaiuser.test.near",
        fullAccessKeyPair: unregisteredKey.toString(),
      },
    }),
  );
});

server.listen(14501, () => {
  console.log(`Sandbox RPC up and running`);
});
