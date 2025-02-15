import { test } from "node:test";
import { nearAiChatCompletionRequest } from "./chat-completion.js";

test.skip("should connect to near ai", async () => {
  const authorizationObject = {};
  const response = await nearAiChatCompletionRequest({
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello, how are you?" },
    ],
    authorizationObject,
  });

  console.log(JSON.stringify(response, null, 1));
});
