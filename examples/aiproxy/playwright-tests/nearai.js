import { responses } from "./nearairesponses.js";

/**
 * Sets up the local storage and routes for the Playwright page.
 *
 * @param {Object} params - The parameters for the setup.
 * @param {import('playwright').Page} params.page - The Playwright page object.
 * @returns {Promise<Object>} The setup data including contractId, accountId, and publicKey.
 */
export async function setupStorage({ page, withAuthObject = false }) {
  const { functionAccessKeyPair, publicKey, accountId, contractId } =
    await fetch("http://localhost:14501").then((r) => r.json());

  await page.goto("/");
  await page.evaluate(
    ({
      accountId,
      publicKey,
      functionAccessKeyPair,
      contractId,
      withAuthObject,
    }) => {
      localStorage.setItem(
        "near_app_wallet_auth_key",
        JSON.stringify({ accountId, allKeys: [publicKey] }),
      );
      localStorage.setItem(
        `near-api-js:keystore:${accountId}:mainnet`,
        functionAccessKeyPair,
      );
      localStorage.setItem(`contractId`, contractId);
      localStorage.setItem(
        "near-wallet-selector:selectedWalletId",
        JSON.stringify("my-near-wallet"),
      );
      localStorage.setItem(
        "near-wallet-selector:recentlySignedInWallets",
        JSON.stringify(["my-near-wallet"]),
      );
      localStorage.setItem(
        "near-wallet-selector:contract",
        JSON.stringify({ contractId, methodNames: ["call_js_func"] }),
      );
      if (withAuthObject) {
        localStorage.setItem(
          "NearAIAuthObject",
          JSON.stringify({
            message: "Login to NEAR AI",
            nonce: "1740337238663",
            recipient: "ai.near",
            callback_url: "http://127.0.0.1:8080/",
          }),
        );
      }
    },
    { accountId, publicKey, functionAccessKeyPair, contractId, withAuthObject },
  );

  await page.reload();
  return { contractId, accountId, publicKey, functionAccessKeyPair };
}

/**
 * Mock NEAR AI chat completion API, which has the same payload as the OpenAI chat completions API.
 * @param {Object} params - The parameters for the setup.
 * @param {import('playwright').Page} params.page - The Playwright page object.
 */
export async function setupNearAIRoute({ page }) {
  await page.route("https://api.near.ai/v1/chat/completions", async (route) => {
    const postdata = JSON.parse(route.request().postData());
    const lastMessage = postdata.messages[postdata.messages.length - 1];
    
    // Check if this is a tool call result
    if (lastMessage.tool_call_id) {
      const response = handleToolCallResult(postdata, lastMessage);
      await route.fulfill({
        json: response,
      });
      return;
    }
    
    // Regular message handling
    const message = lastMessage.content;
    const response =
      typeof responses[message] === "function"
        ? responses[message](postdata)
        : (responses[message] ?? responses["Hello"]);
    await route.fulfill({
      json: response,
    });
  });
}

/**
 * Handle responses to tool calls
 * @param {Object} postdata - The full POST data
 * @param {Object} lastMessage - The last message with tool_call_id
 * @returns {Object} The response
 */
function handleToolCallResult(postdata, lastMessage) {
  // Find the tool call that this is a response to
  const toolCallId = lastMessage.tool_call_id;
  const toolCallName = findToolCallName(postdata.messages, toolCallId);
  
  if (!toolCallName) {
    return responses["Hello"]; // Default response if we can't find the tool call
  }
  
  // Check if we have a specific handler for this tool
  if (toolCallResponses[toolCallName]) {
    return toolCallResponses[toolCallName](postdata, lastMessage);
  }
  
  // Generic acknowledgment response
  return {
    id: `tool-result-${Date.now()}`,
    choices: [
      {
        finish_reason: "stop",
        index: 0,
        logprobs: null,
        message: {
          content: `I've processed the result of the ${toolCallName} tool call. Thank you.`,
          refusal: null,
          role: "assistant",
          audio: null,
          function_call: null,
          tool_calls: null,
        },
      },
    ],
    created: Date.now() / 1000,
    model: "accounts/fireworks/models/tool-response",
    object: "chat.completion",
    service_tier: null,
    system_fingerprint: null,
    usage: {
      completion_tokens: 15,
      prompt_tokens: 100,
      total_tokens: 115,
    },
  };
}

