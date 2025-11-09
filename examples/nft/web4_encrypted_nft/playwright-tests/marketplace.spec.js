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

    const nftJavascript = await readFile(path.join(__dirname, '../contract.js'));
    await functionCall(contractAccount, contractAccount, 'post_javascript', {
      javascript: nftJavascript.toString(),
    });
    console.log('  ✅ JavaScript uploaded');

    // Generate Ristretto keypairs
    console.log('🔑 Generating Ristretto keypairs...');
    sellerRistrettoPrivateKey = bufferToScalar(crypto.randomBytes(32));
    buyerRistrettoPrivateKey = bufferToScalar(crypto.randomBytes(32));

    console.log(`  Seller NEAR: ${sellerAccount}`);
    console.log(`  Buyer NEAR: ${buyerAccount}`);

    // Start HTTP server to serve the HTML file
    console.log('🌐 Starting HTTP server...');
    const htmlContent = await fsReadFile(path.join(__dirname, '../index.html'), 'utf-8');

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
      console.log('🛑 HTTP server stopped');
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

    // ========================================
    // Step 1: Mint NFT
    // ========================================
    console.log('\n  📝 Step 1: Minting NFT...');

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

    await page.fill('#list-contract', contractAccount);
    await page.fill('#list-seller', sellerAccount);
    await page.fill('#list-signer-key', sellerKeyPair.toString());
    await page.fill('#list-token-id', 'test_nft_1');
    await page.fill('#list-price', '2.5');

    await page.click('#list-panel button:has-text("List for Sale")');
    await page.waitForSelector('#list-result.show', { timeout: 30000 });

    const listResultText = await page.textContent('#list-result-content');
    expect(listResultText).toContain('test_nft_1');
    expect(listResultText).toContain('2.5 NEAR');
    console.log('    ✅ NFT listed successfully');

    // ========================================
    // Step 3: Buy NFT
    // ========================================
    console.log('\n  📝 Step 3: Buying NFT...');

    await page.click('button.tab:has-text("Buy NFT")');

    // Generate buyer's public key
    const buyerPublicKey = RistrettoPoint.BASE.multiply(buyerRistrettoPrivateKey);
    const buyerPublicKeyBase64 = Buffer.from(buyerPublicKey.toRawBytes()).toString('base64');

    await page.fill('#buy-contract', contractAccount);
    await page.fill('#buy-buyer', buyerAccount);
    await page.fill('#buy-signer-key', buyerKeyPair.toString());
    await page.fill('#buy-buyer-pubkey', buyerPublicKeyBase64);
    await page.fill('#buy-token-id', 'test_nft_1');

    await page.click('#buy-panel button:has-text("Buy NFT")');
    await page.waitForSelector('#buy-result.show', { timeout: 30000 });

    const buyResultText = await page.textContent('#buy-result-content');
    expect(buyResultText).toContain('test_nft_1');
    expect(buyResultText).toContain('Funds in escrow');
    console.log('    ✅ NFT purchased successfully');

    // ========================================
    // Step 4: Complete sale with re-encryption
    // ========================================
    console.log('\n  📝 Step 4: Completing sale...');

    await page.click('button.tab:has-text("Complete Sale")');

    await page.fill('#complete-contract', contractAccount);
    await page.fill('#complete-seller', sellerAccount);
    await page.fill('#complete-signer-key', sellerKeyPair.toString());
    await page.fill('#complete-seller-private-key', scalarToBuffer(sellerRistrettoPrivateKey).toString('hex'));
    await page.fill('#complete-token-id', 'test_nft_1');

    await page.click('#complete-panel button:has-text("Complete Sale")');
    await page.waitForSelector('#complete-result.show', { timeout: 30000 });

    const completeResultText = await page.textContent('#complete-result-content');
    expect(completeResultText).toContain('test_nft_1');
    expect(completeResultText).toContain('Sale completed');
    console.log('    ✅ Sale completed successfully');

    console.log('\n✅ Full marketplace flow completed successfully!');
  });
});
