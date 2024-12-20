
import { test, expect } from '@playwright/test';

test('ask question', async ({ page }) => {
  await page.goto('/');

  await page.getByPlaceholder('conversation id').fill("test-conversation-12345");

  const questionArea = await page.getByPlaceholder('Type your question here...');
  questionArea.fill("Hello!");
  await page.getByRole('button', { name: 'Ask OpenAI' }).click();
});
