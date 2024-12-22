
import { test, expect } from '@playwright/test';

test('ask question', async ({ page }) => {
  await page.goto('/');

  const {real_conversation_id} = await fetch('http://localhost:14501').then(r => r.json());
  await page.getByPlaceholder('conversation id').fill(real_conversation_id);

  const questionArea = await page.getByPlaceholder('Type your question here...');
  questionArea.fill("Hello!");
  await page.getByRole('button', { name: 'Ask OpenAI' }).click();
  await expect(await page.getByText("I am just a mockserver")).toBeVisible();
});
