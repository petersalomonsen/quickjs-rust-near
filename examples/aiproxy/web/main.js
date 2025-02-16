import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui-js";
import { Buffer } from 'buffer';
import { sendStreamingRequest } from './openai/chat-completion.js';
import { tools, toolImplementations } from './openai/tools.js';
import { marked } from 'marked';

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

    const conversation_id = document.getElementById('conversation_id').value;
    const messages = conversation;

    try {
        // Add placeholder for the assistant's response
        let assistantResponseElement = document.createElement('div');
        assistantResponseElement.innerHTML = '<strong>Assistant:</strong> ';
        messagesDiv.appendChild(assistantResponseElement);
        
        // Fetch the proxy endpoint with a POST request
        const newMessages = await sendStreamingRequest({
            proxyUrl,
            conversation_id,messages,
            tools,
            toolImplementations,
            onError: (err) => {
                messagesDiv.innerHTML += `<strong>Assistant:</strong> Failed to fetch from proxy: ${err.statusText} ${err.responText ?? ''} <br>`;
            },
            onChunk: (chunk) => {
                assistantResponseElement.innerHTML = `<strong>Assistant:</strong> ${marked(chunk.assistantResponse)}`;
            }
        });

        if ( newMessages ) {
            conversation = newMessages;
        }
        console.log(conversation);
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