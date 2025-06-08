import { test, expect } from "@playwright/test";
import { setupStorage, setupNearAIRoute } from "./nearai.js";

test.beforeEach(async ({ page }) => {
  await page.route("https://rpc.mainnet.fastnear.com/", async (route) => {
    const response = await route.fetch({ url: "http://localhost:14500" });
    await route.fulfill({ response });
  });
});

test("start conversation without login", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);
  const questionArea = await page.getByPlaceholder(
    "Type your question here...",
  );
  await expect(questionArea).toBeEnabled();
  questionArea.fill("Hello");
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: "Ask NEAR AI" }).click();

  await expect(await page.locator("#progressErrorAlert")).toBeVisible();
  await expect(await page.locator("#progressErrorAlert")).toContainText(
    "Error: No wallet selected",
  );
  await expect(await page.getByRole("button", { name: "Close" })).toBeVisible();
});

test("login to NEAR AI", async ({ page }) => {
  test.setTimeout(60_000);
  const { publicKey, accountId } = await fetch("http://localhost:14501").then(
    (r) => r.json(),
  );

  await setupStorage({ page });

  // Navigate to the page first to get the baseURL
  const baseURL = page.url();

  await page.route("**/app.mynearwallet.com/**", async (route) => {
    console.log("Route intercepted:", route.request().url());
    const redirectUrl = `${baseURL}#accountId=${accountId}&publicKey=${publicKey}&signature=abcd`;
    console.log("Redirecting to:", redirectUrl);

    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>NEAR Wallet Mock</title></head>
        <body>
        <h1>Mock NEAR Wallet</h1>
        <script>
        console.log("Mock wallet page loaded");
        console.log("Redirecting to: ${redirectUrl}");
        setTimeout(() => {
          window.location.replace("${redirectUrl}");
        }, 1000);
        </script>
        </body>
        </html>
      `,
    });
  });

  let questionArea = await page.getByPlaceholder("Type your question here...");
  await expect(questionArea).toBeEnabled();

  // Focus the input first
  await questionArea.focus();
  await questionArea.pressSequentially("Hello", { delay: 200 });
  await questionArea.blur();

  // Wait longer for form validation in CI environment
  await page.waitForTimeout(1000);

  const askNearAiButton = await page.getByRole("button", {
    name: "Ask NEAR AI",
  });

  // Wait for the button to be enabled with a longer timeout for CI
  await expect(askNearAiButton).toBeEnabled({ timeout: 10000 });
  await askNearAiButton.click();

  // Wait for redirect back to the original URL with hash
  await page.waitForURL(/.*#accountId=.*/);

  // Wait for the page to fully reload after redirect
  await page.waitForTimeout(1000);

  questionArea = await page.getByPlaceholder("Type your question here...");
  await expect(questionArea).toBeEnabled();

  // Clear and fill the input field with proper typing simulation
  await questionArea.clear();
  await questionArea.pressSequentially("Hello again", { delay: 100 });
  await questionArea.blur();

  // Wait a bit for the form validation to process
  await page.waitForTimeout(500);

  await setupNearAIRoute({ page });

  const secondAskButton = await page.getByRole("button", {
    name: "Ask NEAR AI",
  });

  await expect(secondAskButton).toBeEnabled({ timeout: 10000 });
  await secondAskButton.click();

  await expect(
    await page.getByText("How can I assist you today?"),
  ).toBeVisible();
});

test("Tool call", async ({ page }) => {
  await setupStorage({ page, withAuthObject: true });

  await page.waitForTimeout(1000);
  const questionArea = await page.getByPlaceholder(
    "Type your question here...",
  );

  // Focus the input field and type with proper timing
  await questionArea.focus();
  await questionArea.pressSequentially(
    "Can you create a web4 javascript code that shows the current account and current date?",
    { delay: 50 },
  );
  await questionArea.blur();
  await page.waitForTimeout(1000);

  await setupNearAIRoute({ page });

  const askButton = await page.getByRole("button", { name: "Ask NEAR AI" });

  await expect(askButton).toBeEnabled({ timeout: 10000 });
  await askButton.click();

  await expect(await page.getByText("Function call result is")).toBeVisible();
  await expect(
    await page.getByText("Your script returned HTML content"),
  ).toBeVisible();

  // Get the pre code element containing the HTML result
  const preCodeElement = await page.locator("pre code").nth(1);
  await expect(preCodeElement).toBeVisible();

  // Get HTML content and verify structure
  const htmlContent = await preCodeElement.textContent();

  // Verify it contains the expected HTML structure
  expect(htmlContent).toContain("<!DOCTYPE html>");
  expect(htmlContent).toContain("<html>");
  expect(htmlContent).toContain("<h1>Account: test</h1>");

  // Verify date dynamically - create a date format that matches the expected output
  const currentDate = new Date();
  const formattedDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;

  // Check that the HTML contains this date
  expect(htmlContent).toContain(`<h2>Date: ${formattedDate}</h2>`);
});
