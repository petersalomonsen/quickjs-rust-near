import { createServer } from "http";
import { Readable } from "stream";

const PORT = 3001;

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/v1/chat/completions")) {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      const responseChunks = [
        JSON.stringify({
          choices: [
            {
              delta: {
                content: "I am just a mockserver\n",
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
