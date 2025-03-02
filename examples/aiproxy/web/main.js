import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui-js";
import { Buffer } from "buffer";
import {
  nearAiChatCompletionRequest,
  sendStreamingRequest,
} from "./openai/chat-completion.js";
import {
  tools,
  toolImplementations,
  setWalletSelector,
} from "./openai/tools.js";
import { marked } from "marked";
import {
  handleNearAILoginCallback,
  nearAIlogin,
  NEAR_AI_AUTH_OBJECT_STORAGE_KEY,
} from "./nearai/login.js";
import { getProgressBarHTML } from "./ui/progress-bar.js";

window.Buffer = Buffer;

let setupLedger;
const walletSelectorModules = [setupMyNearWallet()];
try {
  setupLedger = (await import("@near-wallet-selector/ledger")).setupLedger;
  walletSelectorModules.push(setupLedger());
} catch (e) {
  console.warn("not able to setup ledger", e);
}

const walletSelector = await setupWalletSelector({
  network: "mainnet",
  modules: walletSelectorModules,
});
window.walletSelector = walletSelector;

setWalletSelector(walletSelector);

const walletSelectorModal = setupModal(walletSelector, {
  contractId: localStorage.getItem("contractId"),
  methodNames: ["call_js_func"],
});

document
  .getElementById("openWalletSelectorButton")
  .addEventListener("click", () => walletSelectorModal.show());

const baseUrl = "http://localhost:3000"; // Replace with your actual Spin proxy URL
const proxyUrl = `${baseUrl}/proxy-openai`;
let conversation = [
  { role: "system", content: "You are a helpful assistant." },
];

const refundMessageArea = document.getElementById("refund_message_area");
const progressModalElement = document.getElementById("progressmodal");
const progressModal = new bootstrap.Modal(progressModalElement);

function setProgressModalText(progressModalText) {
  document.getElementById("progressModalLabel").innerHTML = progressModalText;
  document.getElementById("progressbar").style.display = null;
  document.getElementById("progressErrorAlert").style.display = "none";
  document.getElementById("progressErrorAlert").innerText = "";
}

function setProgressErrorText(progressErrorText) {
  document.getElementById("progressModalLabel").innerHTML = "Error";
  document.getElementById("progressbar").style.display = "none";
  document.getElementById("progressErrorAlert").style.display = "block";
  document.getElementById("progressErrorAlert").innerText = progressErrorText;
}

async function getRefundMessageFromAiProxy() {
  const conversation_id = checkExistingConversationId();
  if (!conversation_id) {
    return;
  }
  setProgressModalText("Stopping conversation");
  progressModal.show();
  const requestBody = JSON.stringify({
    conversation_id: conversation_id,
  });
  const headers = {
    "Content-Type": "application/json",
  };

  const response = await fetch(`${baseUrl}/refund-conversation`, {
    method: "POST",
    headers: headers,
    body: requestBody,
  });
  const refundMessage = await response.json();
  refundMessageArea.innerHTML = JSON.stringify(refundMessage, null, 1);
  progressModal.hide();
  return refundMessage;
}

async function postRefundMessage(refundMessage) {
  setProgressModalText("Posting refund message");
  progressModal.show();
  const selectedWallet = await walletSelector.wallet();

  const result = await selectedWallet.signAndSendTransaction({
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "call_js_func",
          args: {
            function_name: "refund_unspent",
            ...refundMessage,
          },
          gas: "30000000000000",
          deposit: "0",
        },
      },
    ],
  });
  refundMessageArea.innerHTML = result.receipts_outcome[0].outcome.logs
    .join("\n")
    .trim();
  progressModal.hide();
}

async function startAiProxyConversation() {
  try {
    setProgressModalText("Starting conversation via AI proxy");
    progressModal.show();
    const selectedWallet = await walletSelector.wallet();

    const account = (await selectedWallet.getAccounts())[0];

    const conversation_id = `${account.accountId}_${new Date().getTime()}`;
    const conversation_id_hash = Array.from(
      new Uint8Array(
        await window.crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(conversation_id),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const result = await selectedWallet.signAndSendTransaction({
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "call_js_func",
            args: {
              function_name: "start_ai_conversation",
              conversation_id: conversation_id_hash,
            },
            gas: "30000000000000",
            deposit: "0",
          },
        },
      ],
    });

    const transactionStatus = await fetch("http://localhost:14500", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "dontcare",
        method: "tx",
        params: {
          tx_hash: result.transaction.hash,
          sender_account_id: account.accountId,
          wait_until: "FINAL",
        },
      }),
    }).then((r) => r.json());

    if (!transactionStatus.result.final_execution_status === "FINAL") {
      throw new Error(
        `Unable to query start converstation transaction status ${JSON.stringify(transactionStatus)}`,
      );
    }
    localStorage.setItem("conversation_id", conversation_id);
    progressModal.hide();
    return conversation_id;
  } catch (e) {
    setProgressErrorText(e);
  }
}

