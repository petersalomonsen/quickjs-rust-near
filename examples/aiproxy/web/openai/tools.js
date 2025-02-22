import { getContractInstanceExports } from "../contract-runner/contract-runner.js";

export const toolImplementations = {
  run_javascript: async function ({ script }) {
    const wasmbinary = new Uint8Array(
      await fetch(
        "https://ipfs.web4.near.page/ipfs/bafybeihtj6sxfflbxpoq3lr2l3llxberlqah7pfc36cr5dpij2pen6pfs4/minimumweb4/out/minimum_web4.wasm",
      ).then((r) => r.arrayBuffer()),
    );

    const { exports, nearenv } = await getContractInstanceExports(wasmbinary);
    nearenv.set_args({
      javascript: `export async function custom() {
          env.value_return(
            JSON.stringify(await (async () => {
                ${script}
              })()
            )
          );
        }
        `,
    });
    exports.post_javascript();
    nearenv.set_args({ function_name: "custom" });
    exports.call_js_func();
    return nearenv.latest_return_value;
  },
  run_javascript_in_web4_simulator: async function ({ script }) {
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
    try {
      exports.web4_get();    
      return atob(JSON.parse(nearenv.latest_return_value).body);
    } catch(e) {
      return `There was an error parsing the results: ${e}.

Here are the logs from the Javascript engine:

${nearenv._logs.join("\n")}
`;
    }
  },
  deploy_javascript_to_web4_contract: async function({ contract_id, script }) {
    return `Javascript module code successfully deployed to ${contract_id}. Go to https://${contract_id}.page to see the results`;
  }
};

export const tools = [
  {
    type: "function",
    function: {
      name: "run_javascript",
      description:
        "Run javascript snippet in a secure sandbox where there is no access to NPM libraries, NodeJS APIs or web APIs. For the result to be passed correctly the snippet needs to end with a `return` statement with the result value.",
      parameters: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: "Javascript snippet",
          },
        },
        additionalProperties: false,
        required: ["script"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_javascript_in_web4_simulator",
      description: `Run javascript module in a smart contract simulator that serves a web page through the web4_get function.
There is no access to NPM libraries, NodeJS APIs or web APIs.
        
Here is a minimal example of implementing the \`web4_get\` function:

\`\`\`javascript
export function web4_get() {
    const request = JSON.parse(env.input()).request;

    let response;

    if (request.path === '/') {
        response = {
            contentType: "text/html; charset=UTF-8",
            body: env.base64_encode(\`<!DOCTYPE html>
<html>
<head>
</head>
<body>
<h1>Hello from \${env.current_account_id()}</h1>
</body>
<html>\`)
        };
    }
    env.value_return(JSON.stringify(response));
}
\`\`\`
        
`,
      parameters: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: "Javascript module source",
          },
        },
        additionalProperties: false,
        required: ["script"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deploy_javascript_to_web4_contract",
      description: `Deploy javascript to web4 contract on chain. Should be verified in the simulator first.`,
      parameters: {
        type: "object",
        properties: {
          contract_id: {
            type: "string",
            description: "NEAR account ID where web4 contract is deployed",
          },
          script: {
            type: "string",
            description: "Javascript module source to post to the web4 contract",
          },
        },
        additionalProperties: false,
        required: ["contract_id", "script"],
      },
    },
  }
];
