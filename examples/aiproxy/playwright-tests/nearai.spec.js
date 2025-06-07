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
  await page.goto("/");
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
  await questionArea.fill("Hello");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Ask NEAR AI" }).click();

  // Wait for redirect back to the original URL with hash
  await page.waitForURL(/.*#accountId=.*/);

  questionArea = await page.getByPlaceholder("Type your question here...");
  await expect(questionArea).toBeEnabled();
  questionArea.fill("Hello again");

  await setupNearAIRoute({ page });
  await page.getByRole("button", { name: "Ask NEAR AI" }).click();

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

  questionArea.fill(
    "Can you create a web4 javascript code that shows the current account and current date?",
  );
  await page.waitForTimeout(1000);

  await setupNearAIRoute({ page });
  await page.getByRole("button", { name: "Ask NEAR AI" }).click();

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
