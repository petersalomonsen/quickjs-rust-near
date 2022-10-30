import { connect, keyStores } from 'near-api-js';
import { homedir } from 'os';
import { readFile } from 'fs/promises';

const connectionConfig = {
    networkId: "testnet",
    keyStore: new keyStores.UnencryptedFileSystemKeyStore(`${homedir()}/.near-credentials`),
    nodeUrl: "https://rpc.testnet.near.org",
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
    explorerUrl: "https://explorer.testnet.near.org",
};

test('should run custom javascript in contract', async () => {
    const nearConnection = await connect(connectionConfig);
    const accountId = await (await readFile('neardev/dev-account')).toString();

    const account = await nearConnection.account(accountId);
    await account.functionCall({
        contractId: accountId,
        methodName: 'post_quickjs_bytecode',
        args: {
            bytecodebase64: await (await readFile('e2e/quickjsbytecode.bin')).toString('base64')
        }
    });
    const result = await account.viewFunction(accountId, 'web4_get', { request: { path: '/index.html' } });
    expect(result.contentType).toBe('text/html; charset=UTF-8');
    expect(result.body).toBeDefined();

    const wasmresult = await account.viewFunction(accountId, 'web4_get', { request: { path: '/music.wasm' } });
    expect(wasmresult.contentType).toBe('application/wasm; charset=UTF-8');
    expect(wasmresult.body).toBeDefined();
}, 20000);
