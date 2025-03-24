import { test, expect } from "@playwright/test";
import { connect, keyStores, utils, transactions } from "near-api-js";
import { actionCreators } from "@near-js/transactions";

import { deserialize } from "borsh";

test("meta transaction", async ({ page }) => {
  // setup accounts

  const rpc_url = "http://localhost:14500";
  const { contractId, unregisteredaiuser, relayer } = await fetch(
    "http://localhost:14501",
  ).then((r) => r.json());

  const networkId = "sandbox";
  const userFullAccessKeyPair = utils.KeyPair.fromString(
    unregisteredaiuser.fullAccessKeyPair,
  );
  const userAccountId = unregisteredaiuser.accountId;

  const keyStore = new keyStores.InMemoryKeyStore();
  keyStore.setKey(networkId, userAccountId, userFullAccessKeyPair);
  const connection = await connect({
    networkId,
    nodeUrl: rpc_url,
    keyStore,
  });
  const userAccount = await connection.account(userAccountId);
  const web4AccountId =
    "myweb4site" + new Date().toJSON().replace(/[^0-9]/g, "") + ".near";

  const relayerAccount = await connection.account(relayer.accountId);
  const relayerAccountKeyPair = utils.KeyPair.fromString(
    relayer.fullAccessKeyPair,
  );
  keyStore.setKey(networkId, relayer.accountId, relayerAccountKeyPair);

  // On the client
  const signedDelegate = await userAccount.signedDelegate({
    receiverId: "web4factory.near",
    blockHeightTtl: 120,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "create",
          args: {
            new_account_id: web4AccountId,
            full_access_key: relayerAccountKeyPair.getPublicKey().toString(),
          },
          gas: 300_000_000_000_000n.toString(),
          deposit: 9_000_000_000_000_000_000_000_000n.toString(),
        },
      },
    ],
  });
  const serializedSignedDelegate = JSON.stringify([
    Array.from(transactions.encodeSignedDelegate(signedDelegate)),
  ]);

  // On the server

  const deserializedTx = deserialize(
    transactions.SCHEMA.SignedDelegate,
    new Uint8Array(JSON.parse(serializedSignedDelegate)[0]),
  );

  // the server should check that the relayer has the full access key, and that the deposit is correct ( 9 NEAR )

  const actions = deserializedTx.delegateAction.actions;
  expect(actions.length).toBe(1);
  const functionCall = actions[0].functionCall;
  const args = JSON.parse(String.fromCharCode(...functionCall.args));

  expect(args.full_access_key).toBe(
    relayerAccountKeyPair.getPublicKey().toString(),
  );
  expect(functionCall.deposit).toBe(9_000_000_000_000_000_000_000_000n);

  await relayerAccount.signAndSendTransaction({
    actions: [actionCreators.signedDelegate(deserializedTx)],
    receiverId: deserializedTx.delegateAction.senderId,
  });

  // On the client
  try {
    await userAccount.viewFunction({
      contractId: web4AccountId,
      methodName: "web4_get",
      args: { request: { path: "/" } },
    });
  } catch (err) {
    expect(err.toString()).toContain("minimumweb4");
  }
});
