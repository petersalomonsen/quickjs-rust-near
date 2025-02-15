export async function sendStreamingRequest({
  proxyUrl,
  messages,
  conversation_id,
  onError,
  onChunk,
}) {
  const requestBody = JSON.stringify({
    conversation_id,
    messages,
  });

  const headers = {
    "Content-Type": "application/json",
  };

  const response = await fetch(proxyUrl, {
    method: "POST",
    headers: headers,
    body: requestBody,
  });

  if (!response.ok) {
    onError({
      status: response.status,
      statusText: response.statusText,
      responseText: await response.text(),
    });
    return;
  }

  // Read the streaming response using a ReadableStream
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let assistantResponse = "";
  const chunks = [];
  let toolCalls = {};

  // Continuously read data from the stream
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    // Decode the streamed chunk and parse it as JSON
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter((line) => line.trim() !== "");
    chunks.push(...lines);

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const json = line.substring(6);
        if (json !== "[DONE]") {
          try {
            const parsed = JSON.parse(json);

            if (
              parsed.choices &&
              parsed.choices.length > 0 &&
              parsed.choices[0].delta
            ) {
              const delta = parsed.choices[0].delta;

              // Append text response
              if (delta.content) {
                const newContent = delta.content;
                assistantResponse += newContent;
                onChunk({ newContent, assistantResponse });
              }
              if (delta.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  const { index, id, type, function: func } = toolCall;

                  if (!toolCalls[index]) {
                    toolCalls[index] = {
                      id,
                      type,
                      function: { name: "", arguments: "" },
                    };
                  }

                  if (id) toolCalls[index].id = id;
                  if (type) toolCalls[index].type = type;
                  if (func.name) toolCalls[index].function.name = func.name;
                  if (func.arguments)
                    toolCalls[index].function.arguments += func.arguments;
                }
              }
            }
          } catch (e) {
            console.error("Error parsing JSON chunk:", e);
          }
        }
      }
    }
  }

  const tool_calls = Object.values(toolCalls);

  // Create the assistant message with either content or tool_calls
  const assistantMessage = { role: "assistant" };
  if (assistantResponse) {
    assistantMessage.content = assistantResponse;
  }
  if (tool_calls.length > 0) {
    assistantMessage.tool_calls = tool_calls;
  }

  // Add assistant response to the message history
  messages.push(assistantMessage);

  return messages; // Return updated message history
}

export async function nearAiChatCompletionRequest({
  model = "fireworks::accounts/fireworks/models/qwen2p5-72b-instruct",
  messages,
  authorizationObject,
}) {
  const body = JSON.stringify({
    model,
    messages,
    /*
        // Unable to get streaming to work
        "stream": true,
        "stream_options": {
            "include_usage": true
        }
        */
  });

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${JSON.stringify(authorizationObject)}`,
  };

  return await fetch("https://api.near.ai/v1/chat/completions", {
    method: "POST",
    headers,
    body,
  }).then((r) => r.json());
}
