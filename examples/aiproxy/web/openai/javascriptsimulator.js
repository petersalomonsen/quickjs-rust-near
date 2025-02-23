import { getContractInstanceExports } from "../contract-runner/contract-runner.js";

export async function run_javascript_in_web4_simulator({ script }) {
  const wasmbinary = new Uint8Array(
    await fetch(
      "https://ipfs.web4.near.page/ipfs/bafybeihtj6sxfflbxpoq3lr2l3llxberlqah7pfc36cr5dpij2pen6pfs4/minimumweb4/out/minimum_web4.wasm",
    ).then((r) => r.arrayBuffer()),
  );

  const { exports, nearenv } = await getContractInstanceExports(wasmbinary);
  nearenv.reset_near_env();
  nearenv.set_args({
    javascript: script,
  });
  exports.post_javascript();
  nearenv.set_args({ request: { path: "/" } });
  exports.web4_get();

  return {
    result: nearenv.latest_return_value,
    logs: nearenv._logs,
  };
}
