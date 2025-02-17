import { createServer } from "http";
import { Readable } from "stream";
import { readFile } from "fs/promises";

const PORT = 3001;
const API_KEY = process.env.SPIN_VARIABLE_OPENAI_API_KEY;
const API_KEY_METHOD =
  process.env.SPIN_VARIABLE_API_KEY_METHOD || "authorization";

const defaultResponseChunks =
  `data: {"choices":[],"created":0,"id":"","model":"","object":"","prompt_filter_results":[{"prompt_index":0,"content_filter_results":{"hate":{"filtered":false,"severity":"safe"},"jailbreak":{"filtered":false,"detected":false},"self_harm":{"filtered":false,"severity":"safe"},"sexual":{"filtered":false,"severity":"safe"},"violence":{"filtered":false,"severity":"safe"}}}]}

data: {"choices":[{"content_filter_results":{},"delta":{"content":"","refusal":null,"role":"assistant"},"finish_reason":null,"index":0,"logprobs":null}],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":null}

data: {"choices":[{"content_filter_results":{"hate":{"filtered":false,"severity":"safe"},"self_harm":{"filtered":false,"severity":"safe"},"sexual":{"filtered":false,"severity":"safe"},"violence":{"filtered":false,"severity":"safe"}},"delta":{"content":"Hello"},"finish_reason":null,"index":0,"logprobs":null}],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":null}

data: {"choices":[{"content_filter_results":{"hate":{"filtered":false,"severity":"safe"},"self_harm":{"filtered":false,"severity":"safe"},"sexual":{"filtered":false,"severity":"safe"},"violence":{"filtered":false,"severity":"safe"}},"delta":{"content":"!"},"finish_reason":null,"index":0,"logprobs":null}],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":null}

data: {"choices":[{"content_filter_results":{"hate":{"filtered":false,"severity":"safe"},"self_harm":{"filtered":false,"severity":"safe"},"sexual":{"filtered":false,"severity":"safe"},"violence":{"filtered":false,"severity":"safe"}},"delta":{"content":" How"},"finish_reason":null,"index":0,"logprobs":null}],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":null}

data: {"choices":[{"content_filter_results":{"hate":{"filtered":false,"severity":"safe"},"self_harm":{"filtered":false,"severity":"safe"},"sexual":{"filtered":false,"severity":"safe"},"violence":{"filtered":false,"severity":"safe"}},"delta":{"content":" can"},"finish_reason":null,"index":0,"logprobs":null}],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":null}

data: {"choices":[{"content_filter_results":{"hate":{"filtered":false,"severity":"safe"},"self_harm":{"filtered":false,"severity":"safe"},"sexual":{"filtered":false,"severity":"safe"},"violence":{"filtered":false,"severity":"safe"}},"delta":{"content":" I"},"finish_reason":null,"index":0,"logprobs":null}],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":null}

data: {"choices":[{"content_filter_results":{"hate":{"filtered":false,"severity":"safe"},"self_harm":{"filtered":false,"severity":"safe"},"sexual":{"filtered":false,"severity":"safe"},"violence":{"filtered":false,"severity":"safe"}},"delta":{"content":" assist"},"finish_reason":null,"index":0,"logprobs":null}],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":null}

data: {"choices":[{"content_filter_results":{"hate":{"filtered":false,"severity":"safe"},"self_harm":{"filtered":false,"severity":"safe"},"sexual":{"filtered":false,"severity":"safe"},"violence":{"filtered":false,"severity":"safe"}},"delta":{"content":" you"},"finish_reason":null,"index":0,"logprobs":null}],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":null}

data: {"choices":[{"content_filter_results":{"hate":{"filtered":false,"severity":"safe"},"self_harm":{"filtered":false,"severity":"safe"},"sexual":{"filtered":false,"severity":"safe"},"violence":{"filtered":false,"severity":"safe"}},"delta":{"content":" today"},"finish_reason":null,"index":0,"logprobs":null}],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":null}

data: {"choices":[{"content_filter_results":{"hate":{"filtered":false,"severity":"safe"},"self_harm":{"filtered":false,"severity":"safe"},"sexual":{"filtered":false,"severity":"safe"},"violence":{"filtered":false,"severity":"safe"}},"delta":{"content":"?"},"finish_reason":null,"index":0,"logprobs":null}],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":null}

data: {"choices":[{"content_filter_results":{},"delta":{},"finish_reason":"stop","index":0,"logprobs":null}],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":null}

data: {"choices":[],"created":1739732755,"id":"chatcmpl-B1eFf135hgAWyKJT6ry5iFMcwAf4D","model":"gpt-4o-2024-11-20","object":"chat.completion.chunk","system_fingerprint":"fp_f3927aa00d","usage":{"completion_tokens":10,"completion_tokens_details":{"accepted_prediction_tokens":0,"audio_tokens":0,"reasoning_tokens":0,"rejected_prediction_tokens":0},"prompt_tokens":96,"prompt_tokens_details":{"audio_tokens":0,"cached_tokens":0},"total_tokens":106}}

data: [DONE]
`.split("\n\n");

const responseChunksWithToolCall = (
  await readFile(
    new URL("./openairesponsechunks/toolcall.txt", import.meta.url),
  )
)
  .toString()
  .split("\n\n");
const responseChunksHandleToolCall = (
  await readFile(
    new URL("./openairesponsechunks/handletoolcalll.txt", import.meta.url),
  )
)
  .toString()
  .split("\n\n");

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
      const lastMessage = payload.messages[payload.messages.length - 1];

      let responseChunks;
      if (
        lastMessage.content ===
        "run a script that shows the fibonacci numbers up to 100"
      ) {
        responseChunks = responseChunksWithToolCall;
      } else if (
        lastMessage.role === "tool" &&
        lastMessage.tool_call_id === "call_9Qho04353vraQ92HfH5i1aDZ"
      ) {
        responseChunks = responseChunksHandleToolCall;
      } else {
        responseChunks = defaultResponseChunks;
      }

      const readable = new Readable({
        read() {
          responseChunks.forEach((chunk) => this.push(`${chunk}\n\n`));
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
