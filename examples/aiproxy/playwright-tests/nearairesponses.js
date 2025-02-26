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
                    "{\"script\": \"export function web4_get() {\\n    const request = JSON.parse(env.input()).request;\\n\\n    const accountId = env.current_account_id();\\n    const currentDate = new Date().toISOString().split('T')[0];\\n\\n    const response = {\\n        contentType: \\\"text/html; charset=UTF-8\\\",\\n        body: env.base64_encode(`<!DOCTYPE html>\\n<html>\\n<head>\\n</head>\\n<body>\\n<h1>Account: ${accountId}</h1>\\n<h2>Date: ${currentDate}</h2>\\n</body>\\n</html>`)\\n    };\\n\\n    env.value_return(JSON.stringify(response));\\n}\\n\\n// Dummy functions to simulate the environment\\nconst env = {\\n    input: () => JSON.stringify({ request: { path: '/' } }),\\n    current_account_id: () => 'example-account.near',\\n    base64_encode: (str) => Buffer.from(str).toString('base64'),\\n    value_return: (str) => str\\n};\\n\\nweb4_get();\\nconsole.log(env.value_return());\\n\\n// Output the result to check if it works correctly\\nreturn env.value_return();\\n\\n// Note: In a real web4 contract, you don't need the dummy functions and the final return statement.\"}",
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
};
