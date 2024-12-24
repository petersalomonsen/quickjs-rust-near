
import { test, expect } from '@playwright/test';
import { createHash } from 'crypto';

test('ask question', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Ask AI' }).click();
  await expect(await page.getByText("I am just a mockserver")).toBeVisible();
  await page.locator("#refundButton").click();
  await expect(await page.locator("#refund_message")).toContainText("refund_message");
  const refundMessageObj = JSON.parse(JSON.parse(await page.locator("#refund_message").innerText()).refund_message);
  expect(refundMessageObj.refund_amount).toEqual("127999973");
  const conversationId = await page.locator("#conversation_id").inputValue();
  const conversationIdHash = await createHash('sha256').update(Buffer.from(conversationId)).digest('hex');
  await expect(conversationIdHash).toEqual(refundMessageObj.conversation_id);
});
