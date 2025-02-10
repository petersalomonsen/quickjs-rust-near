export function reconstructToolCalls(chunks) {
    let toolCalls = {};

    for (const chunk of chunks) {
        if (chunk === "[DONE]") break; // Stop processing if we hit the end marker

        try {
            const parsedChunk = JSON.parse(chunk);
            if (!parsedChunk.choices || parsedChunk.choices.length === 0) continue;

            const delta = parsedChunk.choices[0].delta;
            if (!delta || !delta.tool_calls) continue;

            for (const toolCall of delta.tool_calls) {
                const { index, id, type, function: func } = toolCall;

                if (!toolCalls[index]) {
                    toolCalls[index] = { id, type, function: { name: "", arguments: "" } };
                }

                if (id) toolCalls[index].id = id;
                if (type) toolCalls[index].type = type;
                if (func.name) toolCalls[index].function.name = func.name;
                if (func.arguments) toolCalls[index].function.arguments += func.arguments;
            }
        } catch (e) {
            console.error("Error parsing chunk:", e);
        }
    }

    return Object.values(toolCalls);
}


export async function sendStreamingRequest({
    messages,
    conversation_id,
    onError,
    onChunk
}) {
    const requestBody = JSON.stringify({
        conversation_id,
        messages
    });

    const headers = {
        'Content-Type': 'application/json'
    };

    try {
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: headers,
            body: requestBody
        });

        if (!response.ok) {
            onError({
                status: response.status,
                statusText: response.statusText,
                responseText: await response.text()
            })
            return;
        }

        // Read the streaming response using a ReadableStream
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let assistantResponse = '';

        // Continuously read data from the stream
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            // Decode the streamed chunk and parse it as JSON
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const json = line.substring(6);
                    if (json !== '[DONE]') {
                        try {
                            const parsed = JSON.parse(json);
                            if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                                const newContent = parsed.choices[0].delta.content;
                                assistantResponse += newContent;
                                onChunk({ newContent, assistantResponse });
                            }
                        } catch (e) {
                            console.error('Error parsing JSON chunk:', e);
                        }
                    }
                }
            }
        }

        // Add assistant response to the conversation
        conversation.push({ role: 'assistant', content: assistantResponse });
    } catch (error) {
        onError({ error });
    }
}