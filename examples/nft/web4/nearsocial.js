export async function getNearSocialProfile(accountid) {
  const args_base64 = btoa(
    JSON.stringify({ keys: [`${accountid}/profile/**`] }),
  );
  const result = await fetch("https://rpc.mainnet.near.org", {
    method: "post",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "dontcare",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: "social.near",
        method_name: "get",
        args_base64: args_base64,
      },
    }),
  }).then((r) => r.json());

  return JSON.parse(
    result.result.result.map((r) => String.fromCharCode(r)).join(""),
  );
}
