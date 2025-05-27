export const responses = {
  Hello: {
    id: "1ab9dc62-95ca-44e9-aa27-d5fbbbb43c08",
    choices: [
      {
        finish_reason: "stop",
        index: 0,
        logprobs: null,
        message: {
          content: "Hello! How can I assist you today?",
          refusal: null,
          role: "assistant",
          audio: null,
          function_call: null,
          tool_calls: null,
        },
      },
    ],
    created: 1740235568,
    model: "accounts/fireworks/models/qwen2p5-72b-instruct",
    object: "chat.completion",
    service_tier: null,
    system_fingerprint: null,
    usage: {
      completion_tokens: 10,
      prompt_tokens: 208,
      total_tokens: 218,
      completion_tokens_details: null,
      prompt_tokens_details: null,
    },
  },
  "I want to buy some tokens": {
    id: "ec762fa5-d7ff-458e-a17e-2cf8b79a2ccb",
    choices: [
      {
        finish_reason: "tool_calls",
        index: 0,
        logprobs: null,
        message: {
          content: null,
          refusal: null,
          role: "assistant",
          audio: null,
          function_call: null,
          tool_calls: [
            {
              id: "call_HazLRPmkNi0dzHrAmscxD5Yq",
              function: {
                arguments: "{}",
                name: "buy_fungible_tokens",
              },
              type: "function",
              index: 0,
            },
          ],
        },
      },
    ],
    created: 1740858973,
    model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    object: "chat.completion",
    service_tier: null,
    system_fingerprint: null,
    usage: {
      completion_tokens: 17,
      prompt_tokens: 833,
      total_tokens: 850,
      completion_tokens_details: null,
      prompt_tokens_details: null,
    },
  },
  "Can you create a web4 javascript code that shows the current account and current date?":
    {
      id: "ed2c8f7c-e7a2-4e4c-8d81-a15c0562d9c3",
      choices: [
        {
          finish_reason: "tool_calls",
          index: 0,
          logprobs: null,
          message: {
            content:
              "Sure! I'll create a minimal example of a web4 JavaScript module that displays the current account ID and the current date when the page is served. Let's write the code and test it in the simulator.\n",
            refusal: null,
            role: "assistant",
            audio: null,
            function_call: null,
            tool_calls: [
              {
                id: "call_FdOsUSgqIyvbqovn63zrhDdL",
                function: {
                  arguments:
                    '{"script": "export function web4_get() {\\n    const request = JSON.parse(env.input()).request;\\n\\n    const accountId = env.current_account_id();\\n    const currentDate = new Date().toISOString().split(\'T\')[0];\\n\\n    const response = {\\n        contentType: \\"text/html; charset=UTF-8\\",\\n        body: env.base64_encode(`<!DOCTYPE html>\\n<html>\\n<head>\\n</head>\\n<body>\\n<h1>Account: ${accountId}</h1>\\n<h2>Date: ${currentDate}</h2>\\n</body>\\n</html>`)\\n    };\\n\\n    env.value_return(JSON.stringify(response));\\n}\\n"}',
                  name: "run_javascript_in_web4_simulator",
                },
                type: "function",
                index: 0,
              },
            ],
          },
        },
      ],
      created: 1740336707,
      model: "accounts/fireworks/models/qwen2p5-72b-instruct",
      object: "chat.completion",
      service_tier: null,
      system_fingerprint: null,
      usage: {
        completion_tokens: 351,
        prompt_tokens: 693,
        total_tokens: 1044,
        completion_tokens_details: null,
        prompt_tokens_details: null,
      },
    },
  "Can you create a web4 account named myweb4test.near?": {
    id: "c25b4c73-c0ce-4fa1-beba-565d1dbb55da",
    choices: [
      {
        finish_reason: "tool_calls",
        index: 0,
        logprobs: null,
        message: {
          content: null,
          refusal: null,
          role: "assistant",
          audio: null,
          function_call: null,
          tool_calls: [
            {
              id: "call_dQAzFNkWPUV3nUqXJjvBL9dv",
              function: {
                arguments: '{"new_account_id": "myweb4test.near"}',
                name: "create_new_web4_contract_account",
              },
              type: "function",
              index: 0,
            },
          ],
        },
      },
    ],
    created: 1740913358,
    model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    object: "chat.completion",
    service_tier: null,
    system_fingerprint: null,
    usage: {
      completion_tokens: 29,
      prompt_tokens: 840,
      total_tokens: 869,
      completion_tokens_details: null,
      prompt_tokens_details: null,
    },
  },
  "Which tools do you have?": async ({ postdata }) => {
    const toolNames = (postdata.tools || []).map((t) => t.function.name);
    return {
      id: "tools-list-123",
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          logprobs: null,
          message: {
            content: `The following tools are available: ${toolNames.join(", ")}.`,
            refusal: null,
            role: "assistant",
            audio: null,
            function_call: null,
            tool_calls: null,
          },
        },
      ],
      created: Date.now() / 1000,
      model: "accounts/fireworks/models/ai-tools-list",
      object: "chat.completion",
      service_tier: null,
      system_fingerprint: null,
      usage: {
        completion_tokens: 10,
        prompt_tokens: 100,
        total_tokens: 110,
        completion_tokens_details: null,
        prompt_tokens_details: null,
      },
    };
  },
  "Which tools are available for the contract webassemblymusic.near?": {
    id: "ec762fa5-d7ff-458e-a17e-2cf8b79a2ccb",
    choices: [
      {
        finish_reason: "tool_calls",
        index: 0,
        logprobs: null,
        message: {
          content:
            "I'll check what tools are available for the webassemblymusic.near contract.",
          refusal: null,
          role: "assistant",
          audio: null,
          function_call: null,
          tool_calls: [
            {
              id: "call_inspect_tools_123",
              function: {
                arguments: '{"contract_id": "webassemblymusic.near"}',
                name: "inspect_contract_tools",
              },
              type: "function",
              index: 0,
            },
          ],
        },
      },
    ],
    created: 1740858973,
    model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    object: "chat.completion",
    service_tier: null,
    system_fingerprint: null,
    usage: {
      completion_tokens: 17,
      prompt_tokens: 833,
      total_tokens: 850,
      completion_tokens_details: null,
      prompt_tokens_details: null,
    },
  },
  "Please select webassemblymusic.near as the contract for tools": {
    id: "sel-contract-tools-123",
    choices: [
      {
        finish_reason: "tool_calls",
        index: 0,
        logprobs: null,
        message: {
          content: "I'll set the webassemblymusic.near contract for tools.",
          refusal: null,
          role: "assistant",
          tool_calls: [
            {
              id: "call_select_contract_456",
              function: {
                arguments: '{"contract_id": "webassemblymusic.near"}',
                name: "select_contract_for_tools",
              },
              type: "function",
              index: 0,
            },
          ],
        },
      },
    ],
    created: 1740858974,
    model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    object: "chat.completion",
    service_tier: null,
    system_fingerprint: null,
    usage: {
      completion_tokens: 20,
      prompt_tokens: 830,
      total_tokens: 850,
    },
  },
  "Please store my signing key for NFT access": {
    id: "store-key-123",
    choices: [
      {
        finish_reason: "tool_calls",
        index: 0,
        logprobs: null,
        message: {
          content: "I'll store your signing key for NFT access",
          refusal: null,
          role: "assistant",
          tool_calls: [
            {
              id: "call_store_signing_key_789",
              function: {
                arguments: "{}", // No arguments for store_signing_key as per its definition
                name: "store_signing_key", // This will be a dynamic tool
              },
              type: "function",
              index: 0,
            },
          ],
        },
      },
    ],
    created: 1740858975,
    model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    object: "chat.completion",
    service_tier: null,
    system_fingerprint: null,
    usage: {
      completion_tokens: 20,
      prompt_tokens: 830,
      total_tokens: 850,
    },
  },
  "I need the WebAssembly synthesizer for my NFT with token_id 123": {
    id: "get-synth-123",
    choices: [
      {
        finish_reason: "tool_calls",
        index: 0,
        logprobs: null,
        message: {
          content:
            "I'll help you retrieve the WebAssembly synthesizer for your NFT",
          refusal: null,
          role: "assistant",
          tool_calls: [
            {
              id: "call_get_synth_wasm_abc",
              function: {
                arguments: '{"token_id": "123"}', // AI provides token_id
                name: "get_synth_wasm", // This is the dynamic tool
              },
              type: "function",
              index: 0,
            },
          ],
        },
      },
    ],
    created: 1740858976,
    model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    object: "chat.completion",
    service_tier: null,
    system_fingerprint: null,
    usage: {
      completion_tokens: 25,
      prompt_tokens: 840,
      total_tokens: 865,
    },
  },
  "Can I access the locked content for my NFT with token_id 123?": {
    id: "check-locked-content-123",
    choices: [
      {
        finish_reason: "tool_calls",
        index: 0,
        logprobs: null,
        message: {
          content:
            "I'll check if you can access the locked content for your NFT.", // AI confirms the action
          refusal: null,
          role: "assistant",
          tool_calls: [
            {
              id: "call_get_locked_content_xyz", // New call ID
              function: {
                arguments: '{"token_id": "123"}', // AI provides token_id
                name: "get_locked_content", // New tool name
              },
              type: "function",
              index: 0,
            },
          ],
        },
      },
    ],
    created: 1740858977, // Adjusted timestamp
    model: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    object: "chat.completion",
  },
  "Please add an accesskey for interacting with webassemblymusic.near": {
    id: "2cd9dc62-95ca-44e9-aa27-d5fbbbb43c09",
    choices: [
      {
        finish_reason: "tool_calls",
        index: 0,
        logprobs: null,
        message: {
          content: null,
          refusal: null,
          role: "assistant",
          audio: null,
          function_call: null,
          tool_calls: [
            {
              id: "call_add_key_for_contract_123",
              function: {
                arguments: '{"contract_id": "webassemblymusic.near"}',
                name: "add_key_for_contract",
              },
              type: "function",
              index: 0,
            },
          ],
        },
      },
    ],
    created: 1740235569,
    model: "accounts/fireworks/models/qwen2p5-72b-instruct",
    object: "chat.completion",
  },
};
