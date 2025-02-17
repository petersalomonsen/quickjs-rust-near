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
];
