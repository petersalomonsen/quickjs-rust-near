import { connect, keyStores } from "near-api-js";
import { readFile } from "fs/promises";
import { KeyPairEd25519, Worker } from "near-workspaces";
import { before, after, test, describe } from "node:test";
import { expect } from "chai";

const connectionConfig = {
  networkId: "sandbox",
  keyStore: new keyStores.InMemoryKeyStore(),
};

describe("NFT contract", () => {
  /**
   * @type {import('near-workspaces').Worker}
   */
  let worker;

  /**
   * @type {import('near-workspaces').Account}
   */
  let root;

  /**
   * @type {import('near-workspaces').Account}
   */
  let userAccount;

  /**
   * @type {import('near-workspaces').NearAccount}
   */
  let contract;

  /**
   * @type {import('near-workspaces').KeyPair}
   */
  let contractAccountKeyPair;

  before(async () => {
    worker = await Worker.init();
    connectionConfig.nodeUrl = worker.provider.connection.url;
    root = worker.rootAccount;
    contract = await root.devDeploy("out/nft.wasm");
    await contract.call(contract.accountId, "new", {});
    contractAccountKeyPair = await contract.getKey();
    connectionConfig.keyStore.setKey(
      "sandbox",
      contract.accountId,
      contractAccountKeyPair,
    );
    const userAccountKeyPair = KeyPairEd25519.fromRandom();
    userAccount = await worker.rootAccount.createSubAccount("user", {
      keyPair: userAccountKeyPair,
    });
    connectionConfig.keyStore.setKey(
      "sandbox",
      userAccount.accountId,
      userAccountKeyPair,
    );
  });
  test("should run custom javascript in contract for getting locked content", async () => {
    const nearConnection = await connect(connectionConfig);
    const accountId = contract.accountId;

    const account = await nearConnection.account(accountId);
    await account.functionCall({
      contractId: accountId,
      methodName: "post_javascript",
      gas: "300000000000000",
      args: {
        javascript: await (await readFile("src/contract.js")).toString(),
      },
    });
    const valuebase64 = await (
      await readFile("web4/musicwasms/fall.wasm")
    ).toString("base64");
    await account.functionCall({
      contractId: accountId,
      methodName: "post_content",
      args: {
        key: "locked-fall",
        valuebase64,
      },
    });

    await account.functionCall({
      contractId: accountId,
      methodName: "nft_mint",
      attachedDeposit: "16250000000000000000000",
      gas: "300000000000000",
      args: {
        token_id: `fall`,
        token_owner_id: accountId,
        token_metadata: {},
      },
    });

    await account.functionCall({
      contractId: accountId,
      methodName: "nft_mint",
      attachedDeposit: "16250000000000000000000",
      gas: "300000000000000",
      args: {
        token_id: `spring`,
        token_owner_id: userAccount.accountId,
        token_metadata: {},
      },
    });

    await account.functionCall({
      contractId: accountId,
      methodName: "call_js_func",
      args: {
        function_name: "store_signing_key",
      },
    });

    let message = JSON.stringify({ token_id: "fall", account_id: accountId });
    let keyPair = await account.connection.signer.keyStore.getKey(
      connectionConfig.networkId,
      accountId,
    );
    let signatureObj = await keyPair.sign(new TextEncoder().encode(message));
    let signature = btoa(String.fromCharCode(...signatureObj.signature));

    const result = await account.viewFunction({
      contractId: accountId,
      methodName: "call_js_func",
      args: {
        function_name: "get_locked_content",
        message,
        signature,
      },
    });

    expect(result).to.equal(valuebase64);

    keyPair = await account.connection.signer.keyStore.getKey(
      connectionConfig.networkId,
      userAccount.accountId,
    );
    message = JSON.stringify({
      token_id: "fall",
      account_id: userAccount.accountId,
    });
    signatureObj = await keyPair.sign(new TextEncoder().encode(message));
    signature = btoa(String.fromCharCode(...signatureObj.signature));

    await userAccount.call(accountId, "call_js_func", {
      function_name: "store_signing_key",
    });

    const not_owner_result = await account.viewFunction({
      contractId: accountId,
      methodName: "call_js_func",
      args: {
        function_name: "get_locked_content",
        message,
        signature,
      },
    });

    expect(not_owner_result).to.equal("not owner");

    message = JSON.stringify({
      token_id: "fall",
      account_id: account.accountId,
    });
    const invalid_signature_result = await account.viewFunction({
      contractId: accountId,
      methodName: "call_js_func",
      args: {
        function_name: "get_locked_content",
        message,
        signature,
      },
    });

    expect(invalid_signature_result).to.equal("invalid signature");
  });
  after(async () => {
    await worker.tearDown();
  });
});
