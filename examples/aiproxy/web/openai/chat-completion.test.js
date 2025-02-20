import { test } from "node:test";
import { equal } from "node:assert";
import { sendStreamingRequest } from "./chat-completion.js";

const responseChunksWithToolCall = [
  JSON.stringify({
    id: "chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ",
    object: "chat.completion.chunk",
    created: 1739130699,
    model: "gpt-4o-2024-08-06",
    service_tier: "default",
    system_fingerprint: "fp_50cad350e4",
    usage: null,
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content: null },
        logprobs: null,
        finish_reason: null,
      },
    ],
  }),
  JSON.stringify({
    id: "chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ",
    object: "chat.completion.chunk",
    created: 1739130699,
    model: "gpt-4o-2024-08-06",
    service_tier: "default",
    system_fingerprint: "fp_50cad350e4",
    usage: null,
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_nsnhJgZZaqiKyMvwxW9NnptH",
              type: "function",
              function: { name: "get_current_datetime", arguments: "" },
            },
          ],
        },
        logprobs: null,
        finish_reason: null,
      },
    ],
  }),
  JSON.stringify({
    id: "chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ",
    object: "chat.completion.chunk",
    created: 1739130699,
    model: "gpt-4o-2024-08-06",
    service_tier: "default",
    system_fingerprint: "fp_50cad350e4",
    usage: null,
    choices: [
      {
        index: 0,
        delta: { tool_calls: [{ index: 0, function: { arguments: "{}" } }] },
        logprobs: null,
        finish_reason: null,
      },
    ],
  }),
  JSON.stringify({
    id: "chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ",
    object: "chat.completion.chunk",
    created: 1739130699,
    model: "gpt-4o-2024-08-06",
    service_tier: "default",
    system_fingerprint: "fp_50cad350e4",
    usage: null,
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 1,
              id: "call_vjuVr21HSbTGbVGYtv7oAZQS",
              type: "function",
              function: { name: "calculate_natural_log", arguments: "" },
            },
          ],
        },
        logprobs: null,
        finish_reason: null,
      },
    ],
  }),
  JSON.stringify({
    id: "chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ",
    object: "chat.completion.chunk",
    created: 1739130699,
    model: "gpt-4o-2024-08-06",
    service_tier: "default",
    system_fingerprint: "fp_50cad350e4",
    usage: null,
    choices: [
      {
        index: 0,
        delta: { tool_calls: [{ index: 1, function: { arguments: '{"nu' } }] },
        logprobs: null,
        finish_reason: null,
      },
    ],
  }),
  JSON.stringify({
    id: "chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ",
    object: "chat.completion.chunk",
    created: 1739130699,
    model: "gpt-4o-2024-08-06",
    service_tier: "default",
    system_fingerprint: "fp_50cad350e4",
    usage: null,
    choices: [
      {
        index: 0,
        delta: { tool_calls: [{ index: 1, function: { arguments: 'mber"' } }] },
        logprobs: null,
        finish_reason: null,
      },
    ],
  }),
  JSON.stringify({
    id: "chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ",
    object: "chat.completion.chunk",
    created: 1739130699,
    model: "gpt-4o-2024-08-06",
    service_tier: "default",
    system_fingerprint: "fp_50cad350e4",
    usage: null,
    choices: [
      {
        index: 0,
        delta: { tool_calls: [{ index: 1, function: { arguments: ": 22}" } }] },
        logprobs: null,
        finish_reason: null,
      },
    ],
  }),
  JSON.stringify({
    id: "chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ",
    object: "chat.completion.chunk",
    created: 1739130699,
    model: "gpt-4o-2024-08-06",
    service_tier: "default",
    system_fingerprint: "fp_50cad350e4",
    choices: [
      { index: 0, delta: {}, logprobs: null, finish_reason: "tool_calls" },
    ],
    usage: null,
  }),
  JSON.stringify({
    id: "chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ",
    object: "chat.completion.chunk",
    created: 1739130699,
    model: "gpt-4o-2024-08-06",
    service_tier: "default",
    system_fingerprint: "fp_50cad350e4",
    choices: [],
    usage: {
      prompt_tokens: 87,
      completion_tokens: 45,
      total_tokens: 132,
      prompt_tokens_details: { cached_tokens: 0, audio_tokens: 0 },
      completion_tokens_details: {
        reasoning_tokens: 0,
        audio_tokens: 0,
        accepted_prediction_tokens: 0,
        rejected_prediction_tokens: 0,
      },
    },
  }),
  "[DONE]",
];

test("should extract tool calls from a stream", async () => {
  global.fetch = async () => {
    return {
      ok: true,
      status: 200,
      statusText: "All good",
      text: async () => "this went wrong",
      body: new ReadableStream({
        start(controller) {
          (async () => {
            for (let chunk of responseChunksWithToolCall) {
              controller.enqueue(
                new TextEncoder().encode(`data: ${chunk}\n\n`),
              );
              await new Promise((resolve) => setTimeout(() => resolve(), 10));
            }
            controller.close();
          })();
        },
      }),
    };
  };
  const result = await sendStreamingRequest({
    proxyUrl: "https://aiproxy",
    messages: [],
    onError: (err) => {
      console.error(err);
    },
  });

  equal(
    JSON.stringify(result[0].tool_calls),
    JSON.stringify([
      {
        id: "call_nsnhJgZZaqiKyMvwxW9NnptH",
        type: "function",
        function: {
          name: "get_current_datetime",
          arguments: "{}",
        },
      },
      {
        id: "call_vjuVr21HSbTGbVGYtv7oAZQS",
        type: "function",
        function: {
          name: "calculate_natural_log",
          arguments: '{"number": 22}',
        },
      },
    ]),
  );
});
