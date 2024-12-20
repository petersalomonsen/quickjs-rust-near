import { createServer } from "http";
import { Readable } from "stream";

const PORT = 3001;

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/openai/")) {
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
        }),
        JSON.stringify({
          choices: [
            {
              delta: {
                content: "...\n",
              },
            },
          ],
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
