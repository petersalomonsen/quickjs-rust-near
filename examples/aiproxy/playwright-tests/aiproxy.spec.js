import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mockServerPath = path.resolve(__dirname, 'openaimockserver.js');

let mockServerProcess;

async function startMockServer(apiKeyMethod, apikey = 'abcd') {
  if (mockServerProcess) {
    await new Promise((resolve) => {
      mockServerProcess.on('close', resolve);
      mockServerProcess.kill();
    });
  }

  mockServerProcess = spawn('node', [mockServerPath], {
    env: {
      ...process.env,
      SPIN_VARIABLE_OPENAI_API_KEY: apikey,
      SPIN_VARIABLE_OPENAI_API_KEY_METHOD: apiKeyMethod,
    },
  });

  mockServerProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  mockServerProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  // Wait for the server to start and respond on port 3001
  await new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      http.get('http://127.0.0.1:3001', (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve();
        }
      }).on('error', () => {
        // Ignore errors, keep trying
      });
    }, 500);
  });
}

test.afterEach(async () => {
  if (mockServerProcess) {
    await new Promise((resolve) => {
      mockServerProcess.on('close', resolve);
      mockServerProcess.kill();
    });
  }
});

async function testConversation({page, expectedRefundAmount = "127999973", expectedOpenAIResponse = "Hello! How can I assist you today?"}) {
  const { functionAccessKeyPair, publicKey, accountId, contractId } = await fetch('http://localhost:14501').then(r => r.json());

  await page.goto('/');
  await page.evaluate(({ accountId, publicKey, functionAccessKeyPair, contractId }) => {
    localStorage.setItem("aiproxy_wallet_auth_key", JSON.stringify({ accountId, allKeys: [publicKey] }));
    localStorage.setItem(`near-api-js:keystore:${accountId}:sandbox`, functionAccessKeyPair);
    localStorage.setItem(`contractId`, contractId);
  }, { accountId, publicKey, functionAccessKeyPair, contractId });

  await page.reload();

  await page.getByRole('button', { name: 'Start conversation' }).click();

  const questionArea = await page.getByPlaceholder('Type your question here...');
  await expect(questionArea).toBeEnabled();
  questionArea.fill("Hello!");
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Ask AI' }).click();
  await expect(await page.getByText(expectedOpenAIResponse)).toBeVisible();
  
  await page.waitForTimeout(500);
  await page.locator("#refundButton").click();
  
  await expect(await page.locator("#refund_message")).toContainText(`EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"${contractId}","new_owner_id":"${accountId}","amount":"${expectedRefundAmount}"}]}\nrefunded ${expectedRefundAmount} to ${accountId}`, {timeout: 10_000});
}

test('start conversation, ask question and refund (using OpenAI authorization header)', async ({ page }) => {
  await startMockServer('authorization');
  await testConversation({page});
});



test('start conversation, ask question and refund (using Azure OpenAI Api-Key header)', async ({ page }) => {
  await startMockServer('api-key');
  await testConversation({page});
});

test('start conversation, ask question, where openai API fails, and refund (using wrong OpenAI API key)', async ({ page }) => {
  await startMockServer('api-key', "1234ffff");
  
  await testConversation({page, expectedRefundAmount: "128000000", expectedOpenAIResponse: "Failed to fetch from proxy: Internal Server Error"});
});
