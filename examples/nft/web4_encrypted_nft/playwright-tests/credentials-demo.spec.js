import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import { Sandbox, DEFAULT_PRIVATE_KEY, DEFAULT_PUBLIC_KEY } from 'near-sandbox';
import { KeyPair } from 'near-api-js';
import crypto from 'crypto';
import { RistrettoPoint } from '@noble/curves/ed25519';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CURVE_ORDER = 2n ** 252n + 27742317777372353535851937790883648493n;

function bufferToScalar(buffer) {
  let value = 0n;
  for (let i = buffer.length - 1; i >= 0; i--) {
    value = (value << 8n) | BigInt(buffer[i]);
  }
  value = value % CURVE_ORDER;
  return value === 0n ? 1n : value;
}

function scalarToBuffer(scalar) {
  const buffer = Buffer.alloc(32);
  let value = scalar;
  for (let i = 0; i < 32; i++) {
    buffer[i] = Number(value & 0xFFn);
    value = value >> 8n;
  }
  return buffer;
}

test.describe('Credential Management Demo', () => {
  let page;
  let httpServer;
  let httpServerPort = 8766;

  test.beforeAll(async ({ browser }) => {
    console.log('🚀 Setting up credential demo...');

    // Build the marketplace bundle
    console.log('📦 Building marketplace bundle...');
    const projectRoot = path.join(__dirname, '..');
    try {
      await execAsync('node build.js', { cwd: projectRoot });
      console.log('  ✅ Marketplace bundle created');
    } catch (error) {
      console.error('  ❌ Build failed:', error.message);
      throw error;
    }

    // Read the bundled HTML directly (no contract needed for this demo)
    const htmlContent = await readFile(path.join(projectRoot, 'dist/index.html'), 'utf-8');

    // Start HTTP server to serve the HTML
    console.log('🌐 Starting HTTP server...');

    httpServer = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlContent);
    });

    await new Promise((resolve) => {
      httpServer.listen(httpServerPort, () => {
        console.log(`✅ HTTP server listening on http://localhost:${httpServerPort}`);
        resolve();
      });
    });

    // Create browser context
    page = await browser.newPage();
    page.setDefaultTimeout(60000);

    // Listen to console messages
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        console.log(`🔴 Browser error: ${text}`);
      } else if (type === 'warning') {
        console.log(`⚠️  Browser warning: ${text}`);
      }
    });

    // Listen to page errors
    page.on('pageerror', (error) => {
      console.log(`🔴 Page error: ${error.message}`);
    });

    // Load marketplace page
    console.log('📄 Loading marketplace page...');

    try {
      await page.goto(`http://localhost:${httpServerPort}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // Wait for libraries to load
      await page.waitForFunction(() => {
        return window.RistrettoPoint && window.nearApi;
      }, { timeout: 30000 });

      console.log('✅ Marketplace page loaded');
    } catch (error) {
      console.error('❌ Failed to load marketplace page:', error.message);
      throw error;
    }
  });

  test.afterAll(async () => {
    if (page) await page.close();
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      console.log('🛑 HTTP server stopped');
    }
  });

  test('should create two credentials and demonstrate selection', async () => {
    console.log('\n📝 Test: Create and select credentials...');

    // Mock the prompt and password credential storage
    await page.evaluate(() => {
      // Create an in-memory credential store
      window.testCredentialStore = [];

      // Mock navigator.credentials.create
      const originalCreate = navigator.credentials.create.bind(navigator.credentials);
      navigator.credentials.create = async (options) => {
        if (options.password) {
          const credential = {
            id: options.password.id,
            name: options.password.name,
            password: options.password.password,
            type: 'password'
          };
          window.testCredentialStore.push(credential);
          return credential;
        }
        return originalCreate(options);
      };

      // Mock navigator.credentials.get to show selection
      navigator.credentials.get = async (options) => {
        if (options.password && window.testCredentialStore.length > 0) {
          // In a real browser, this would show a UI to select credentials
          // For testing, we'll return the one specified by window.testSelectCredential
          const index = window.testSelectCredential || 0;
          return window.testCredentialStore[index];
        }
        return null;
      };

      // Mock navigator.credentials.store (just return the credential)
      navigator.credentials.store = async (credential) => {
        return credential;
      };
    });

    // ========================================
    // Create Seller Credential
    // ========================================
    console.log('\n  📝 Step 1: Creating seller credential...');

    await page.click('button.tab:has-text("Credentials")');

    // Override prompt to provide seller name
    await page.evaluate(() => {
      window.prompt = () => 'Seller Wallet';
    });

    await page.click('button:has-text("Create New Credentials")');

    // Wait for credential creation
    await page.waitForTimeout(1000);

    // Get the created seller credential
    const sellerCred = await page.evaluate(() => {
      return window.testCredentialStore[0];
    });

    expect(sellerCred).toBeTruthy();
    expect(sellerCred.name).toBe('Seller Wallet');

    const sellerData = JSON.parse(Buffer.from(sellerCred.password, 'base64').toString());
    console.log(`    ✅ Seller credential created`);
    console.log(`       Account ID: ${sellerData.accountId.substring(0, 20)}...`);

    // ========================================
    // Create Buyer Credential
    // ========================================
    console.log('\n  📝 Step 2: Creating buyer credential...');

    // Override prompt to provide buyer name
    await page.evaluate(() => {
      window.prompt = () => 'Buyer Wallet';
    });

    await page.click('button:has-text("Create New Credentials")');

    // Wait for credential creation
    await page.waitForTimeout(1000);

    // Get the created buyer credential
    const buyerCred = await page.evaluate(() => {
      return window.testCredentialStore[1];
    });

    expect(buyerCred).toBeTruthy();
    expect(buyerCred.name).toBe('Buyer Wallet');

    const buyerData = JSON.parse(Buffer.from(buyerCred.password, 'base64').toString());
    console.log(`    ✅ Buyer credential created`);
    console.log(`       Account ID: ${buyerData.accountId.substring(0, 20)}...`);

    // ========================================
    // Demonstrate Credential Selection
    // ========================================
    console.log('\n  📝 Step 3: Demonstrating credential selection...');

    // Verify we have two different credentials stored
    const credCount = await page.evaluate(() => window.testCredentialStore.length);
    expect(credCount).toBe(2);
    console.log(`    ✅ Total credentials in store: ${credCount}`);

    // Test selecting seller credential
    console.log('\n    🔑 Selecting seller credential...');
    await page.evaluate(() => {
      window.testSelectCredential = 0; // Select first credential (seller)
    });

    const selectedSellerCred = await page.evaluate(async () => {
      const cred = await navigator.credentials.get({ password: true, mediation: 'required' });
      return cred ? {
        name: cred.name,
        accountId: JSON.parse(atob(cred.password)).accountId
      } : null;
    });

    expect(selectedSellerCred.name).toBe('Seller Wallet');
    expect(selectedSellerCred.accountId).toBe(sellerData.accountId);
    console.log(`    ✅ Retrieved: ${selectedSellerCred.name}`);
    console.log(`       Account: ${selectedSellerCred.accountId.substring(0, 20)}...`);

    // Test selecting buyer credential
    console.log('\n    🔑 Selecting buyer credential...');
    await page.evaluate(() => {
      window.testSelectCredential = 1; // Select second credential (buyer)
    });

    const selectedBuyerCred = await page.evaluate(async () => {
      const cred = await navigator.credentials.get({ password: true, mediation: 'required' });
      return cred ? {
        name: cred.name,
        accountId: JSON.parse(atob(cred.password)).accountId
      } : null;
    });

    expect(selectedBuyerCred.name).toBe('Buyer Wallet');
    expect(selectedBuyerCred.accountId).toBe(buyerData.accountId);
    console.log(`    ✅ Retrieved: ${selectedBuyerCred.name}`);
    console.log(`       Account: ${selectedBuyerCred.accountId.substring(0, 20)}...`);

    // ========================================
    // Test View Account Address functionality
    // ========================================
    console.log('\n  📝 Step 4: Testing view account address...');

    // Mock confirm and clipboard for testing
    await page.evaluate(() => {
      window.confirm = () => true; // Auto-confirm the copy dialog
      window.copiedText = null;
      navigator.clipboard.writeText = async (text) => {
        window.copiedText = text;
      };
      window.testSelectCredential = 0; // Select seller
    });

    // Click view account address
    await page.click('button:has-text("View Account Address")');

    await page.waitForTimeout(500);

    const copiedAccountId = await page.evaluate(() => window.copiedText);
    expect(copiedAccountId).toBe(sellerData.accountId);
    console.log(`    ✅ Account ID copied to clipboard`);
    console.log(`       Full address: ${copiedAccountId}`);

    // ========================================
    // Verify credential data structure
    // ========================================
    console.log('\n  📝 Step 5: Verifying credential data structure...');

    expect(sellerData.accountId).toBeTruthy();
    expect(sellerData.signingKeyPair).toBeTruthy();
    expect(sellerData.encryptionKeyPair).toBeTruthy();
    expect(sellerData.encryptionKeyPair.private_scalar_hex).toBeTruthy();
    expect(sellerData.encryptionKeyPair.public_key_base64).toBeTruthy();

    console.log(`    ✅ Seller credential structure validated`);
    console.log(`       ✓ Account ID (implicit): ${sellerData.accountId.length} chars`);
    console.log(`       ✓ Signing keypair present`);
    console.log(`       ✓ Encryption keypair present`);

    expect(buyerData.accountId).toBeTruthy();
    expect(buyerData.signingKeyPair).toBeTruthy();
    expect(buyerData.encryptionKeyPair).toBeTruthy();

    console.log(`    ✅ Buyer credential structure validated`);

    // Verify they have different account IDs
    expect(sellerData.accountId).not.toBe(buyerData.accountId);
    console.log(`    ✅ Credentials have unique account IDs`);

    console.log('\n✅ Credential management demo completed successfully!');
  });
});
