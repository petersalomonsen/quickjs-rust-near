import { connect, keyStores } from 'near-api-js';
import { homedir } from 'os';
import { readFile } from 'fs/promises';
import { KeyPair, Worker } from 'near-workspaces';
import { before, after, test, describe } from 'node:test';
import { expect } from 'chai';

const connectionConfig = {
    networkId: "sandbox",
    keyStore: new keyStores.InMemoryKeyStore(),
    nodeUrl: "https://rpc.testnet.near.org"
};

describe('NFT contract', () => {
    /**
     * @type {Worker}
     */
    let worker;

    /**
     * @type {Account}
     */
    let root;

    /**
     * @type {import('near-workspaces').NearAccount}
     */
    let contract;

    /**
     * @type {import('near-workspaces').KeyPair}
     */
    let contractAccountKeyPair;

    before(async () => {
        worker = await Worker.init();
        connectionConfig.nodeUrl = worker.provider.connection.url;
        root = worker.rootAccount;
        contract = await root.devDeploy('out/nft.wasm');
        await contract.call(contract.accountId, 'new', {});
        contractAccountKeyPair = await contract.getKey();
        connectionConfig.keyStore.setKey("sandbox", contract.accountId, contractAccountKeyPair)
    });
    after(async () => {
        await worker.tearDown();
    });
    test('should run custom javascript (quickjs bytecode ) in contract', async () => {
        const nearConnection = await connect(connectionConfig);
        const accountId = contract.accountId;

        const account = await nearConnection.account(accountId);
        await account.functionCall({
            contractId: accountId,
            methodName: 'post_quickjs_bytecode',
            gas: '300000000000000',
            args: {
                bytecodebase64: await (await readFile('e2e/quickjsbytecode.bin')).toString('base64')
            }
        });
        await account.functionCall({
            contractId: accountId,
            methodName: 'post_content',
            args: {
                key: '/index.html',
                valuebase64: await (await readFile('web4/dist/index.html')).toString('base64')
            }
        });
        const result = await account.viewFunction({ contractId: accountId, methodName: 'web4_get', args: { request: { path: '/index.html' } } });
        expect(result.contentType).to.equal('text/html; charset=UTF-8');
        expect(result.body).to.be.a('string');

        await account.functionCall({
            contractId: accountId,
            methodName: 'post_content',
            args: {
                key: '/musicwasms/fall.wasm',
                valuebase64: await (await readFile('web4/musicwasms/fall.wasm')).toString('base64')
            }
        });
        const wasmresult = await account.viewFunction({ contractId: accountId, methodName: 'web4_get', args: { request: { path: '/musicwasms/fall.wasm' } } });
        expect(wasmresult.contentType).to.equal('application/wasm');
        expect(wasmresult.body).to.be.a('string');
    });


    test('should run custom javascript in contract', async () => {
        const nearConnection = await connect(connectionConfig);
        const accountId = contract.accountId;

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
        expect(result.contentType).to.equal('text/html; charset=UTF-8');
        expect(result.body).to.be.a('string');
    });

    test('should require owners signature to get content', async () => {
        const nearConnection = await connect(connectionConfig);
        const accountId = contract.accountId;

        const account = await nearConnection.account(accountId);

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
                                    body: env.base64_encode("VALID SIGNATURE"),
                            };
                        } else {
                            response = {
                                contentType: "text/plain; charset=UTF-8",
                                body: env.base64_encode("INVALID SIGNATURE"),
                            };
                        }
                    } else {
                        response = {
                            contentType: "text/plain; charset=UTF-8",
                            body: env.base64_encode("NOT OWNER"),
                        };
                    }
                } else {
                    response = {
                        contentType: "text/plain; charset=UTF-8",
                        body: env.base64_encode("DEFAULT RESPONSE"),
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

            export function nft_mint() {
                if(env.signer_account_id() != env.current_account_id()) {
                  env.panic('only contract account can mint');
                }
                return JSON.stringify({
                    title: 'test_title',
                    description: 'test_description'
                });
            }
        `
            }
        });
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
        let result = await account.viewFunction({ contractId: accountId, methodName: 'web4_get', args: { request: { path: '/' } } });
        expect(result.contentType).to.equal('text/plain; charset=UTF-8');
        expect(result.body).to.equal(Buffer.from('DEFAULT RESPONSE').toString('base64'));

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
        expect(result.contentType).to.equal('text/plain; charset=UTF-8');
        expect(result.body).to.equal(Buffer.from('VALID SIGNATURE').toString('base64'));

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
        expect(result.contentType).to.equal('text/plain; charset=UTF-8');
        expect(result.body).to.equal(Buffer.from('INVALID SIGNATURE').toString('base64'));

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
        expect(result.contentType).to.equal('text/plain; charset=UTF-8');
        expect(result.body).to.equal(Buffer.from('NOT OWNER').toString('base64'));
    });


    test('should list NFT owners through web4', async () => {
        const nearConnection = await connect(connectionConfig);
        const accountId = contract.accountId;

        const account = await nearConnection.account(accountId);
        await account.functionCall({
            contractId: accountId,
            methodName: 'post_javascript',
            gas: '300000000000000',
            args: {
                javascript: `
              
            export function web4_get() {
                const request = JSON.parse(env.input()).request;
                let response;

                if(request.path == '/nftowners.json') {
                    const tokens = JSON.parse(env.nft_tokens(0,100));
                    response = {
                        contentType: "application/json; charset=UTF-8",
                        body: env.base64_encode(JSON.stringify(tokens.map(t => ({token_id: t.token_id, owner_id: t.owner_id}))))
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

            export function nft_mint() {
                if(env.signer_account_id() != env.current_account_id()) {
                  env.panic('only contract account can mint');
                }
                return JSON.stringify({
                    title: 'test_title',
                    description: 'test_description',
                    media: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 288 288'%3E%3Cg id='l' data-name='l'%3E%3Cpath d='M187.58,79.81l-30.1,44.69a3.2,3.2,0,0,0,4.75,4.2L191.86,103a1.2,1.2,0,0,1,2,.91v80.46a1.2,1.2,0,0,1-2.12.77L102.18,77.93A15.35,15.35,0,0,0,90.47,72.5H87.34A15.34,15.34,0,0,0,72,87.84V201.16A15.34,15.34,0,0,0,87.34,216.5h0a15.35,15.35,0,0,0,13.08-7.31l30.1-44.69a3.2,3.2,0,0,0-4.75-4.2L96.14,186a1.2,1.2,0,0,1-2-.91V104.61a1.2,1.2,0,0,1,2.12-.77l89.55,107.23a15.35,15.35,0,0,0,11.71,5.43h3.13A15.34,15.34,0,0,0,216,201.16V87.84A15.34,15.34,0,0,0,200.66,72.5h0A15.35,15.35,0,0,0,187.58,79.81Z'/%3E%3C/g%3E%3C/svg%3E",
                });
            }
        `
            }
        });
        const mintedTokenIds = [];
        for (let n = 0; n < 3; n++) {
            const token_id = `NFT${new Date().getTime()}`;
            mintedTokenIds.push(token_id);
            await account.functionCall({
                contractId: accountId,
                methodName: 'nft_mint',
                attachedDeposit: '16250000000000000000000',
                gas: '300000000000000',
                args: {
                    token_id: token_id,
                    token_owner_id: accountId,
                    token_metadata: {}
                }
            });
        }

        let result = await account.viewFunction({ contractId: accountId, methodName: 'web4_get', args: { request: { path: '/nftowners.json' } } });
        expect(result.contentType).to.equal('application/json; charset=UTF-8');

        const nftOwners = JSON.parse(Buffer.from(result.body, 'base64').toString());

        expect(nftOwners.find(t => t.token_id == mintedTokenIds[0]).owner_id).to.equal(accountId);
        expect(nftOwners.find(t => t.token_id == mintedTokenIds[1]).owner_id).to.equal(accountId);
        expect(nftOwners.find(t => t.token_id == mintedTokenIds[2]).owner_id).to.equal(accountId);
    });

    test('should forbid mint', async () => {
        const nearConnection = await connect(connectionConfig);
        const accountId = contract.accountId;

        const account = await nearConnection.account(accountId);
        await account.functionCall({
            contractId: accountId,
            methodName: 'post_javascript',
            gas: '300000000000000',
            args: {
                javascript: `              
                export function web4_get() {
                    const request = JSON.parse(env.input()).request;
                    let response;

                    if(request.path == '/nftowners.json') {
                        const tokens = JSON.parse(env.nft_tokens(0,100));
                        response = {
                            contentType: "application/json; charset=UTF-8",
                            body: env.base64_encode(JSON.stringify(tokens.map(t => ({token_id: t.token_id, owner_id: t.owner_id}))))
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

                export function nft_mint() {                
                    env.panic('mint is forbidden');

                    return JSON.stringify({
                        title: 'test_title',
                        description: 'test_description'
                    });
                }
        `
            }
        });
        try {
            await account.functionCall({
                contractId: accountId,
                methodName: 'nft_mint',
                attachedDeposit: '16250000000000000000000',
                gas: '300000000000000',
                args: {
                    token_id: 'aaa' + new Date().getTime(),
                    token_owner_id: accountId,
                    token_metadata: {}
                }
            });
            throw new Error('should not succeed minting');
        } catch (e) {
            expect(e.kind.ExecutionError).to.equal('Smart contract panicked: mint is forbidden');
        }
    });

    test('15 TGas should be sufficient for nft_transfer_payout', async () => {
        const nearConnection = await connect(connectionConfig);
        const accountId = contract.accountId;

        const account = await nearConnection.account(accountId);
        await account.functionCall({
            contractId: accountId,
            methodName: 'post_quickjs_bytecode',
            gas: '300000000000000',
            args: {
                bytecodebase64: await (await readFile('e2e/quickjsbytecode.bin')).toString('base64')
            }
        });

        const token_id = `${new Date().getTime()}`;
        await account.functionCall({
            contractId: accountId,
            methodName: 'nft_mint',
            attachedDeposit: '16250000000000000000000',
            gas: '300000000000000',
            args: {
                token_id,
                token_owner_id: accountId
            }
        });

        const payout = await account.functionCall({
            contractId: accountId,
            methodName: 'nft_transfer_payout',
            gas: '15000000000000',
            attachedDeposit: '1',
            args: {
                token_id,
                receiver_id: 'acl.testnet',
                balance: BigInt(10_0000_00000_00000_00000_00000n).toString()
            }
        });

        expect(JSON.parse(Buffer.from(payout.status.SuccessValue, 'base64').toString()).payout[accountId]).to.equal(BigInt(10_0000_00000_00000_00000_00000n).toString());
        const tokenAfterTransfer = await account.viewFunction({ contractId: accountId, methodName: 'nft_token', args: { token_id } });
        expect(tokenAfterTransfer.owner_id).to.equal('acl.testnet');
    });

    test('should mint and burn', async () => {
        const nearConnection = await connect(connectionConfig);
        const accountId = contract.accountId;

        const account = await nearConnection.account(accountId);
        await account.functionCall({
            contractId: accountId,
            methodName: 'post_javascript',
            gas: '300000000000000',
            args: {
                javascript: `              
                export function web4_get() {
                    const request = JSON.parse(env.input()).request;
                    let response;

                    if(request.path == '/nftowners.json') {
                        const tokens = JSON.parse(env.nft_tokens(0,100));
                        response = {
                            contentType: "application/json; charset=UTF-8",
                            body: env.base64_encode(JSON.stringify(tokens.map(t => ({token_id: t.token_id, owner_id: t.owner_id}))))
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

                export function nft_mint() {                
                    return JSON.stringify({
                        title: 'mint_and_burn',
                        description: 'test_description'
                    });
                }
        `
            }
        });
        const token_id = 'burn_me' + new Date().getTime();

        await account.functionCall({
            contractId: accountId,
            methodName: 'nft_mint',
            attachedDeposit: '16250000000000000000000',
            gas: '300000000000000',
            args: {
                token_id: token_id,
                token_owner_id: accountId,
                token_metadata: {}
            }
        });

        const tokenAfterMint = await account.viewFunction({ contractId: accountId, methodName: 'nft_token', args: { token_id } });
        expect(tokenAfterMint.token_id).to.equal(token_id);

        await account.functionCall({
            contractId: accountId,
            methodName: 'nft_burn',
            attachedDeposit: '1',
            gas: '300000000000000',
            args: {
                token_id: token_id
            }
        });

        const tokenAfterBurn = await account.viewFunction({ contractId: accountId, methodName: 'nft_token', args: { token_id } });
        expect(tokenAfterBurn).to.be.null;

    });
});