/**
 * Find the tool call name based on the tool call ID
 * @param {Array} messages - All messages in the conversation
 * @param {string} toolCallId - The ID of the tool call
 * @returns {string|null} The name of the tool call or null if not found
 */
function findToolCallName(messages, toolCallId) {
  for (const message of messages) {
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.id === toolCallId) {
          return toolCall.function?.name || null;
        }
      }
    }
  }
  return null;
}

// Map of tool call names to their respective response handlers
const toolCallResponses = {
  inspect_contract_tools: (postdata, lastMessage) => {
    // Parse the result from the tool call
    const toolResult = lastMessage.content;
    let toolDefinitions = [];
    try {
      toolDefinitions = JSON.parse(toolResult);
    } catch (e) {
      // Handle parse error
    }
    
    // Create a summary of the available tools
    const toolSummary = toolDefinitions.length > 0
      ? `The contract provides ${toolDefinitions.length} tools: ${toolDefinitions.map(t => t.name).join(", ")}`
      : "No tools were found for this contract.";
    
    return {
      id: `inspect-tools-${Date.now()}`,
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          logprobs: null,
          message: {
            content: `I've inspected the contract's tools. ${toolSummary}\n\nHere are the full tool definitions:\n\`\`\`json\n${JSON.stringify(toolDefinitions, null, 2)}\n\`\`\``,
            refusal: null,
            role: "assistant",
            audio: null,
            function_call: null,
            tool_calls: null,
          },
        },
      ],
      created: Date.now() / 1000,
      model: "accounts/fireworks/models/tool-inspector",
      object: "chat.completion",
      usage: {
        completion_tokens: 50,
        prompt_tokens: 100,
        total_tokens: 150,
      },
    };
  },
  
  select_contract_for_tools: (postdata, lastMessage) => {
    const content = lastMessage.content;
    return {
      id: `select-contract-${Date.now()}`,
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          logprobs: null,
          message: {
            content: `${content}\n\nI'll now use this contract's tools for our conversation. You can ask about the tools available by asking "Which tools do you have?"`,
            refusal: null,
            role: "assistant",
            audio: null,
            function_call: null,
            tool_calls: null,
          },
        },
      ],
      created: Date.now() / 1000,
      model: "accounts/fireworks/models/contract-selector",
      object: "chat.completion",
      usage: {
        completion_tokens: 30,
        prompt_tokens: 80,
        total_tokens: 110,
      },
    };
  },
  
  test_tool: (postdata, lastMessage) => {
    // Parse the arguments from the original tool call
    let args = {};
    try {
      // Find the original tool call to extract arguments
      for (const message of postdata.messages) {
        if (message.tool_calls) {
          for (const toolCall of message.tool_calls) {
            if (toolCall.function?.name === "test_tool") {
              args = JSON.parse(toolCall.function.arguments);
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to parse test_tool arguments:", e);
    }
    
    return {
      id: `test-tool-${Date.now()}`,
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          logprobs: null,
          message: {
            content: `The NFT minting process completed successfully. Your new NFT titled "${args.foo}" has been created. You can view it in your collection now.`,
            refusal: null,
            role: "assistant",
            audio: null,
            function_call: null,
            tool_calls: null,
          },
        },
      ],
      created: Date.now() / 1000,
      model: "accounts/fireworks/models/nft-mint",
      object: "chat.completion",
      usage: {
        completion_tokens: 35,
        prompt_tokens: 90,
        total_tokens: 125,
      },
    };
  }
};