function checkExistingConversationId() {
  const existingConversationId = localStorage.getItem("conversation_id");
  return existingConversationId;
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const askAIButton = document.getElementById("askAIButton");
askAIButton.addEventListener("click", async () => {
  let conversation_id = checkExistingConversationId();
  if (conversation_id === null) {
    conversation_id = await startAiProxyConversation();
  }
  const question = document.getElementById("question").value;
  const messagesDiv = document.getElementById("messages");
  document.getElementById("question").value = ""; // Clear input field

  // Add user question to the conversation
  conversation.push({ role: "user", content: question });
  messagesDiv.innerHTML += `<strong>User:</strong> ${escapeHtml(question)}<br>`;

  const messages = conversation;

  askAIButton.disabled = true;
  try {
    // Add placeholder for the assistant's response
    let assistantResponseElement = document.createElement("div");
    assistantResponseElement.innerHTML = getProgressBarHTML();
    messagesDiv.appendChild(assistantResponseElement);

    // Fetch the proxy endpoint with a POST request
    const newMessages = await sendStreamingRequest({
      proxyUrl,
      conversation_id,
      messages,
      tools,
      toolImplementations,
      onError: (err) => {
        messagesDiv.innerHTML += `<strong>Assistant:</strong> Failed to fetch from proxy: ${err.statusText} ${err.responText ?? ""} <br>`;
      },
      onChunk: (chunk) => {
        assistantResponseElement.innerHTML = `<strong>Assistant:</strong> ${marked(chunk.assistantResponse)}`;
      },
    });

    if (newMessages) {
      conversation = newMessages;
    }
    console.log(conversation);
  } catch (error) {
    console.err(error);
    messagesDiv.innerHTML += "<strong>Assistant:</strong> " + error + "<br>";
  }
  askAIButton.disabled = false;
});

const askNearAIButton = document.getElementById("askNearAIButton");
askNearAIButton.addEventListener("click", async () => {
  const auth = localStorage.getItem(NEAR_AI_AUTH_OBJECT_STORAGE_KEY);
  if (auth === null) {
    try {
      await nearAIlogin(await walletSelector.wallet(), "Login to NEAR AI");
    } catch (e) {
      progressModal.show();
      setProgressErrorText(e);
      return;
    }
  }
  const question = document.getElementById("question").value;
  const messagesDiv = document.getElementById("messages");
  document.getElementById("question").value = ""; // Clear input field

  // Add user question to the conversation
  conversation.push({ role: "user", content: question });
  messagesDiv.innerHTML += `<strong>User:</strong> ${escapeHtml(question)}<br>`;

  const messages = conversation;

  askNearAIButton.disabled = true;
  try {
    // Add placeholder for the assistant's response
    let assistantResponseElement = document.createElement("div");
    assistantResponseElement.innerHTML = getProgressBarHTML();
    messagesDiv.appendChild(assistantResponseElement);

    const authorizationObject = JSON.parse(auth);
    // Fetch the proxy endpoint with a POST request
    const newMessages = await nearAiChatCompletionRequest({
      authorizationObject: authorizationObject,
      proxyUrl,
      messages,
      tools,
      toolImplementations,
      onError: (err) => {
        messagesDiv.innerHTML += `<strong>Assistant:</strong> Failed to fetch from proxy: ${err.statusText} ${err.responText ?? ""} <br>`;
      },
      onChunk: (chunk) => {
        assistantResponseElement.innerHTML = `<strong>Assistant:</strong> ${marked(chunk.assistantResponse)}`;
      },
    });

    if (newMessages) {
      conversation = newMessages;
    }
    console.log(conversation);
  } catch (error) {
    console.error(error);
    messagesDiv.innerHTML += "<strong>Assistant:</strong> " + error + "<br>";
  }
  askNearAIButton.disabled = false;
});

document.getElementById("refundButton").addEventListener("click", async () => {
  try {
    const refundMessage = await getRefundMessageFromAiProxy();
    await postRefundMessage(refundMessage);
    localStorage.removeItem("conversation_id");
  } catch (e) {
    setProgressErrorText(e.toString());
  }
});

handleNearAILoginCallback();
askAIButton.disabled = false;
askNearAIButton.disabled = false;
