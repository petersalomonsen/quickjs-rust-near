import { connect, keyStores } from 'near-api-js';
import { Worker } from 'near-workspaces';
import { before, after, test, describe, afterEach } from 'node:test';
import { expect } from 'chai';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';

const connectionConfig = {
    networkId: "sandbox",
    keyStore: new keyStores.InMemoryKeyStore(),
    nodeUrl: "https://rpc.testnet.near.org"
};

describe('Fungible token contract', { only: true }, () => {
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
     * @type {import('near-workspaces').NearAccount}
     */
    let alice;

    /**
     * @type {import('near-workspaces').KeyPair}
     */
    let contractAccountKeyPair;

    before(async () => {

        worker = await Worker.init();

        connectionConfig.nodeUrl = worker.provider.connection.url;
        root = worker.rootAccount;

        alice = await worker.rootAccount.createAccount('alice.test.near');

        contract = await root.devDeploy('out/fungible_token.wasm');
        await contract.call(contract.accountId, 'new_default_meta', { owner_id: contract.accountId, total_supply: 1_000_000_000_000n.toString() });
        contractAccountKeyPair = await contract.getKey();
        connectionConfig.keyStore.setKey("sandbox", contract.accountId, contractAccountKeyPair);
        await alice.call(contract.accountId, 'storage_deposit', {
            account_id: 'alice.test.near',
            registration_only: true,
        }, {
            attachedDeposit: 1_0000_0000000000_0000000000n.toString()
        });
    });
    after(async () => {
        await worker.tearDown();
    });

    test('should run custom javascript transfer functions in contract with function access keys, and without attaching deposits', { only: true }, async () => {
        const nearConnection = await connect(connectionConfig);
        const accountId = contract.accountId;

        const account = await nearConnection.account(accountId);
        const javascript = (await readFile(new URL('aiconversation.js', import.meta.url))).toString()
            .replace("REPLACE_REFUND_SIGNATURE_PUBLIC_KEY", JSON.stringify(Array.from((await contract.getKey()).getPublicKey().data)));

        const real_conversation_id = `alice.test.near_${new Date().getTime()}`;;
        const conversation_id = createHash('sha256').update(Buffer.from(real_conversation_id, 'utf8')).digest('hex');

        await account.functionCall({
            contractId: accountId,
            methodName: 'post_javascript',
            gas: '300000000000000',
            args: {
                javascript
            }
        });

        await contract.call(accountId, 'ft_transfer', {
            receiver_id: 'alice.test.near',
            amount: 1_000_000n.toString(),
        }, {
            attachedDeposit: 1n.toString()
        });

        await alice.call(accountId, 'call_js_func', {
            function_name: "start_ai_conversation",
            conversation_id
        });

        expect(await contract.view('ft_balance_of', { account_id: 'alice.test.near' })).to.equal(0n.toString());
        const conversation_data = await contract.view('view_js_func', { function_name: "view_ai_conversation", conversation_id });

        expect(conversation_data.receiver_id).to.equal('alice.test.near');
        expect(conversation_data.amount).to.equal(1_000_000n.toString());

        const refund_message = JSON.stringify({ receiver_id: 'alice.test.near', refund_amount: 1000n.toString(), conversation_id });
        const refund_message_hashed = createHash('sha256').update(Buffer.from(refund_message, 'utf8')).digest();
        const signature = (await contract.getKey()).sign(Uint8Array.from(refund_message_hashed));

        await alice.call(accountId, 'call_js_func',
            {
                function_name: "refund_unspent",
                signature: Array.from(signature.signature),
                refund_message
            });

        expect(await contract.view('ft_balance_of', { account_id: 'alice.test.near' })).to.equal(1_000n.toString());
    });
});
