import { readFile } from "fs/promises";
import { getContractInstanceExports } from "../../../localjstestenv/contract-runner.js";
import { test } from "node:test";
import { expect } from "chai";

test("only token owner should be able to burn", async () => {
  const { exports, nearenv } = await getContractInstanceExports(
    await readFile(new URL("../out/nft.wasm", import.meta.url)),
  );
  exports.new();
  expect(nearenv.storage["STATE"]).to.be.an("Uint8Array");
  nearenv.set_args({
    javascript: (
      await readFile(new URL("../src/contract.js", import.meta.url))
    ).toString(),
  });
  exports.post_javascript();

  const token_id = "burn_me";
  const token_owner_id = "theburner";

  nearenv.set_args({ token_id, token_owner_id });
  nearenv.set_attached_deposit(11990000000000000000000n);
  exports.nft_mint();

  nearenv.set_args({ token_id });
  exports.nft_token();
  expect(JSON.parse(nearenv.latest_return_value).owner_id).to.equal(
    token_owner_id,
  );

  nearenv.set_attached_deposit(1n);
  expect(() => {
    exports.nft_burn();
  }).to.throw("ERR_NOT_OWNER");

  exports.nft_token();
  expect(JSON.parse(nearenv.latest_return_value).owner_id).to.equal(
    token_owner_id,
  );

  nearenv.set_predecessor_account_id(token_owner_id);
  exports.nft_burn();

  exports.nft_token();
  expect(JSON.parse(nearenv.latest_return_value)).to.be.null;
});
