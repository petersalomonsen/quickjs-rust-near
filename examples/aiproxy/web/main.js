import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui-js";
import { Buffer } from 'buffer';

window.Buffer = Buffer;

let setupLedger;
const walletSelectorModules = [setupMyNearWallet()];
try {
    setupLedger = (await import("@near-wallet-selector/ledger")).setupLedger;
    walletSelectorModules.push(setupLedger());
} catch (e) {
    console.warn('not able to setup ledger', e);
}

const walletSelector = await setupWalletSelector({
    network: "mainnet",
    modules: walletSelectorModules
});

const walletSelectorModal = setupModal(walletSelector, {
    contractId: localStorage.getItem('contractId'),
    methodNames: ['call_js_func']
});

document.getElementById('openWalletSelectorButton').addEventListener('click', () => walletSelectorModal.show());

const baseUrl = 'http://localhost:3000'; // Replace with your actual Spin proxy URL
const proxyUrl = `${baseUrl}/proxy-openai`;
let conversation = [
    { role: 'system', content: 'You are a helpful assistant.' }
];

const refundMessageArea = document.getElementById('refund_message_area');
const progressModalElement = document.getElementById('progressmodal');
const progressModal = new bootstrap.Modal(progressModalElement);

function setProgressModalText(progressModalText) {
    document.getElementById('progressModalLabel').innerHTML = progressModalText;
    document.getElementById('progressbar').style.display = null;
    document.getElementById('progressErrorAlert').style.display = 'none';
    document.getElementById('progressErrorAlert').innerText = '';
}

function setProgressErrorText(progressErrorText) {
    document.getElementById('progressbar').style.display = 'none';
    document.getElementById('progressErrorAlert').style.display = 'block';
    document.getElementById('progressErrorAlert').innerText = progressErrorText;
}

async function getRefundMessageFromAiProxy() {
    setProgressModalText('Stopping conversation');
    progressModal.show();
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
    refundMessageArea.value = JSON.stringify(refundMessage, null, 1);
    progressModal.hide();
}

async function postRefundMessage() {
    setProgressModalText('Posting refund message');
    progressModal.show();
    const selectedWallet = await walletSelector.wallet();

    const result = await selectedWallet.signAndSendTransaction(
        {
            actions: [
                {
                    type: "FunctionCall",
                    params: {
                        methodName: "call_js_func",
                        args: {
                            function_name: "refund_unspent",
                            ...JSON.parse(refundMessageArea.value)
                        },
                        gas: "30000000000000",
                        deposit: "0"
                    }
                },
            ],
        });
    refundMessageArea.value = result.receipts_outcome[0].outcome.logs.join("\n").trim();
    progressModal.hide();
}

async function startConversation() {
    try {
        setProgressModalText('Starting conversation');
        progressModal.show();
        const selectedWallet = await walletSelector.wallet();
        console.log(selectedWallet);
        const accountId = (await selectedWallet.getAccounts())[0];

        const conversation_id = `${accountId.accountId}_${new Date().getTime()}`;
        const conversation_id_hash = Array.from(new Uint8Array(
            await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(conversation_id))
        ))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");


        const result = await selectedWallet.signAndSendTransaction(
            {
                actions: [
                    {
                        type: "FunctionCall",
                        params: {
                            methodName: "call_js_func",
                            args: {
                                function_name: "start_ai_conversation",
                                conversation_id: conversation_id_hash
                            },
                            gas: "30000000000000",
                            deposit: "0"
                        }
                    },
                ],
            });
        localStorage.setItem('conversation_id', conversation_id);
        checkExistingConversationId();
        progressModal.hide();
    } catch(e) {
        setProgressErrorText(e);
    }
}

function checkExistingConversationId() {
    const existingConversationId = localStorage.getItem('conversation_id');
    if (existingConversationId) {
        document.getElementById('conversation_id').value = existingConversationId;
        document.getElementById('question').disabled = false;
        document.getElementById('askAIButton').disabled = false;
    }
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
            messagesDiv.innerHTML += '<strong>Assistant:</strong> Failed to fetch from proxy: ' + response.statusText + '<br>' + (await response.text()) + '<br>';
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
document.getElementById('refundButton').addEventListener('click', async () => {
    try {
        await getRefundMessageFromAiProxy();
        await postRefundMessage();
    } catch(e) {
        setProgressErrorText(e.toString());
    }
});
document.getElementById('askAIButton').addEventListener('click', () => sendQuestion());
checkExistingConversationId();