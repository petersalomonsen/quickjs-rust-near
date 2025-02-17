import { test } from "node:test";
import { nearAiChatCompletionRequest } from "./chat-completion.js";
import { tools, toolImplementations } from "./tools.js";

test("should connect to near ai", async () => {
  const authorizationObject = JSON.parse(process.env.NEAR_AI_AUTHORIZATION);
  const response = await nearAiChatCompletionRequest({
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      {
        role: "user",
        content: "Run a javascript that returns the current date",
      },
    ],
    authorizationObject,
    tools,
    toolImplementations,
    onChunk: ({ assistantResponse }) =>
      console.log("assistant response", assistantResponse),
    onError: (err) => console.error(err),
  });

  console.log(JSON.stringify(response, null, 1));
});
