import { createServer } from "http";
import { Readable } from "stream";

const PORT = 3001;
const API_KEY = process.env.SPIN_VARIABLE_OPENAI_API_KEY;
const API_KEY_METHOD = process.env.SPIN_VARIABLE_API_KEY_METHOD || "authorization";

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/v1/chat/completions")) {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
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

      const responseChunks = [
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
