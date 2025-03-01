import { connect, keyStores } from "near-api-js";
import { Worker } from "near-workspaces";
import { before, after, test, describe, afterEach } from "node:test";
import { expect } from "chai";
import { createHash } from "crypto";

const connectionConfig = {
  networkId: "sandbox",
  keyStore: new keyStores.InMemoryKeyStore(),
  nodeUrl: "https://rpc.testnet.near.org",
};

describe("Fungible token contract", { only: true }, () => {
  /**
   * @type {Worker}
   */
  let worker;

  /**
   * @type {Account}
   */
  let root;

  /**
   * @type {import('near-workspaces').NearAccount}
   */
  let contract;
  /**
   * @type {import('near-workspaces').NearAccount}
   */
  let bob;
  /**
   * @type {import('near-workspaces').NearAccount}
   */
  let alice;

  /**
   * @type {import('near-workspaces').KeyPair}
   */
  let contractAccountKeyPair;

  before(async () => {
    worker = await Worker.init();

    connectionConfig.nodeUrl = worker.provider.connection.url;
    root = worker.rootAccount;

    bob = await worker.rootAccount.createAccount("bob.test.near");
    alice = await worker.rootAccount.createAccount("alice.test.near");

    contract = await root.devDeploy("out/fungible_token.wasm");
    await contract.call(contract.accountId, "new_default_meta", {
      owner_id: "bob.test.near",
      total_supply: 1_000_000n.toString(),
    });
    contractAccountKeyPair = await contract.getKey();
    connectionConfig.keyStore.setKey(
      "sandbox",
      contract.accountId,
      contractAccountKeyPair,
    );
    await alice.call(
      contract.accountId,
      "storage_deposit",
      {
        account_id: "alice.test.near",
        registration_only: true,
      },
      {
        attachedDeposit: 1_0000_0000000000_0000000000n.toString(),
      },
    );
  });
  after(async () => {
    await worker.tearDown();
  });

  afterEach(async () => {
    const aliceBalance = await contract.view("ft_balance_of", {
      account_id: "alice.test.near",
    });
    if (BigInt(aliceBalance) > 0n) {
      await alice.call(
        contract.accountId,
        "ft_transfer",
        {
          receiver_id: "bob.test.near",
          amount: aliceBalance.toString(),
        },
        {
          attachedDeposit: 1n.toString(),
        },
      );
    }
  });

  test("should run custom javascript transfer functions in contract", async () => {
    const nearConnection = await connect(connectionConfig);
    const accountId = contract.accountId;

    const account = await nearConnection.account(accountId);
    await account.functionCall({
      contractId: accountId,
      methodName: "post_javascript",
      gas: "300000000000000",
      args: {
        javascript: `
                export function transfer_2_000_to_alice() {
                    const amount = 2_000n;
                    const transfer_id = env.signer_account_id() + '_' + new Date().getTime();
                    env.set_data(transfer_id, JSON.stringify({receiver_id: env.signer_account_id(), refund_amount: (amount / 2n).toString()}));
                    env.ft_transfer('alice.test.near', amount.toString());
                    env.value_return(transfer_id);
                }

                export function refund() {
                    const { transfer_id } = JSON.parse(env.input());
                    const {refund_amount, receiver_id} = JSON.parse(env.get_data(transfer_id));
                    env.clear_data(transfer_id);
                    env.ft_transfer(receiver_id, refund_amount);
                }
                `,
      },
    });

    expect(
      await contract.view("ft_balance_of", { account_id: "bob.test.near" }),
    ).to.equal(1_000_000n.toString());

    const transfer_id = await bob.call(
      accountId,
      "call_js_func",
      {
        function_name: "transfer_2_000_to_alice",
      },
      {
        attachedDeposit: "1",
      },
    );

    expect(
      await contract.view("ft_balance_of", { account_id: "bob.test.near" }),
    ).to.equal(998_000n.toString());
    expect(
      await contract.view("ft_balance_of", { account_id: "alice.test.near" }),
    ).to.equal(2_000n.toString());
    await alice.call(
      accountId,
      "call_js_func",
      {
        function_name: "refund",
        transfer_id,
      },
      {
        attachedDeposit: "1",
      },
    );
    expect(
      await contract.view("ft_balance_of", { account_id: "bob.test.near" }),
    ).to.equal(999_000n.toString());
    expect(
      await contract.view("ft_balance_of", { account_id: "alice.test.near" }),
    ).to.equal(1_000n.toString());
  });

  test(
    "should not double gas usage when calling transfer via JS",
    { only: false },
    async () => {
      const nearConnection = await connect(connectionConfig);
      const accountId = contract.accountId;

      const account = await nearConnection.account(accountId);
      await account.functionCall({
        contractId: accountId,
        methodName: "post_javascript",
        gas: "300000000000000",
        args: {
          javascript: `
                export function ft_transfer_js() {
                    const { amount, receiver_id } = JSON.parse(env.input());
                    env.ft_transfer(receiver_id, amount);
                }
                `,
        },
      });

      let result = await bob.callRaw(
        accountId,
        "call_js_func",
        {
          function_name: "ft_transfer_js",
          receiver_id: "alice.test.near",
          amount: "2000",
        },
        {
          attachedDeposit: "1",
        },
      );
      expect(
        await contract.view("ft_balance_of", { account_id: "alice.test.near" }),
      ).to.equal(2_000n.toString());
      const totalGasBurntJS = result.result.receipts_outcome.reduce(
        (prev, receipt_outcome) => prev + receipt_outcome.outcome.gas_burnt,
        0,
      );
      result = await bob.callRaw(
        accountId,
        "ft_transfer",
        {
          receiver_id: "alice.test.near",
          amount: "2000",
        },
        {
          attachedDeposit: "1",
        },
      );
      expect(
        await contract.view("ft_balance_of", { account_id: "alice.test.near" }),
      ).to.equal(4_000n.toString());
      const totalGasBurnt = result.result.receipts_outcome.reduce(
        (prev, receipt_outcome) => prev + receipt_outcome.outcome.gas_burnt,
        0,
      );

      expect(totalGasBurntJS / totalGasBurnt).to.be.lessThan(2.0);
    },
  );

  test(
    "should run custom javascript transfer functions in contract with function access keys, and without attaching deposits",
    { only: true },
    async () => {
      const nearConnection = await connect(connectionConfig);
      const accountId = contract.accountId;

      const account = await nearConnection.account(accountId);
      const javascript = `
                export function start_ai_conversation() {
                    const amount = 2_000n;
                    let conversation_id = env.signer_account_id()+"_"+(new Date().getTime());
                    env.set_data(conversation_id, JSON.stringify({receiver_id: env.signer_account_id(), amount: amount.toString() }));
                    env.ft_transfer_internal(env.signer_account_id(), 'bob.test.near', amount.toString());
                    env.value_return(conversation_id);
                }

                export function view_ai_conversation() {
                    const { conversation_id } = JSON.parse(env.input());
                    env.value_return(env.get_data(conversation_id));
                }

                export function refund_unspent() {
                    const { refund_message, signature } = JSON.parse(env.input());
                    const public_key = new Uint8Array([${Array.from((await bob.getKey()).getPublicKey().data).toString()}]);

                    const signature_is_valid = env.ed25519_verify(new Uint8Array(signature), new Uint8Array(env.sha256_utf8(refund_message)) , public_key);
                    if (signature_is_valid) {
                        print("REFUNDING");
                        const { receiver_id, refund_amount } = JSON.parse(refund_message);
                        env.ft_transfer_internal('bob.test.near', receiver_id, refund_amount);
                    } else {
                        print("INVALID SIGNATURE");
                    }
                }
`;

      await account.functionCall({
        contractId: accountId,
        methodName: "post_javascript",
        gas: "300000000000000",
        args: {
          javascript,
        },
      });

      await bob.call(
        accountId,
        "ft_transfer",
        {
          receiver_id: "alice.test.near",
          amount: 2000n.toString(),
        },
        {
          attachedDeposit: 1n.toString(),
        },
      );

      const conversation_id = await alice.call(accountId, "call_js_func", {
        function_name: "start_ai_conversation",
      });

      expect(conversation_id.split("_")[0]).to.equal("alice.test.near");
      expect(
        await contract.view("ft_balance_of", { account_id: "alice.test.near" }),
      ).to.equal(0n.toString());
      const conversation_data = await contract.view("view_js_func", {
        function_name: "view_ai_conversation",
        conversation_id,
      });

      expect(conversation_data.receiver_id).to.equal("alice.test.near");
      expect(conversation_data.amount).to.equal(2000n.toString());

      const refund_message = JSON.stringify({
        receiver_id: "alice.test.near",
        refund_amount: 1000n.toString(),
      });
      const refund_message_hashed = createHash("sha256")
        .update(Buffer.from(refund_message, "utf8"))
        .digest();
      const signature = (await bob.getKey()).sign(
        Uint8Array.from(refund_message_hashed),
      );

      await bob.call(accountId, "call_js_func", {
        function_name: "refund_unspent",
        signature: Array.from(signature.signature),
        refund_message,
      });

      expect(
        await contract.view("ft_balance_of", { account_id: "alice.test.near" }),
      ).to.equal(1_000n.toString());
    },
  );

  test("should support web4", { only: false }, async () => {
    const nearConnection = await connect(connectionConfig);
    const accountId = contract.accountId;

    const account = await nearConnection.account(accountId);
    await account.functionCall({
      contractId: accountId,
      methodName: "post_javascript",
      gas: "300000000000000",
      args: {
        javascript: `
                export function web4_get() {
    const request = JSON.parse(env.input()).request;

    let response;

    if (request.path == '/index.html') {
        response = {
            contentType: 'text/html; charset=UTF-8',
            body:  env.base64_encode('<html><body>hello</body></html>')
        };
    }
    env.value_return(JSON.stringify(response));
}
                `,
      },
    });

    const web4Response = await contract.view("web4_get", {
      request: { path: "/index.html" },
    });
    expect(web4Response.contentType).to.equal("text/html; charset=UTF-8");
    expect(web4Response.body).to.equal(
      Buffer.from("<html><body>hello</body></html>").toString("base64"),
    );
  });
});
