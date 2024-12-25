import { connect, keyStores, WalletConnection} from 'near-api-js';

const keyStore = new keyStores.BrowserLocalStorageKeyStore();
const contractId = localStorage.getItem('contractId');

const near = await connect({
    networkId: "sandbox",
    nodeUrl: "http://localhost:14500",
    keyStore
});
const walletConnection = new WalletConnection(near, "aiproxy");

const baseUrl = 'http://localhost:3000';
const proxyUrl = `${baseUrl}/proxy-openai`;  // Replace with your actual Spin proxy URL
let conversation = [
    { role: 'system', content: 'You are a helpful assistant.' }
];

async function refund() {
    const requestBody = JSON.stringify({
        conversation_id: document.getElementById('conversation_id').value
    });
    const headers = {
        'Content-Type': 'application/json'
    };

    const response = await fetch(`${baseUrl}/refund-conversation`, {
        method: 'POST',
        headers: headers,
        body: requestBody
    });
    const refundMessage = await response.json();

    const account = walletConnection.account();
    const result = await account.functionCall({
        contractId: contractId,
        methodName: 'call_js_func',
        args: {
            function_name: "refund_unspent",
            ...refundMessage
        }
    });
    refund_message.innerHTML = result.receipts_outcome[0].outcome.logs.join("\n");
}

async function startConversation() {
    const conversation_id = `${walletConnection.getAccountId()}_${new Date().getTime()}`;
    document.getElementById('conversation_id').value = conversation_id;
    const conversation_id_hash = Array.from(new Uint8Array(
                            await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(conversation_id))
                        ))
                        .map((b) => b.toString(16).padStart(2, "0"))
                        .join("");

    const account = walletConnection.account();

    const result = await account.functionCall({
        contractId: contractId,
        methodName: 'call_js_func',
        args: {
            function_name: "start_ai_conversation",
            conversation_id: conversation_id_hash
        }
    });
    console.log(result);
    document.getElementById('question').disabled = false;
    document.getElementById('askAIButton').disabled = false;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function sendQuestion() {
    const question = document.getElementById('question').value;
    const messagesDiv = document.getElementById('messages');
    document.getElementById('question').value = ''; // Clear input field

    // Add user question to the conversation
    conversation.push({ role: 'user', content: question });
    messagesDiv.innerHTML += `<strong>User:</strong> ${escapeHtml(question)}<br>`;

    const requestBody = JSON.stringify({
        conversation_id: document.getElementById('conversation_id').value,
        messages: conversation
    });

    const headers = {
        'Content-Type': 'application/json'
    };

    try {
        // Fetch the proxy endpoint with a POST request
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: headers,
            body: requestBody
        });

        // Check if the response is OK
        if (!response.ok) {
            messagesDiv.innerHTML += '<strong>Assistant:</strong> Failed to fetch from proxy: ' + response.statusText + '<br>'+ (await response.text()) + '<br>';
            return;
        }

        // Read the streaming response using a ReadableStream
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let assistantResponse = '';

        // Add placeholder for the assistant's response
        let assistantResponseElement = document.createElement('div');
        assistantResponseElement.innerHTML = '<strong>Assistant:</strong> ';
        messagesDiv.appendChild(assistantResponseElement);

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
                                assistantResponseElement.innerHTML = `<strong>Assistant:</strong> ${assistantResponse}`;
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
        messagesDiv.innerHTML += '<strong>Assistant:</strong> Error: ' + error + '<br>';
    }
}

document.getElementById('startConversationButton').addEventListener('click', () => startConversation());
document.getElementById('refundButton').addEventListener('click', () => refund());
document.getElementById('askAIButton').addEventListener('click', () => sendQuestion());