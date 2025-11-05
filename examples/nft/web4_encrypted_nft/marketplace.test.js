import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import { Sandbox, DEFAULT_PRIVATE_KEY, DEFAULT_PUBLIC_KEY } from 'near-sandbox';
import { KeyPair, transactions, utils } from 'near-api-js';
import crypto from 'crypto';
import {
  NearRpcClient,
  broadcastTxCommit,
  viewAccessKey,
} from '@near-js/jsonrpc-client';
import { RistrettoPoint } from '@noble/curves/ed25519';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFile as fsReadFile } from 'fs/promises';

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
    sellerAccount = 'seller.test.near';
    buyerAccount = 'buyer.test.near';

    await createAccount(contractAccount);
    sellerKeyPair = await createAccount(sellerAccount);
    buyerKeyPair = await createAccount(buyerAccount);

    // Deploy contract
    console.log('📦 Deploying contract...');
    const wasmPath = path.join(__dirname, '../out/nft.wasm');
    const wasmCode = await readFile(wasmPath);
    await deployContract(contractAccount, wasmCode);

    // Generate Ristretto keypairs
    console.log('🔑 Generating Ristretto keypairs...');
    sellerRistrettoPrivateKey = bufferToScalar(crypto.randomBytes(32));
    buyerRistrettoPrivateKey = bufferToScalar(crypto.randomBytes(32));

    console.log(`  Seller NEAR: ${sellerAccount}`);
    console.log(`  Buyer NEAR: ${buyerAccount}`);

    // Start HTTP server to serve the HTML file
    console.log('🌐 Starting HTTP server...');
    const htmlContent = await fsReadFile(path.join(__dirname, 'marketplace.html'), 'utf-8');

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
        waitUntil: 'networkidle',
        timeout: 60000
      });

      // Wait for libraries to load
      await page.waitForFunction(() => {
        return window.RistrettoPoint && window.nearApi && window.nearRpc && window.nearRpc.viewFunctionAsJson;
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
    if (sandbox) {
      console.log('🧹 Tearing down sandbox...');
      await sandbox.tearDown();
    }
  });

  test('should mint an NFT', async () => {
    console.log('\n📝 Test: Minting NFT...');

    // Switch to mint tab
    await page.click('button.tab:has-text("Mint NFT")');

    // Fill in the form
    await page.fill('#mint-contract', contractAccount);
    await page.fill('#mint-owner', sellerAccount);
    await page.fill('#mint-private-key', scalarToBuffer(sellerRistrettoPrivateKey).toString('hex'));
    await page.fill('#mint-signer-key', sellerKeyPair.toString());
    await page.fill('#mint-token-id', 'test_nft_1');
    await page.fill('#mint-content-text', 'This is my secret NFT content!');
    await page.fill('#mint-deposit', '0.1');

    // Override RPC URL to point to sandbox
    await page.evaluate((url) => {
      window.testRpcUrl = url;
      // Override getRpcUrl function
      window.getRpcUrl = () => url;
    }, rpcUrl);

    // Click mint button
    await page.click('button:has-text("Mint NFT")');

    // Wait for either result or error
    try {
      await Promise.race([
        page.waitForSelector('#mint-result.show', { timeout: 40000 }),
        page.waitForSelector('#mint-error.show', { timeout: 40000 }),
      ]);
    } catch (error) {
      // Take screenshot for debugging
      await page.screenshot({ path: 'test-results/mint-timeout.png' });
      console.log('❌ Neither result nor error shown');
      throw error;
    }

    // Check if there's an error
    const errorVisible = await page.isVisible('#mint-error.show');
    if (errorVisible) {
      const errorText = await page.textContent('#mint-error');
      console.log('❌ Mint error:', errorText);
      await page.screenshot({ path: 'test-results/mint-error.png' });
      throw new Error(`Mint failed: ${errorText}`);
    }

    // Verify success
    const resultText = await page.textContent('#mint-result-content');
    expect(resultText).toContain('test_nft_1');
    expect(resultText).toContain(sellerAccount);

    console.log('  ✅ NFT minted successfully');
  });

  test('should list NFT for sale', async () => {
    console.log('\n📝 Test: Listing NFT for sale...');

    // Switch to list tab
    await page.click('button.tab:has-text("List for Sale")');

    // Fill in the form
    await page.fill('#list-contract', contractAccount);
    await page.fill('#list-seller', sellerAccount);
    await page.fill('#list-signer-key', sellerKeyPair.toString());
    await page.fill('#list-token-id', 'test_nft_1');
    await page.fill('#list-price', '2.5');

    // Override RPC URL
    await page.evaluate((url) => {
      window.getRpcUrl = () => url;
    }, rpcUrl);

    // Click list button
    await page.click('button:has-text("List for Sale")');

    // Wait for result
    await page.waitForSelector('#list-result.show', { timeout: 30000 });

    // Verify success
    const resultText = await page.textContent('#list-result-content');
    expect(resultText).toContain('test_nft_1');
    expect(resultText).toContain('2.5 NEAR');

    console.log('  ✅ NFT listed successfully');
  });

  test('should buy NFT', async () => {
    console.log('\n📝 Test: Buying NFT...');

    // Switch to buy tab
    await page.click('button.tab:has-text("Buy NFT")');

    // Generate buyer's public key
    const buyerPublicKey = window.RistrettoPoint.BASE.multiply(buyerRistrettoPrivateKey);
    const buyerPublicKeyBase64 = Buffer.from(buyerPublicKey.toRawBytes()).toString('base64');

    // Fill in the form
    await page.fill('#buy-contract', contractAccount);
    await page.fill('#buy-buyer', buyerAccount);
    await page.fill('#buy-signer-key', buyerKeyPair.toString());
    await page.fill('#buy-buyer-pubkey', buyerPublicKeyBase64);
    await page.fill('#buy-token-id', 'test_nft_1');

    // Override RPC URL
    await page.evaluate((url) => {
      window.getRpcUrl = () => url;
    }, rpcUrl);

    // Click buy button
    await page.click('button:has-text("Buy NFT")');

    // Wait for result
    await page.waitForSelector('#buy-result.show', { timeout: 30000 });

    // Verify success
    const resultText = await page.textContent('#buy-result-content');
    expect(resultText).toContain('test_nft_1');
    expect(resultText).toContain('Funds in escrow');

    console.log('  ✅ NFT purchased successfully');
  });

  test('should complete sale with re-encryption', async () => {
    console.log('\n📝 Test: Completing sale...');

    // Switch to complete tab
    await page.click('button.tab:has-text("Complete Sale")');

    // Fill in the form
    await page.fill('#complete-contract', contractAccount);
    await page.fill('#complete-seller', sellerAccount);
    await page.fill('#complete-signer-key', sellerKeyPair.toString());
    await page.fill('#complete-seller-private-key', scalarToBuffer(sellerRistrettoPrivateKey).toString('hex'));
    await page.fill('#complete-token-id', 'test_nft_1');

    // Override RPC URL
    await page.evaluate((url) => {
      window.getRpcUrl = () => url;
    }, rpcUrl);

    // Click complete button
    await page.click('button:has-text("Complete Sale")');

    // Wait for result
    await page.waitForSelector('#complete-result.show', { timeout: 30000 });

    // Verify success
    const resultText = await page.textContent('#complete-result-content');
    expect(resultText).toContain('test_nft_1');
    expect(resultText).toContain('Sale completed');

    console.log('  ✅ Sale completed successfully');
  });

  test('should handle file upload for WASM minting', async () => {
    console.log('\n📝 Test: Minting WASM NFT...');

    // Switch to mint tab
    await page.click('button.tab:has-text("Mint NFT")');

    // Change to file mode
    await page.selectOption('#mint-content-type', 'file');

    // Create a small test WASM file
    const testWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]); // WASM header

    // Set up file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('label[for="mint-content-file"]'),
    ]);

    // Create a temporary file
    const tempPath = path.join(__dirname, 'temp_test.wasm');
    await require('fs').promises.writeFile(tempPath, testWasm);

    await fileChooser.setFiles(tempPath);

    // Fill in the form
    await page.fill('#mint-token-id', 'wasm_nft_1');
    await page.fill('#mint-deposit', '0.2');

    // Override RPC URL
    await page.evaluate((url) => {
      window.getRpcUrl = () => url;
    }, rpcUrl);

    // Click mint button
    await page.click('button:has-text("Mint NFT")');

    // Wait for result
    await page.waitForSelector('#mint-result.show', { timeout: 30000 });

    // Verify success
    const resultText = await page.textContent('#mint-result-content');
    expect(resultText).toContain('wasm_nft_1');

    // Clean up temp file
    await require('fs').promises.unlink(tempPath);

    console.log('  ✅ WASM NFT minted successfully');
  });
});
