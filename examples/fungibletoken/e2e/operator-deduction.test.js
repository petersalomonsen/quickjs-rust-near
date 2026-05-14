import { Worker } from "near-workspaces";
import { before, after, test, describe } from "node:test";
import { expect } from "chai";
import { readFile } from "fs/promises";

describe("Operator deduction", { only: true }, () => {
  /** @type {Worker} */ let worker;
  /** @type {import('near-workspaces').NearAccount} */ let root;
  /** @type {import('near-workspaces').NearAccount} */ let contract;
  /** @type {import('near-workspaces').NearAccount} */ let user;
  /** @type {import('near-workspaces').NearAccount} */ let operator;

  const STORAGE_DEPOSIT = 1_0000_0000000000_0000000000n.toString();

  before(async () => {
    worker = await Worker.init();
    root = worker.rootAccount;

    user = await root.createAccount("user.test.near");
    operator = await root.createAccount("operator.test.near");

    contract = await root.devDeploy("out/fungible_token.wasm");
    await contract.call(contract.accountId, "new_default_meta", {
      owner_id: contract.accountId,
      total_supply: 1_000_000_000_000n.toString(),
    });

    for (const acc of [user, operator]) {
      await acc.call(
        contract.accountId,
        "storage_deposit",
        { account_id: acc.accountId, registration_only: true },
        { attachedDeposit: STORAGE_DEPOSIT },
      );
    }

    // Fund the user with ARIZ-equivalent balance.
    await contract.call(
      contract.accountId,
      "ft_transfer",
      { receiver_id: user.accountId, amount: 1_000_000n.toString() },
      { attachedDeposit: 1n.toString() },
    );

    const javascript = (
      await readFile(new URL("operator-deduction.js", import.meta.url))
    ).toString();
    await contract.call(
      contract.accountId,
      "post_javascript",
      { javascript },
      { gas: "300000000000000" },
    );
  });

  after(async () => {
    await worker.tearDown();
  });

  test("authorize → deduct → view → revoke lifecycle", async () => {
    await user.call(contract.accountId, "call_js_func", {
      function_name: "authorize_deduction",
      operator_account: operator.accountId,
      max_amount_per_day: "10000",
    });

    const auth = await contract.view("view_js_func", {
      function_name: "view_authorisation",
      user: user.accountId,
      operator_account: operator.accountId,
    });
    expect(auth.max_per_day).to.equal("10000");
    expect(auth.spent_since_reset).to.equal("0");

    await operator.call(contract.accountId, "call_js_func", {
      function_name: "deduct",
      user: user.accountId,
      amount: "2500",
      description: "ariz-gateway sync 2026-05-14",
    });

    expect(
      await contract.view("ft_balance_of", { account_id: user.accountId }),
    ).to.equal((1_000_000n - 2_500n).toString());
    expect(
      await contract.view("ft_balance_of", { account_id: operator.accountId }),
    ).to.equal("2500");

    expect(
      await contract.view("view_js_func", {
        function_name: "view_spent_since_reset",
        user: user.accountId,
        operator_account: operator.accountId,
      }),
    ).to.equal("2500");

    // Exceeding the daily cap reverts.
    let exceeded;
    try {
      await operator.call(contract.accountId, "call_js_func", {
        function_name: "deduct",
        user: user.accountId,
        amount: "8000",
        description: "would exceed",
      });
    } catch (e) {
      exceeded = e;
    }
    expect(exceeded?.toString()).to.match(/daily cap exceeded/);
    expect(
      await contract.view("ft_balance_of", { account_id: operator.accountId }),
    ).to.equal("2500");

    await user.call(contract.accountId, "call_js_func", {
      function_name: "revoke_deduction",
      operator_account: operator.accountId,
    });

    let afterRevoke;
    try {
      await operator.call(contract.accountId, "call_js_func", {
        function_name: "deduct",
        user: user.accountId,
        amount: "1",
        description: "post-revoke",
      });
    } catch (e) {
      afterRevoke = e;
    }
    expect(afterRevoke?.toString()).to.match(/no authorisation/);
  });

  test("deduct from unauthorised operator panics", async () => {
    const stranger = await root.createAccount("stranger.test.near");
    await stranger.call(
      contract.accountId,
      "storage_deposit",
      { account_id: stranger.accountId, registration_only: true },
      { attachedDeposit: STORAGE_DEPOSIT },
    );

    let err;
    try {
      await stranger.call(contract.accountId, "call_js_func", {
        function_name: "deduct",
        user: user.accountId,
        amount: "1",
        description: "should fail",
      });
    } catch (e) {
      err = e;
    }
    expect(err?.toString()).to.match(/no authorisation/);
  });
});
