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

test('should run custom javascript (quickjs bytecode ) in contract', async () => {
    const nearConnection = await connect(connectionConfig);
    const accountId = await (await readFile('neardev/dev-account')).toString();

    const account = await nearConnection.account(accountId);
    await account.functionCall({
        contractId: accountId,
        methodName: 'post_quickjs_bytecode',
        gas: '300000000000000',
        args: {
            bytecodebase64: await (await readFile('e2e/quickjsbytecode.bin')).toString('base64')
        }
    });
    const result = await account.viewFunction({ contractId: accountId, methodName: 'web4_get', args: { request: { path: '/index.html' } } });
    expect(result.contentType).toBe('text/html; charset=UTF-8');
    expect(result.body).toBeDefined();

    const wasmresult = await account.viewFunction({ contractId: accountId, methodName: 'web4_get', args: { request: { path: '/musicwasms/fall.wasm' } } });
    expect(wasmresult.contentType).toBe('application/wasm');
    expect(wasmresult.body).toBeDefined();
}, 20000);


test('should run custom javascript in contract', async () => {
    const nearConnection = await connect(connectionConfig);
    const accountId = await (await readFile('neardev/dev-account')).toString();

    const account = await nearConnection.account(accountId);
    await account.functionCall({
        contractId: accountId,
        methodName: 'post_javascript',
        gas: '300000000000000',
        args: {
            javascript: await (await readFile('src/contract.js')).toString()
        }
    });
    const result = await account.viewFunction({ contractId: accountId, methodName: 'web4_get', args: { request: { path: '/index.html' } } });
    expect(result.contentType).toBe('text/html; charset=UTF-8');
    expect(result.body).toBeDefined();
}, 20000);

test('should require owners signature to get content', async () => {
    const nearConnection = await connect(connectionConfig);
    const accountId = await (await readFile('neardev/dev-account')).toString();

    const account = await nearConnection.account(accountId);
    await account.functionCall({
        contractId: accountId,
        methodName: 'nft_mint',
        attachedDeposit: '16250000000000000000000',
        gas: '300000000000000',
        args: {
            token_id: `${new Date().getTime()}`,
            token_owner_id: accountId,
            token_metadata: {}
        }
    });
    await account.functionCall({
        contractId: accountId,
        methodName: 'post_javascript',
        gas: '300000000000000',
        args: {
            javascript: `
            export function store_signing_key() {
                if (env.nft_supply_for_owner(env.signer_account_id()) > 0) {
                    env.store_signing_key(env.block_timestamp_ms() + 60 * 1000);
                }
            }
              
            export function web4_get() {
                const request = JSON.parse(env.input()).request;
                let response;

                if(request.path == '/content') {
                    const params = Object.keys(request.query).reduce((p, c) => {
                        p[c] = request.query[c][0];
                        return p;
                    },{});

                    if (env.nft_supply_for_owner(params.account) > 0) {
                                            
                        const validSignature = env.verify_signed_message(params.message, params.signature, '${accountId}');
                
                        if (validSignature) {
                            response = {
                                    contentType: "text/plain; charset=UTF-8",
                                    body: "VALID SIGNATURE",
                            };
                        } else {
                            response = {
                                contentType: "text/plain; charset=UTF-8",
                                body: "INVALID SIGNATURE",
                            };
                        }
                    } else {
                        response = {
                            contentType: "text/plain; charset=UTF-8",
                            body: "NOT OWNER",
                        };
                    }
                } else {
                    response = {
                        contentType: "text/plain; charset=UTF-8",
                        body: "DEFAULT RESPONSE",
                    };
                }
                env.value_return(JSON.stringify(response));     
              }
              
              export function nft_metadata() {
                return {
                  name: "Example NEAR non-fungible token",
                          symbol: "EXAMPLE",
                          icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 288 288'%3E%3Cg id='l' data-name='l'%3E%3Cpath d='M187.58,79.81l-30.1,44.69a3.2,3.2,0,0,0,4.75,4.2L191.86,103a1.2,1.2,0,0,1,2,.91v80.46a1.2,1.2,0,0,1-2.12.77L102.18,77.93A15.35,15.35,0,0,0,90.47,72.5H87.34A15.34,15.34,0,0,0,72,87.84V201.16A15.34,15.34,0,0,0,87.34,216.5h0a15.35,15.35,0,0,0,13.08-7.31l30.1-44.69a3.2,3.2,0,0,0-4.75-4.2L96.14,186a1.2,1.2,0,0,1-2-.91V104.61a1.2,1.2,0,0,1,2.12-.77l89.55,107.23a15.35,15.35,0,0,0,11.71,5.43h3.13A15.34,15.34,0,0,0,216,201.16V87.84A15.34,15.34,0,0,0,200.66,72.5h0A15.35,15.35,0,0,0,187.58,79.81Z'/%3E%3C/g%3E%3C/svg%3E",
                          base_uri: null,
                          reference: null,
                          reference_hash: null,
                };
            }
        `
        }
    });
    let result = await account.viewFunction({ contractId: accountId, methodName: 'web4_get', args: { request: { path: '/' } } });
    expect(result.contentType).toBe('text/plain; charset=UTF-8');
    expect(result.body).toBe('DEFAULT RESPONSE');

    await account.functionCall({
        contractId: accountId,
        methodName: 'call_js_func',
        args: {
            'function_name': 'store_signing_key'
        }
    });

    const messageToBeSigned = 'some message to be signed';
    const keyPair = await account.connection.signer.keyStore.getKey(connectionConfig.networkId, accountId);
    const signature = await keyPair.sign(new TextEncoder().encode(messageToBeSigned));
    const signatureBase64 = btoa(String.fromCharCode(...signature.signature));

    result = await account.viewFunction({
        contractId: accountId, methodName: 'web4_get', args: {
            request: {
                path: `/content`,
                query: {
                    message: [messageToBeSigned],
                    signature: [signatureBase64],
                    account: [accountId]
                }
            }
        }
    });
    expect(result.contentType).toBe('text/plain; charset=UTF-8');
    expect(result.body).toBe('VALID SIGNATURE');

    result = await account.viewFunction({
        contractId: accountId, methodName: 'web4_get', args: {
            request: {
                path: `/content`,
                query: {
                    message: ['blabla'],
                    signature: [signatureBase64],
                    account: [accountId]
                }
            }
        }
    });
    expect(result.contentType).toBe('text/plain; charset=UTF-8');
    expect(result.body).toBe('INVALID SIGNATURE');

    result = await account.viewFunction({
        contractId: accountId, methodName: 'web4_get', args: {
            request: {
                path: `/content`,
                query: {
                    message: ['blabla'],
                    signature: [signatureBase64],
                    account: ['blabla']
                }
            }
        }
    });
    expect(result.contentType).toBe('text/plain; charset=UTF-8');
    expect(result.body).toBe('NOT OWNER');
}, 20000);