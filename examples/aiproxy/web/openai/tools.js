import { getContractInstanceExports } from "../contract-runner/contract-runner.js";
import { InMemorySigner, keyStores, connect } from "near-api-js";
import { run_javascript_in_web4_simulator } from "./javascriptsimulator.js";
import { confirmModal } from "../ui/confirm-modal.js";

/**
 * @type {import('@near-wallet-selector/core').WalletSelector}
 */
let walletSelector;

const networkId = "mainnet";
const keyStore = new keyStores.BrowserLocalStorageKeyStore(
  localStorage,
  "ai-app",
);
const signer = new InMemorySigner(keyStore);
const nearConnection = await connect({
  networkId,
  nodeUrl: "https://rpc.mainnet.near.org",
  keyStore,
});

/**
 * @param newWalletSelector {import('@near-wallet-selector/core').WalletSelector}
 */
export function setWalletSelector(newWalletSelector) {
  walletSelector = newWalletSelector;
}

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
    const result = await run_javascript_in_web4_simulator({ script });
    try {
      return atob(JSON.parse(result.result).body);
    } catch (e) {
      return `There was an error parsing the results: ${e}.

Here are the logs from the Javascript engine:

${result.logs.join("\n")}
`;
    }
  },
  deploy_javascript_to_web4_contract: async function ({ contract_id, script }) {
    const simulationResult = await run_javascript_in_web4_simulator({ script });
    try {
      const resultObj = JSON.parse(simulationResult.result);
      if (resultObj.body === undefined) {
        return `The web4_get function must return a base64 encoded body string. Here is the result: ${JSON.stringify(simulationResult)} `;
      }
      atob(resultObj.body);
    } catch (e) {
      return `Will not deploy the javascript code, since there was an error when testing it in the simulator: ${e}.

Here is the result and logs from Javascript engine:

${JSON.stringify(simulationResult)}
`;
    }
    console.log(
      "will deploy the following script, which was tested successfully locally",
      script,
    );
    console.log("simulation result was", simulationResult);
    const account = await nearConnection.account(contract_id);
    const result = await account.functionCall({
      contractId: contract_id,
      methodName: "post_javascript",
      args: { javascript: script },
    });
    if (result.status.SuccessValue !== undefined) {
      return `Javascript module code successfully deployed to ${contract_id}. Go to https://${contract_id}.page to see the results`;
    } else {
      return `There was an error deploying the JavaScript module. Here is the full result: ${JSON.stringify(result)}`;
    }
  },
  buy_fungible_tokens: async function () {
    const selectedWallet = await walletSelector.wallet();
    const account = (await selectedWallet.getAccounts())[0];
    const fungible_token_contract_id = localStorage.getItem("contractId");
    const connectedAccount = await nearConnection.account(account.accountId);
    const storage_balance = await connectedAccount.viewFunction({
      contractId: fungible_token_contract_id,
      methodName: "storage_balance_of",
      args: { account_id: account.accountId },
    });
    const actions = [];
    if (storage_balance === null) {
      actions.push({
        type: "FunctionCall",
        params: {
          methodName: "storage_deposit",
          args: {
            account_id: account.accountId,
          },
          gas: 30_000_000_000_000n.toString(),
          deposit: 100_000_000_000_000_000_000_000n.toString(),
        },
      });
    }

    actions.push({
      type: "FunctionCall",
      params: {
        methodName: "call_js_func",
        args: {
          function_name: "buy_tokens_for_near",
        },
        gas: 30_000_000_000_000n.toString(),
        deposit: 500_000_000_000_000_000_000_000n.toString(),
      },
    });
    if (
      await confirmModal(
        `Buy fungible tokens`,
        `Do you want to buy 3 tokens for 0.5 NEAR? ${storage_balance === null ? `Also additional 0.1 NEAR are required for registering with the Fungible Token contract.` : ""}`,
      )
    ) {
      const result = await selectedWallet.signAndSendTransaction({
        receiverId: fungible_token_contract_id,
        actions,
      });
      if (result.status.SuccessValue !== undefined) {
        return `Successfully bought tokens. Here is the logged event: ${result.receipts_outcome[0].outcome.logs[0]}`;
      } else {
        return `There was an error buying tokens. Here is the transaction result ${JSON.stringify(result)}`;
      }
    } else {
      return "user cancelled buying tokens";
    }
  },
  create_new_web4_contract_account: async function ({ new_account_id }) {
    const selectedWallet = await walletSelector.wallet();
    const existingPublicKey = await signer.getPublicKey(
      new_account_id,
      networkId,
    );
    if (existingPublicKey) {
      return `Can not create account ${new_account_id} since there is already an existing public key, which is ${existingPublicKey.toString()}.`;
    }

    if (
      !(await confirmModal(
        "Create account",
        "Note that 9 NEAR is required for storage. The keys to the new account will be stored in your browsers localstorage for this site.",
      ))
    ) {
      return "User cancelled account creation";
    }
    const publicKey = await signer.createKey(new_account_id, networkId);

    const result = await selectedWallet.signAndSendTransaction({
      receiverId: "web4factory.near",
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "create",
            args: {
              new_account_id,
              full_access_key: publicKey.toString(),
            },
            gas: 300_000_000_000_000n.toString(),
            deposit: 9_000_000_000_000_000_000_000_000n.toString(),
          },
        },
      ],
    });

    if (
      result.status.SuccessValue !== undefined &&
      !result.receipts_outcome.find(
        (receipt) => receipt.outcome.status.Failure !== undefined,
      )
    ) {
      return `Created new NEAR account ${new_account_id} and deployed the web4 contract to it. You may now deploy javascript code for implementing \`web4_get\` to it.`;
    } else {
      return `Failed creating new web4 account ${new_account_id}. Here are the receipt statuses ${JSON.stringify(result.receipts_outcome.map((receipt) => receipt.outcome.status))}`;
    }
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
<html>\`)};
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
            description:
              "Javascript module source to post to the web4 contract",
          },
        },
        additionalProperties: false,
        required: ["contract_id", "script"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_new_web4_contract_account",
      description: `Create a new NEAR account and deploy a web4 contract to it.`,
      parameters: {
        type: "object",
        properties: {
          new_account_id: {
            type: "string",
            description: "id of new NEAR account",
          },
        },
        additionalProperties: false,
        required: ["new_account_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buy_fungible_tokens",
      description: `Buy fungible tokens with NEAR`,
      parameters: {},
    },
  },
];
