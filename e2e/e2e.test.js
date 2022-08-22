import { connect, keyStores, WalletConnection } from 'near-api-js';
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
    const nearConnection  = await connect(connectionConfig);    
    const accountId = await (await readFile('neardev/dev-account')).toString();
    const account = await nearConnection.account(accountId);
    const result = await account.functionCall({
        contractId: accountId,
        methodName: 'run_script',
        args: {
            script: `print('hello');(function() { return 1234; })();`
        }
    });
    expect(result.receipts_outcome[0].outcome.logs[0]).toBe('hello');
    expect(Buffer.from(result.status.SuccessValue, 'base64').toString()).toBe('"1234"');
});

test('should submit javascript and call ', async () => {
    const nearConnection  = await connect(connectionConfig);    
    const accountId = await (await readFile('neardev/dev-account')).toString();
    const account = await nearConnection.account(accountId);
    await account.functionCall({
        contractId: accountId,
        methodName: 'submit_script',
        args: {
            script: `print('world');(function() { return 5678; })();`
        }
    });
    const result = await account.functionCall({
        contractId: accountId,
        methodName: 'run_script_for_account',
        args: {
            account_id: accountId
        }
    });
    expect(result.receipts_outcome[0].outcome.logs[0]).toBe('world');
    expect(Buffer.from(result.status.SuccessValue, 'base64').toString()).toBe('"5678"');
}, 20000);