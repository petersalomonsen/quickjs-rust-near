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
    const result = await account.functionCall({
        contractId: accountId,
        methodName: 'run_script',
        args: {
            script: `print('hello');(function() { return 1234; })();`
        }
    });
    expect(result.receipts_outcome[0].outcome.logs[0]).toBe('hello');
    expect(Buffer.from(result.status.SuccessValue, 'base64').toString()).toBe('"1234"');
}, 40000);

test('should submit javascript and call ', async () => {
    const nearConnection = await connect(connectionConfig);
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
        },
        gas: "300000000000000"
    });
    expect(result.receipts_outcome[0].outcome.logs[0]).toBe('world');
    expect(Buffer.from(result.status.SuccessValue, 'base64').toString()).toBe('"5678"');
}, 40000);

test('should verify signed message in javascript', async () => {
    const nearConnection = await connect(connectionConfig);
    const accountId = await (await readFile('neardev/dev-account')).toString();
    const account = await nearConnection.account(accountId);
    const messageToBeSigned = 'the expected message to be signed';

    const keyPair = await account.connection.signer.keyStore.getKey(connectionConfig.networkId, accountId);
    const signature = await keyPair.sign(new TextEncoder().encode(messageToBeSigned));
    const signatureBase64 = btoa(String.fromCharCode(...signature.signature));

    await account.functionCall({
        contractId: accountId,
        methodName: 'submit_script',
        args: {
            script: `
const args = JSON.parse(env.input());
const result = env.verify_signed_message('${messageToBeSigned}', args.signature, '${accountId}') ?
                    'valid' : 'invalid';
env.value_return(JSON.stringify(result));            `
        }
    });

    await account.functionCall({
        contractId: accountId,
        methodName: 'store_signing_key',
        args: {}
    });
    const result = await account.viewFunction(
        accountId,
        'run_script_for_account_no_return',
        {
            account_id: accountId,
            signature: signatureBase64
        }
    );
    expect(result).toBe('valid');
}, 40000);

