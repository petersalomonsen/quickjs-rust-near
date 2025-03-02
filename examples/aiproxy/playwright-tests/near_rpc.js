import { KeyPairEd25519, KeyPair, parseNEAR, Worker } from "near-workspaces";

import { readFile } from "fs/promises";
import { createServer } from "http";
import { createHash } from "crypto";

const worker = await Worker.init({
  port: 14500,
  rpcAddr: "http://localhost:14500",
});

process.on("exit", () => {
  console.log("Tearing down sandbox worker");
  worker.tearDown();
});

const aiTokenAccount =
  await worker.rootAccount.createAccount("aitoken.test.near");
await aiTokenAccount.deploy(
  await readFile("../fungibletoken/out/fungible_token.wasm"),
);

const nearContract = await worker.rootAccount.importContract({
  mainnetContract: "near",
  initialBalance: 100_000_000_000_000_000_000_000_000n.toString(),
});
await nearContract.call(
  "near",
  "new",
  {},
  30_000_000_000_000n.toString(),
  0n.toString(),
);
await worker.rootAccount.importContract({
  mainnetContract: "web4factory.near",
  initialBalance: 10_000_000_000_000_000_000_000_000n.toString(),
});

await aiTokenAccount.call(aiTokenAccount.accountId, "new_default_meta", {
  owner_id: aiTokenAccount.accountId,
  total_supply: 1_000_000_000_000n.toString(),
});

const publicKeyBytes = KeyPair.fromString(
  "ed25519:" + process.env.SPIN_VARIABLE_REFUND_SIGNING_KEY,
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

await aiTokenAccount.call(aiTokenAccount.accountId, "post_javascript", {
  javascript,
});

const aiuser = await worker.rootAccount.createAccount("aiuser.test.near");
await aiuser.call(
  aiTokenAccount.accountId,
  "storage_deposit",
  {
    account_id: aiuser.accountId,
    registration_only: true,
  },
  {
    attachedDeposit: 1_0000_0000000000_0000000000n.toString(),
  },
);

await aiTokenAccount.call(
  aiTokenAccount.accountId,
  "ft_transfer",
  {
    receiver_id: aiuser.accountId,
    amount: (100n * 128_000_000n).toString(),
  },
  {
    attachedDeposit: 1n.toString(),
  },
);

const unregisteredaiuser = await worker.rootAccount.createAccount(
  "unregisteredaiuser.test.near",
);

const functionAccessKeyPair = KeyPairEd25519.fromRandom();

await aiuser.updateAccessKey(functionAccessKeyPair, {
  permission: {
    FunctionCall: {
      method_names: ["call_js_func"],
      receiver_id: aiTokenAccount.accountId,
      allowance: parseNEAR("0.25").toString(),
    },
  },
  nonce: 0,
});

const publicKey = (await aiuser.getKey()).getPublicKey().toString();

const server = createServer(async (req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      publicKey,
      functionAccessKeyPair: functionAccessKeyPair.toString(),
      accountId: aiuser.accountId,
      contractId: aiTokenAccount.accountId,
      unregisteredaiuser: {
        accountId: unregisteredaiuser.accountId,
        fullAccessKeyPair: (await unregisteredaiuser.getKey()).toString(),
      },
    }),
  );
});

server.listen(14501, () => {
  console.log(`Sandbox RPC up and running`);
});
