import { test, expect } from "@playwright/test";
import { connect, keyStores, utils, transactions } from "near-api-js";
import { actionCreators } from "@near-js/transactions";

import { deserialize } from "borsh";

test("meta transaction", async ({ page }) => {
  // On the client

  const rpc_url = "http://localhost:14500";
  const { contractId, unregisteredaiuser, relayer } = await fetch(
    "http://localhost:14501",
  ).then((r) => r.json());

  const networkId = "sandbox";
  const fullAccessKeyPair = utils.KeyPair.fromString(
    unregisteredaiuser.fullAccessKeyPair,
  );
  const accountId = unregisteredaiuser.accountId;

  const keyStore = new keyStores.InMemoryKeyStore();
  keyStore.setKey(networkId, accountId, fullAccessKeyPair);
  const connection = await connect({
    networkId,
    nodeUrl: rpc_url,
    keyStore,
  });
  const account = await connection.account(accountId);
  const new_account_id = "myweb4site.near";

  const signedDelegate = await account.signedDelegate({
    receiverId: "web4factory.near",
    blockHeightTtl: 120,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "create",
          args: {
            new_account_id,
            full_access_key: fullAccessKeyPair.getPublicKey().toString(),
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
  const relayerAccount = await connection.account(relayer.accountId);
  keyStore.setKey(
    networkId,
    relayer.accountId,
    utils.KeyPair.fromString(relayer.fullAccessKeyPair),
  );
  await relayerAccount.signAndSendTransaction({
    actions: [actionCreators.signedDelegate(deserializedTx)],
    receiverId: deserializedTx.delegateAction.senderId,
  });

  // On the client
  try {
    await account.viewFunction({
      contractId: new_account_id,
      methodName: "web4_get",
      args: { request: { path: "/" } },
    });
  } catch (err) {
    expect(err.toString()).toContain("minimumweb4");
  }
});
