import { createServer } from "http";
import { Readable } from "stream";

const PORT = 3001;
const API_KEY = process.env.SPIN_VARIABLE_OPENAI_API_KEY;
const API_KEY_METHOD = process.env.SPIN_VARIABLE_API_KEY_METHOD || "authorization";

const toolcallPayload = {"messages":[{"role":"user","content":[{"type":"text","text":"show me the current date and the natural logarithm of 22"}]}],"temperature":1,"max_completion_tokens":2048,"top_p":1,"frequency_penalty":0,"presence_penalty":0,"model":"gpt-4o","response_format":{"type":"text"},"tools":[{"type":"function","function":{"name":"get_current_datetime","description":"Returns the current date and time","parameters":{"type":"object","properties":{},"additionalProperties":false,"required":[]},"strict":true}},{"type":"function","function":{"name":"calculate_natural_log","description":"Get natural logarithm of any number","parameters":{"type":"object","required":["number"],"properties":{"number":{"type":"number","description":"The number to calculate the natural logarithm for"}},"additionalProperties":false},"strict":true}}],"parallel_tool_calls":true,"stream":true,"stream_options":{"include_usage":true}};

const defaultResponseChunks = [
  JSON.stringify({
    choices: [
      {
        delta: {
          content: "Hello! How can I assist you today?\n",
        },
      },
    ],
    usage: null
  }),
  JSON.stringify({
    choices: [
      {
        delta: {
          content: "...\n",
        },
      },
    ],
    usage:
    {
      "prompt_tokens": 18,
        "completion_tokens": 9,
        "total_tokens": 27,
        "prompt_tokens_details":
          { "cached_tokens": 0 }, 
          "completion_tokens_details": { "reasoning_tokens": 0 }
    }
  }),
  "[DONE]",
];

const responseChunksWithToolCall = [
  JSON.stringify({"id":"chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ","object":"chat.completion.chunk","created":1739130699,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_50cad350e4","usage":null,"choices":[{"index":0,"delta":{"role":"assistant","content":null},"logprobs":null,"finish_reason":null}]}),
  JSON.stringify({"id":"chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ","object":"chat.completion.chunk","created":1739130699,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_50cad350e4","usage":null,"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_nsnhJgZZaqiKyMvwxW9NnptH","type":"function","function":{"name":"get_current_datetime","arguments":""}}]},"logprobs":null,"finish_reason":null}]}),
  JSON.stringify({"id":"chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ","object":"chat.completion.chunk","created":1739130699,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_50cad350e4","usage":null,"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]},"logprobs":null,"finish_reason":null}]}),
  JSON.stringify({"id":"chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ","object":"chat.completion.chunk","created":1739130699,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_50cad350e4","usage":null,"choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"id":"call_vjuVr21HSbTGbVGYtv7oAZQS","type":"function","function":{"name":"calculate_natural_log","arguments":""}}]},"logprobs":null,"finish_reason":null}]}),
  JSON.stringify({"id":"chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ","object":"chat.completion.chunk","created":1739130699,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_50cad350e4","usage":null,"choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{\"nu"}}]},"logprobs":null,"finish_reason":null}]}),
  JSON.stringify({"id":"chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ","object":"chat.completion.chunk","created":1739130699,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_50cad350e4","usage":null,"choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"function":{"arguments":"mber\""}}]},"logprobs":null,"finish_reason":null}]}),
  JSON.stringify({"id":"chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ","object":"chat.completion.chunk","created":1739130699,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_50cad350e4","usage":null,"choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"function":{"arguments":": 22}"}}]},"logprobs":null,"finish_reason":null}]}),
  JSON.stringify({"id":"chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ","object":"chat.completion.chunk","created":1739130699,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_50cad350e4","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}],"usage":null}),
  JSON.stringify({"id":"chatcmpl-Az7d55bmKWB0gR3e1A0b1AdOQ9FsQ","object":"chat.completion.chunk","created":1739130699,"model":"gpt-4o-2024-08-06","service_tier":"default","system_fingerprint":"fp_50cad350e4","choices":[],"usage":{"prompt_tokens":87,"completion_tokens":45,"total_tokens":132,"prompt_tokens_details":{"cached_tokens":0,"audio_tokens":0},"completion_tokens_details":{"reasoning_tokens":0,"audio_tokens":0,"accepted_prediction_tokens":0,"rejected_prediction_tokens":0}}}),
"[DONE]"
];

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/v1/chat/completions")) {
    let requestBody = "";

    req.on("data", (chunk) => {
      requestBody += chunk;
    });

    req.on("end", () => {
      let apiKeyValid = false;

      if (API_KEY_METHOD === "api-key") {
        apiKeyValid = req.headers["api-key"] === API_KEY;
      } else {
        const authHeader = req.headers["authorization"];
        apiKeyValid = authHeader && authHeader === `Bearer ${API_KEY}`;
      }

      if (!apiKeyValid) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      const payload = JSON.parse(requestBody);
      const responseChunks = payload.messages.findLast(message => message.role === 'user' && message.content[0].text === "show me the current date and the natural logarithm of 22") ? responseChunksWithToolCall : defaultResponseChunks;

      const readable = new Readable({
        read() {
          responseChunks.forEach((chunk) => this.push(`data: ${chunk}\n\n`));
          this.push(null);
        },
      });

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      readable.pipe(res);
    });
  } else if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify("hello"));
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`Mock server running on port ${PORT}`);
});
