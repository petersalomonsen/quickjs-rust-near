import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import { Sandbox, DEFAULT_PRIVATE_KEY, DEFAULT_PUBLIC_KEY } from 'near-sandbox';
import { KeyPair, transactions, utils } from 'near-api-js';
import crypto from 'crypto';
import {
  NearRpcClient,
  broadcastTxCommit,
  viewAccessKey,
  viewFunctionAsJson,
} from '@near-js/jsonrpc-client';
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

test.describe('Encrypted NFT Marketplace', () => {
  let sandbox;
  let rpcUrl;
  let rpcClient;
  let accountKeys;
  let contractAccount;
  let sellerAccount;
  let buyerAccount;
  let sellerKeyPair;
  let buyerKeyPair;
  let sellerRistrettoPrivateKey;
  let buyerRistrettoPrivateKey;
  let page;
  let httpServer;
  let httpServerPort = 8765;

  test.beforeAll(async ({ browser }) => {
    console.log('🚀 Starting sandbox...');
    sandbox = await Sandbox.start({
      version: '2.8.0',
      timeout: 60000,
      config: {
        additionalGenesis: {
          total_supply: '1050000000000000000000000000000000',
          records: [
            {
              Account: {
                account_id: 'test.near',
                account: {
                  amount: '1000000000000000000000000000000000',
                  locked: '50000000000000000000000000000000',
                  code_hash: '11111111111111111111111111111111',
                  storage_usage: 0,
                  version: 'V1',
                },
              },
            },
            {
              AccessKey: {
                account_id: 'test.near',
                public_key: DEFAULT_PUBLIC_KEY,
                access_key: { nonce: 0, permission: 'FullAccess' },
              },
            },
          ],
        },
      },
    });

    rpcUrl = sandbox.rpcUrl;
    rpcClient = new NearRpcClient(rpcUrl);
    accountKeys = new Map();

    const rootKeyPair = KeyPair.fromString(DEFAULT_PRIVATE_KEY);
    accountKeys.set('test.near', rootKeyPair);

    console.log(`✅ Sandbox started: ${rpcUrl}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Helper functions
    async function getLatestBlockHash() {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'dontcare',
          method: 'block',
          params: { finality: 'final' },
        }),
      });
      const result = await response.json();
      return result.result.header.hash;
    }

    async function getAccessKeyNonce(accountId, publicKey) {
      const result = await viewAccessKey(rpcClient, {
        accountId,
        publicKey,
        finality: 'final',
      });
      return result.nonce;
    }

    async function createAccount(accountId, initialBalance = '100000000000000000000000000') {
      const newKeyPair = KeyPair.fromRandom('ed25519');
      accountKeys.set(accountId, newKeyPair);

      const actions = [
        transactions.createAccount(),
        transactions.transfer(utils.format.parseNearAmount(initialBalance.replace(/0{24}$/, ''))),
        transactions.addKey(newKeyPair.getPublicKey(), transactions.fullAccessKey()),
      ];

      const blockHash = await getLatestBlockHash();
      const nonce = await getAccessKeyNonce('test.near', rootKeyPair.getPublicKey().toString());

      const tx = transactions.createTransaction(
        'test.near',
        rootKeyPair.getPublicKey(),
        accountId,
        nonce + 1,
        actions,
        utils.serialize.base_decode(blockHash)
      );

      const serializedTx = utils.serialize.serialize(transactions.SCHEMA.Transaction, tx);
      const txHash = crypto.createHash('sha256').update(serializedTx).digest();
      const signature = rootKeyPair.sign(txHash);

      const signedTx = new transactions.SignedTransaction({
        transaction: tx,
        signature: new transactions.Signature({
          keyType: tx.publicKey.keyType,
          data: signature.signature,
        }),
      });

      const signedTxBytes = signedTx.encode();
      const signedTxBase64 = Buffer.from(signedTxBytes).toString('base64');
      await broadcastTxCommit(rpcClient, {
        signedTxBase64,
        waitUntil: 'FINAL',
      });

      console.log(`  ✅ Created account: ${accountId}`);
      return newKeyPair;
    }

    async function deployContract(accountId, wasmCode) {
      const keyPair = accountKeys.get(accountId);
      const actions = [transactions.deployContract(wasmCode)];

      const blockHash = await getLatestBlockHash();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const nonce = await getAccessKeyNonce(accountId, keyPair.getPublicKey().toString());

      const tx = transactions.createTransaction(
        accountId,
        keyPair.getPublicKey(),
        accountId,
        nonce + 1,
        actions,
        utils.serialize.base_decode(blockHash)
      );

      const serializedTx = utils.serialize.serialize(transactions.SCHEMA.Transaction, tx);
      const txHash = crypto.createHash('sha256').update(serializedTx).digest();
      const signature = keyPair.sign(txHash);

      const signedTx = new transactions.SignedTransaction({
        transaction: tx,
        signature: new transactions.Signature({
          keyType: tx.publicKey.keyType,
          data: signature.signature,
        }),
      });

      const signedTxBytes = signedTx.encode();
      const signedTxBase64 = Buffer.from(signedTxBytes).toString('base64');
      await broadcastTxCommit(rpcClient, {
        signedTxBase64,
        waitUntil: 'FINAL',
      });

      console.log(`  ✅ Deployed contract to: ${accountId}`);
    }

    // Create accounts
    console.log('📝 Creating accounts...');
    contractAccount = 'nft.test.near';

    await createAccount(contractAccount);

    // Generate keypairs for seller and buyer (implicit accounts)
    sellerKeyPair = KeyPair.fromRandom('ed25519');
    buyerKeyPair = KeyPair.fromRandom('ed25519');

    // Derive implicit account IDs from public keys (hex representation of public key data)
    sellerAccount = Buffer.from(sellerKeyPair.getPublicKey().data).toString('hex');
    buyerAccount = Buffer.from(buyerKeyPair.getPublicKey().data).toString('hex');

    // Store keypairs FIRST so the funding transactions can use them
    accountKeys.set(sellerAccount, sellerKeyPair);
    accountKeys.set(buyerAccount, buyerKeyPair);

    // Fund the implicit accounts by transferring NEAR to them
    // For implicit accounts, we just transfer funds - the account is created automatically
    // and the access key is implicitly the public key that the account ID is derived from
    async function fundImplicitAccount(accountId, amount) {
      const actions = [
        transactions.transfer(utils.format.parseNearAmount(amount.replace(/0{24}$/, '')))
      ];

      const blockHash = await getLatestBlockHash();
      const nonce = await getAccessKeyNonce('test.near', rootKeyPair.getPublicKey().toString());

      const tx = transactions.createTransaction(
        'test.near',
        rootKeyPair.getPublicKey(),
        accountId,
        nonce + 1,
        actions,
        utils.serialize.base_decode(blockHash)
      );

      const serializedTx = utils.serialize.serialize(transactions.SCHEMA.Transaction, tx);
      const txHash = crypto.createHash('sha256').update(serializedTx).digest();
      const signature = rootKeyPair.sign(txHash);

      const signedTx = new transactions.SignedTransaction({
        transaction: tx,
        signature: new transactions.Signature({
          keyType: tx.publicKey.keyType,
          data: signature.signature,
        }),
      });

      const signedTxBytes = signedTx.encode();
      const signedTxBase64 = Buffer.from(signedTxBytes).toString('base64');
      await broadcastTxCommit(rpcClient, {
        signedTxBase64,
        waitUntil: 'FINAL',
      });

      console.log(`  ✅ Funded implicit account: ${accountId}`);
    }

    await fundImplicitAccount(sellerAccount, '100000000000000000000000000');
    await fundImplicitAccount(buyerAccount, '100000000000000000000000000');

    // Deploy contract
    console.log('📦 Deploying contract...');
    const wasmPath = path.join(__dirname, '../../out/nft.wasm');
    const wasmCode = await readFile(wasmPath);
    await deployContract(contractAccount, wasmCode);

    // Initialize contract and upload JavaScript
    console.log('🔧 Initializing contract...');
    async function functionCall(accountId, contractId, methodName, args, gas = '300000000000000', deposit = '0') {
      const keyPair = accountKeys.get(accountId);
      if (!keyPair) throw new Error(`No key for account ${accountId}`);

      const actions = [
        transactions.functionCall(methodName, args, BigInt(gas), BigInt(deposit))
      ];

      const blockHash = await getLatestBlockHash();
      await new Promise((resolve) => setTimeout(() => resolve(), 1000));
      const nonce = await getAccessKeyNonce(accountId, keyPair.getPublicKey().toString());

      const tx = transactions.createTransaction(
        accountId,
        keyPair.getPublicKey(),
        contractId,
        nonce + 1,
        actions,
        utils.serialize.base_decode(blockHash)
      );

      const serializedTx = utils.serialize.serialize(transactions.SCHEMA.Transaction, tx);
      const txHash = crypto.createHash('sha256').update(serializedTx).digest();
      const signature = keyPair.sign(txHash);

      const signedTx = new transactions.SignedTransaction({
        transaction: tx,
        signature: new transactions.Signature({
          keyType: tx.publicKey.keyType,
          data: signature.signature,
        }),
      });

      const signedTxBytes = signedTx.encode();
      const signedTxBase64 = Buffer.from(signedTxBytes).toString('base64');
      const result = await broadcastTxCommit(rpcClient, {
        signedTxBase64,
        waitUntil: 'FINAL',
      });

      if (result.status.Failure) {
        console.error(`  ❌ Failed to call ${methodName} on ${contractId}:`, JSON.stringify(result.status.Failure, null, 2));
        throw new Error(`Function call failed: ${methodName}`);
      }

      return result;
    }

    await functionCall(contractAccount, contractAccount, 'new', {});
    console.log('  ✅ Contract initialized');

    // Build the marketplace bundle with build.js
    console.log('📦 Building marketplace bundle...');
    const projectRoot = path.join(__dirname, '..');
    try {
      await execAsync('node build.js', { cwd: projectRoot });
      console.log('  ✅ Marketplace bundle created');
    } catch (error) {
      console.error('  ❌ Build failed:', error.message);
      throw error;
    }

    // Upload the bundled JavaScript (includes embedded HTML)
    const nftJavascript = await readFile(path.join(projectRoot, 'contract-bundle.js'), 'utf-8');
    console.log(`  📄 Bundled contract size: ${nftJavascript.length} bytes`);

    await functionCall(contractAccount, contractAccount, 'post_javascript', {
      javascript: nftJavascript,
    });
    console.log('  ✅ JavaScript bundle uploaded (with embedded marketplace HTML)');

    // Generate Ristretto keypairs
    console.log('🔑 Generating Ristretto keypairs...');
    sellerRistrettoPrivateKey = bufferToScalar(crypto.randomBytes(32));
    buyerRistrettoPrivateKey = bufferToScalar(crypto.randomBytes(32));

    console.log(`  Seller NEAR: ${sellerAccount}`);
    console.log(`  Buyer NEAR: ${buyerAccount}`);

    // Helper to call view functions
    async function viewFunction(contractId, methodName, args) {
      const result = await viewFunctionAsJson(rpcClient, {
        accountId: contractId,
        methodName: methodName,
        argsBase64: Buffer.from(JSON.stringify(args)).toString('base64'),
        finality: 'final',
      });
      return result;
    }

    // Start HTTP server that mimics Web4 gateway behavior
    console.log('🌐 Starting Web4 gateway server...');

    httpServer = createServer(async (req, res) => {
      try {
        // Call web4_get directly (like real Web4 gateway)
        const web4Result = await viewFunction(contractAccount, 'web4_get', {
          request: { path: req.url },
        });

        // Decode base64 HTML body (web4_get returns { body: base64String, contentType: string })
        const htmlContent = Buffer.from(web4Result.body, 'base64').toString('utf-8');

        // Inject sandbox RPC endpoint for testing
        const modifiedHtml = htmlContent
          .replace(/https:\/\/rpc\.testnet\.fastnear\.com/g, rpcUrl)
          .replace(/https:\/\/rpc\.mainnet\.fastnear\.com/g, rpcUrl);

        res.writeHead(200, { 'Content-Type': web4Result.contentType });
        res.end(modifiedHtml);
      } catch (error) {
        console.error('Web4 gateway error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Error: ${error.message}`);
      }
    });

    await new Promise((resolve) => {
      httpServer.listen(httpServerPort, () => {
        console.log(`✅ Web4 gateway server listening on http://localhost:${httpServerPort}`);
        resolve();
      });
    });

    // Create browser context with headed mode for visualization
    page = await browser.newPage();
    page.setDefaultTimeout(60000);

    // Create test-results directory if it doesn't exist
    const { mkdirSync } = await import('fs');
    mkdirSync('test-results', { recursive: true });

    // Listen to console messages
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        console.log(`🔴 Browser error: ${text}`);
      } else if (type === 'warning') {
        console.log(`⚠️  Browser warning: ${text}`);
      } else if (text.includes('❌') || text.includes('Error')) {
        console.log(`Browser: ${text}`);
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
        timeout: 90000
      });

      // Wait for libraries to load
      await page.waitForFunction(() => {
        return window.RistrettoPoint && window.nearApi && window.nearRpc && window.nearRpc.viewFunctionAsJson;
      }, { timeout: 60000 });

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
      console.log('🛑 Web4 gateway server stopped');
    }
    if (sandbox) {
      console.log('🧹 Tearing down sandbox...');
      await sandbox.tearDown();
    }
  });

  test('should complete full NFT marketplace flow', async () => {
    console.log('\n📝 Test: Full marketplace flow (mint → list → buy → complete)...');

    // Override RPC URL once for entire test
    await page.evaluate((url) => {
      window.testRpcUrl = url;
      window.getRpcUrl = () => url;
    }, rpcUrl);

    // Set up credential storage and mocking
    await page.evaluate(({ sellerAccount, sellerKeyPair, sellerPrivateKey, sellerPublicKey, buyerAccount, buyerKeyPair, buyerPrivateKey, buyerPublicKey }) => {
      // Create an in-memory credential store
      window.testCredentialStore = [];

      // IMPORTANT: The accountId in credentials must match the implicit account ID
      // which is derived from the Ed25519 public key (hex of public key data)
      // The sellerAccount and buyerAccount passed in are already the implicit account IDs

      // Create seller credentials (using the pre-generated keypair)
      const sellerCreds = {
        accountId: sellerAccount,  // This is the implicit account ID (hex of public key)
        signingKeyPair: sellerKeyPair,
        encryptionKeyPair: {
          private_scalar_hex: sellerPrivateKey,
          public_key_base64: sellerPublicKey
        }
      };

      // Create buyer credentials (using the pre-generated keypair)
      const buyerCreds = {
        accountId: buyerAccount,  // This is the implicit account ID (hex of public key)
        signingKeyPair: buyerKeyPair,
        encryptionKeyPair: {
          private_scalar_hex: buyerPrivateKey,
          public_key_base64: buyerPublicKey
        }
      };

      // Store both credentials
      window.testCredentialStore.push({
        id: 'Seller Wallet',
        name: 'Seller Wallet',
        password: btoa(JSON.stringify(sellerCreds)),
        type: 'password'
      });

      window.testCredentialStore.push({
        id: 'Buyer Wallet',
        name: 'Buyer Wallet',
        password: btoa(JSON.stringify(buyerCreds)),
        type: 'password'
      });

      // Track current credential selection (default to seller)
      window.testSelectCredential = 0;

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

      // Mock navigator.credentials.get to return selected credential
      navigator.credentials.get = async (options) => {
        if (options.password && window.testCredentialStore.length > 0) {
          const index = window.testSelectCredential || 0;
          return window.testCredentialStore[index];
        }
        return null;
      };

      // Mock navigator.credentials.store
      navigator.credentials.store = async (credential) => {
        return credential;
      };
    }, {
      sellerAccount: sellerAccount,
      sellerKeyPair: sellerKeyPair.toString(),
      sellerPrivateKey: scalarToBuffer(sellerRistrettoPrivateKey).toString('hex'),
      sellerPublicKey: Buffer.from(RistrettoPoint.BASE.multiply(sellerRistrettoPrivateKey).toRawBytes()).toString('base64'),
      buyerAccount: buyerAccount,
      buyerKeyPair: buyerKeyPair.toString(),
      buyerPrivateKey: scalarToBuffer(buyerRistrettoPrivateKey).toString('hex'),
      buyerPublicKey: Buffer.from(RistrettoPoint.BASE.multiply(buyerRistrettoPrivateKey).toRawBytes()).toString('base64')
    });

    // Log credential creation
    console.log('  🔑 Created seller credential: Seller Wallet');
    console.log(`      Account: ${sellerAccount}`);
    console.log('  🔑 Created buyer credential: Buyer Wallet');
    console.log(`      Account: ${buyerAccount}`);

    // Set up common fields
    await page.fill('#common-contract', contractAccount);
    await page.fill('#common-token-id', 'test_nft_1');

    // ========================================
    // Step 1: Mint NFT
    // ========================================
    console.log('\n  📝 Step 1: Minting NFT...');

    // Switch to mint tab
    await page.click('button.tab:has-text("Mint NFT")');

    // Fill in content and deposit
    await page.fill('#mint-content-text', 'This is my secret NFT content!');
    await page.fill('#mint-deposit', '0.1');

    // Click mint button
    await page.click('#mint-panel button:has-text("Mint NFT")');

    // Wait for either result or error
    try {
      await Promise.race([
        page.waitForSelector('#mint-result.show', { timeout: 40000 }),
        page.waitForSelector('#mint-error.show', { timeout: 40000 }),
      ]);
    } catch (error) {
      await page.screenshot({ path: 'test-results/mint-timeout.png' });
      console.log('    ❌ Mint timeout - neither result nor error shown');
      throw error;
    }

    // Check if there's an error
    const mintErrorVisible = await page.isVisible('#mint-error.show');
    if (mintErrorVisible) {
      const errorText = await page.textContent('#mint-error');
      console.log('    ❌ Mint error:', errorText);
      await page.screenshot({ path: 'test-results/mint-error.png' });
      throw new Error(`Mint failed: ${errorText}`);
    }

    // Verify mint success
    const mintResultText = await page.textContent('#mint-result-content');
    expect(mintResultText).toContain('test_nft_1');
    expect(mintResultText).toContain(sellerAccount);
    console.log('    ✅ NFT minted successfully');

    // ========================================
    // Step 2: List NFT for sale
    // ========================================
    console.log('\n  📝 Step 2: Listing NFT for sale...');

    await page.click('button.tab:has-text("List for Sale")');

    // Fill in price (contract and token ID already in common fields)
    await page.fill('#list-price', '2.5');

    await page.click('#list-panel button:has-text("List for Sale")');
    await page.waitForSelector('#list-result.show', { timeout: 30000 });

    const listResultText = await page.textContent('#list-result-content');
    expect(listResultText).toContain('test_nft_1');
    expect(listResultText).toContain('2.5 NEAR');
    console.log('    ✅ NFT listed successfully');

    // ========================================
    // Step 2a: Seller can view their NFT
    // ========================================
    console.log('\n  📝 Step 2a: Verifying seller can view their NFT...');

    await page.click('button.tab:has-text("View NFT")');
    await page.screenshot({ path: 'test-results/01-seller-viewing-nft.png' });

    // Clear any previous results
    await page.evaluate(() => {
      document.getElementById('view-error').classList.remove('show');
      document.getElementById('view-result').classList.remove('show');
    });

    await page.click('#view-panel button:has-text("Decrypt & View Content")');

    // Wait for either result or error
    await Promise.race([
      page.waitForSelector('#view-result.show', { timeout: 30000 }),
      page.waitForSelector('#view-error.show', { timeout: 30000 }),
    ]);

    const sellerViewError = await page.isVisible('#view-error.show');
    expect(sellerViewError).toBe(false);

    const sellerViewResult = await page.textContent('#view-result-content');
    expect(sellerViewResult).toContain('This is my secret NFT content!');
    console.log('    ✅ Seller successfully viewed NFT content');
    await page.screenshot({ path: 'test-results/02-seller-viewing-success.png' });

    // ========================================
    // Step 2b: Buyer cannot view NFT (not owner yet)
    // ========================================
    console.log('\n  📝 Step 2b: Verifying buyer cannot view NFT (not owner)...');

    // Switch to buyer credential
    await page.evaluate(() => {
      window.testSelectCredential = 1; // Select buyer (index 1)
    });

    console.log('  🔑 Switched to buyer credential: Buyer Wallet');
    await page.screenshot({ path: 'test-results/03-buyer-credential-selected.png' });

    // Clear previous results
    await page.evaluate(() => {
      document.getElementById('view-error').classList.remove('show');
      document.getElementById('view-result').classList.remove('show');
    });

    // Try to view - should fail
    await page.click('#view-panel button:has-text("Decrypt & View Content")');

    await Promise.race([
      page.waitForSelector('#view-result.show', { timeout: 30000 }),
      page.waitForSelector('#view-error.show', { timeout: 30000 }),
    ]);

    const buyerViewError = await page.isVisible('#view-error.show');
    expect(buyerViewError).toBe(true);

    const buyerErrorText = await page.textContent('#view-error');
    console.log(`    ✅ Buyer correctly blocked from viewing: ${buyerErrorText.substring(0, 50)}...`);
    await page.screenshot({ path: 'test-results/04-buyer-viewing-blocked.png' });

    // ========================================
    // Step 3: Buy NFT
    // ========================================
    console.log('\n  📝 Step 3: Buying NFT...');

    // Buyer is already selected from previous step
    console.log('  🔑 Using buyer credential: Buyer Wallet');

    await page.click('button.tab:has-text("Buy NFT")');
    await page.screenshot({ path: 'test-results/05-buy-nft-tab.png' });

    // Contract and token ID already in common fields, just click buy

    await page.click('#buy-panel button:has-text("Buy NFT")');
    await page.waitForSelector('#buy-result.show', { timeout: 30000 });

    const buyResultText = await page.textContent('#buy-result-content');
    expect(buyResultText).toContain('test_nft_1');
    expect(buyResultText).toContain('Funds in escrow');
    console.log('    ✅ NFT purchased successfully');
    await page.screenshot({ path: 'test-results/06-buy-success.png' });

    // ========================================
    // Step 4: Complete sale with re-encryption
    // ========================================
    console.log('\n  📝 Step 4: Completing sale...');

    // Switch back to seller credential
    await page.evaluate(() => {
      window.testSelectCredential = 0; // Select seller (index 0)
    });

    console.log('  🔑 Switched back to seller credential: Seller Wallet');

    await page.click('button.tab:has-text("Complete Sale")');

    // Contract and token ID already in common fields, just click complete

    await page.click('#complete-panel button:has-text("Complete Sale")');
    await page.waitForSelector('#complete-result.show', { timeout: 30000 });

    const completeResultText = await page.textContent('#complete-result-content');
    expect(completeResultText).toContain('test_nft_1');
    expect(completeResultText).toContain('Sale completed');
    console.log('    ✅ Sale completed successfully');
    await page.screenshot({ path: 'test-results/07-sale-completed.png' });

    // ========================================
    // Step 5: Buyer can now view NFT (new owner)
    // ========================================
    console.log('\n  📝 Step 5: Verifying buyer can now view NFT (new owner)...');

    // Switch to buyer credential
    await page.evaluate(() => {
      window.testSelectCredential = 1; // Select buyer (index 1)
    });

    console.log('  🔑 Switched to buyer credential: Buyer Wallet');

    await page.click('button.tab:has-text("View NFT")');
    await page.screenshot({ path: 'test-results/08-buyer-viewing-after-purchase.png' });

    // Clear previous results
    await page.evaluate(() => {
      document.getElementById('view-error').classList.remove('show');
      document.getElementById('view-result').classList.remove('show');
    });

    await page.click('#view-panel button:has-text("Decrypt & View Content")');

    await Promise.race([
      page.waitForSelector('#view-result.show', { timeout: 30000 }),
      page.waitForSelector('#view-error.show', { timeout: 30000 }),
    ]);

    const buyerViewError2 = await page.isVisible('#view-error.show');
    expect(buyerViewError2).toBe(false);

    const buyerViewResult = await page.textContent('#view-result-content');
    expect(buyerViewResult).toContain('This is my secret NFT content!');
    console.log('    ✅ Buyer successfully viewed NFT content (after purchase)');
    await page.screenshot({ path: 'test-results/09-buyer-viewing-success.png' });

    // ========================================
    // Step 6: Seller can no longer view NFT (no longer owner)
    // ========================================
    console.log('\n  📝 Step 6: Verifying seller can no longer view NFT...');

    // Switch back to seller credential
    await page.evaluate(() => {
      window.testSelectCredential = 0; // Select seller (index 0)
    });

    console.log('  🔑 Switched to seller credential: Seller Wallet');
    await page.screenshot({ path: 'test-results/10-seller-credential-selected.png' });

    // Clear previous results
    await page.evaluate(() => {
      document.getElementById('view-error').classList.remove('show');
      document.getElementById('view-result').classList.remove('show');
    });

    // Try to view - should fail now
    await page.click('#view-panel button:has-text("Decrypt & View Content")');

    await Promise.race([
      page.waitForSelector('#view-result.show', { timeout: 30000 }),
      page.waitForSelector('#view-error.show', { timeout: 30000 }),
    ]);

    const sellerViewError2 = await page.isVisible('#view-error.show');
    expect(sellerViewError2).toBe(true);

    const sellerErrorText = await page.textContent('#view-error');
    console.log(`    ✅ Seller correctly blocked from viewing: ${sellerErrorText.substring(0, 50)}...`);
    await page.screenshot({ path: 'test-results/11-seller-viewing-blocked.png' });

    console.log('\n✅ Full marketplace flow completed successfully!');
    console.log('📸 Screenshots saved to test-results/ directory');
  });
});
