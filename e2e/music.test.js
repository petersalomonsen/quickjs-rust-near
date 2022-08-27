import { connect, keyStores, WalletConnection } from 'near-api-js';
import { homedir } from 'os';
import { readFile } from 'fs/promises';
import musicscript from './musicscript.js';

const connectionConfig = {
  networkId: "testnet",
  keyStore: new keyStores.UnencryptedFileSystemKeyStore(`${homedir()}/.near-credentials`),
  nodeUrl: "https://rpc.testnet.near.org",
  walletUrl: "https://wallet.testnet.near.org",
  helperUrl: "https://helper.testnet.near.org",
  explorerUrl: "https://explorer.testnet.near.org",
};

test('should create music', async () => {
    const nearConnection  = await connect(connectionConfig);    
    const accountId = await (await readFile('neardev/dev-account')).toString();
    const account = await nearConnection.account(accountId);
    await account.functionCall({
        contractId: accountId,
        methodName: 'submit_script',
        args: {
            script: musicscript
        }
    });
    const result = await account.functionCall({
        contractId: accountId,
        methodName: 'run_script_for_account_no_return',
        args: {
            account_id: accountId
        },
        gas:  "300000000000000"
    });

    const resultValue = JSON.parse(Buffer.from(result.status.SuccessValue, 'base64').toString());
    expect(resultValue).toEqual([{"time":0,"message":[148,26,100]},{"time":0,"message":[146,60,100]},{"time":166,"message":[146,66,10]},{"time":233,"message":[130,66,0]},{"time":267,"message":[132,26,0]},{"time":333,"message":[146,66,80]},{"time":500,"message":[148,26,100]},{"time":533,"message":[130,66,0]},{"time":567,"message":[132,26,0]},{"time":666,"message":[148,33,100]},{"time":666,"message":[146,62,100]},{"time":667,"message":[130,60,0]},{"time":799,"message":[132,33,0]},{"time":833,"message":[148,36,100]},{"time":966,"message":[132,36,0]},{"time":1000,"message":[146,66,70]},{"time":1166,"message":[148,38,100]},{"time":1166,"message":[146,60,100]},{"time":1200,"message":[130,66,0]},{"time":1299,"message":[132,38,0]},{"time":1333,"message":[130,62,0]},{"time":1500,"message":[148,36,100]},{"time":1500,"message":[146,66,10]},{"time":1567,"message":[130,66,0]},{"time":1666,"message":[146,66,80]},{"time":1666,"message":[146,60,100]},{"time":1700,"message":[132,36,0]},{"time":1833,"message":[148,33,100]},{"time":1833,"message":[130,60,0]},{"time":1866,"message":[130,66,0]},{"time":1966,"message":[132,33,0]},{"time":2000,"message":[146,62,100]},{"time":2166,"message":[148,33,100]},{"time":2299,"message":[132,33,0]},{"time":2333,"message":[148,36,100]},{"time":2333,"message":[146,66,70]},{"time":2333,"message":[130,60,0]},{"time":2400,"message":[132,36,0]},{"time":2500,"message":[148,38,100]},{"time":2500,"message":[146,62,20]},{"time":2533,"message":[130,66,0]},{"time":2567,"message":[130,62,0]},{"time":2633,"message":[132,38,0]},{"time":2666,"message":[-1]}]);

}, 40000);