import { getContractInstanceExports } from "../contract-runner/contract-runner.js";
import { InMemorySigner, keyStores, connect } from "near-api-js";
import { run_javascript_in_web4_simulator } from "./javascriptsimulator.js";
import { confirmModal } from "../ui/confirm-modal.js";
import { ToolSandbox } from "./sandbox.js"; // Import ToolSandbox

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
  nodeUrl: "http://localhost:14500",
  keyStore,
});

const fungible_token_contract_id = localStorage.getItem("contractId");
let ft_metadata;
/**
 * @type {import('near-api-js').Account}
 */
let connectedAccount;

/**
 * @param newWalletSelector {import('@near-wallet-selector/core').WalletSelector}
 */
export async function setWalletSelector(newWalletSelector) {
  walletSelector = newWalletSelector;

  /**
   * @type — {import('@near-wallet-selector/core').WalletSelector}
   */
  let selectedWallet;
  try {
    selectedWallet = await walletSelector.wallet();
  } catch (e) {}

  if (selectedWallet) {
    const accounts = await selectedWallet.getAccounts();
    if (accounts.length > 0) {
      const account = accounts[0];
      connectedAccount = await nearConnection.account(account.accountId);
      ft_metadata = await connectedAccount.viewFunction({
        contractId: fungible_token_contract_id,
        methodName: "ft_metadata",
      });
    }
  }
}

let toolContractId = null;
let dynamicToolDefinitions = [];

export const setToolContract = async (
  contractId,
  account = connectedAccount,
) => {
  toolContractId = contractId;
  localStorage.setItem("toolContractId", contractId);
  // Fetch tool definitions from the contract
  if (!account) throw new Error("No connected account");
  try {
    const defs = await account.viewFunction({
      contractId,
      methodName: "call_js_func",
      args: {
        function_name: "get_ai_tool_definitions",
      },
    });
    dynamicToolDefinitions = defs;
    return `Tool contract set to ${contractId} and loaded ${defs.length} tool definitions.`;
  } catch (e) {
    dynamicToolDefinitions = [];
    throw new Error(
      `Failed to fetch tool definitions from ${contractId}: ${e}`,
    );
  }
};

export const getToolContract = () => {
  return (
    toolContractId ||
    localStorage.getItem("toolContractId") ||
    fungible_token_contract_id
  );
};

/**
 * Call a tool function on a contract
 * @param {string} contractId - The contract ID to call
 * @param {string} toolName - The name of the tool to call
 * @param {object} args - The arguments to pass to the tool
 * @param {import('@near-wallet-selector/core').WalletSelector} [currentWalletSelector=walletSelector] - The current wallet selector instance
 * @param {import('near-api-js').Account} [currentConnectedAccount=connectedAccount] - The current connected account instance
 * @param {Array<object>|null} [currentDynamicToolDefinitions=dynamicToolDefinitions] - The current dynamic tool definitions
 * @param {boolean} [skipClientImplementation=false] - Flag to skip clientImplementation execution (used by sandbox)
 * @returns {Promise<any>} - The result of the tool call
 */
export const callContractTool = async (
  contractId,
  toolName,
  args,
  currentWalletSelector = walletSelector,
  currentConnectedAccount = connectedAccount,
  currentDynamicToolDefinitions = dynamicToolDefinitions,
  skipClientImplementation = false,
) => {
  if (!currentConnectedAccount) {
    throw new Error("No connected account");
  }

  const toolDef = (currentDynamicToolDefinitions || []).find(
    (t) => t.name === toolName,
  );

  if (!toolDef) {
    throw new Error(`Tool definition for '${toolName}' not found.`);
  }

  // Handle clientImplementation if it exists and not skipping
  if (toolDef.clientImplementation && !skipClientImplementation) {
    // Pass currentDynamicToolDefinitions to the sandbox constructor
    const sandbox = new ToolSandbox(currentWalletSelector, currentConnectedAccount, currentDynamicToolDefinitions, callContractTool);
    try {
      console.log(`Executing clientImplementation for ${toolName} with args:`, args);
      // The clientImplementation script itself is now responsible for calling callToolOnContract
      // which will eventually call this function again but with skipClientImplementation = true.
      const result = await sandbox.executeClientImplementation(toolDef.clientImplementation, args);
      console.log(`clientImplementation for ${toolName} executed successfully, result:`, result);
      return result;
    } catch (e) {
      console.error(`Error executing clientImplementation for ${toolName}:`, e);
      throw new Error(
        `Failed to execute client-side logic for tool ${toolName}: ${e.message}`,
      );
    }
  }

  // Proceed with direct contract call if no clientImplementation or if skipped
  const requiresTx = toolDef.requires_transaction;

  try {
    if (requiresTx) {
      const selectedWallet = await currentWalletSelector.wallet();
      const transactionResult = await selectedWallet.signAndSendTransaction({
        receiverId: contractId,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "call_js_func",
              args: {
                function_name: toolName,
                ...args,
              },
              gas: "300000000000000", // 300 TGas, ensure this is a string
              deposit: "0",
            },
          },
        ],
      });
      return JSON.stringify(transactionResult); // Or handle more specific result parsing if needed
    } else {
      const viewResult = await currentConnectedAccount.viewFunction({
        contractId,
        methodName: "call_js_func",
        args: {
          function_name: toolName,
          ...args,
        },
      });
      return viewResult;
    }
  } catch (e) {
    console.error(`Error calling contract tool ${toolName} on contract ${contractId}:`, e);
    if (e.message && e.message.includes("SyntaxError: unexpected token")) {
      throw new Error(
        `Failed to call contract tool ${toolName}: The arguments could not be properly parsed by the contract. Please make sure the arguments format is correct. Original error: ${e.message}`,
      );
    } else if (e.message && e.message.includes("TypeError: Cannot read properties of undefined (reading 'args')")) {
        throw new Error(
            `Failed to call contract tool ${toolName} on ${contractId}: Contract error, possibly due to incorrect arguments structure or missing arguments. Original error: ${e.message}`
        );
    } else {
      throw new Error(`Failed to call contract tool ${toolName} on ${contractId}: ${e.message}`);
    }
  }
};

// Tool implementation
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
    const account_id = connectedAccount.accountId;
    const storage_balance = await connectedAccount.viewFunction({
      contractId: fungible_token_contract_id,
      methodName: "storage_balance_of",
      args: { account_id },
    });
    const actions = [];
    if (storage_balance === null) {
      actions.push({
        type: "FunctionCall",
        params: {
          methodName: "storage_deposit",
          args: {
            account_id,
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
        `Buy ${ft_metadata.symbol} <img src="${ft_metadata.icon}" style="height: 20px"> tokens`,
        `Do you want to buy 3 ${ft_metadata.symbol} <img src="${ft_metadata.icon}" style="height: 20px"> tokens for 0.5 NEAR? ${storage_balance === null ? `Also additional 0.1 NEAR are required for registering with the Fungible Token contract.` : ""}`,
      )
    ) {
      const selectedWallet = await walletSelector.wallet();
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
  select_contract_for_tools: async function ({ contract_id }) {
    return await setToolContract(contract_id);
  },
  inspect_contract_tools: async function ({ contract_id }) {
    if (!connectedAccount) throw new Error("No connected account");
    try {
      const defs = await connectedAccount.viewFunction({
        contractId: contract_id,
        methodName: "call_js_func",
        args: {
          function_name: "get_ai_tool_definitions",
        },
      });
      return JSON.stringify(defs);
    } catch (e) {
      throw new Error(
        `Failed to fetch tool definitions from ${contract_id}: ${e}`,
      );
    }
  },
};

// When returning tool definitions, include dynamic ones if set
export const toolDefinitions = async () => {
  if (dynamicToolDefinitions.length > 0) {
    return [
      // Optionally, include the select_contract_for_tools tool always
      {
        type: "function",
        function: {
          name: "select_contract_for_tools",
          description:
            "Select which NEAR smart contract to use for fetching tool definitions and tool calls.",
          parameters: {
            type: "object",
            properties: {
              contract_id: {
                type: "string",
                description:
                  "The NEAR account ID of the contract to use for tools.",
              },
            },
            required: ["contract_id"],
            additionalProperties: false,
          },
        },
      },
      ...dynamicToolDefinitions,
    ];
  }
  return [
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
\`\`\``,
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
        description: `Buy ${ft_metadata?.symbol} fungible tokens to use for ChatGPT conversations. You will get 3 tokens for 0.5 NEAR.`,
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "inspect_contract_tools",
        description:
          "Fetch and display the tool definitions from a specified NEAR contract without selecting it.",
        parameters: {
          type: "object",
          properties: {
            contract_id: {
              type: "string",
              description: "The NEAR account ID of the contract to inspect.",
            },
          },
          required: ["contract_id"],
          additionalProperties: false,
        },
      },
    },
  ];
};
