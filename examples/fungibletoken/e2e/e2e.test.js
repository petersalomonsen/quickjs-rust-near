import { connect, keyStores } from 'near-api-js';
import { Worker } from 'near-workspaces';
import { before, after, test, describe } from 'node:test';
import { expect } from 'chai';

const connectionConfig = {
    networkId: "sandbox",
    keyStore: new keyStores.InMemoryKeyStore(),
    nodeUrl: "https://rpc.testnet.near.org"
};

describe('Fungible token contract', () => {
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
    let bob;
    let alice;

    /**
     * @type {import('near-workspaces').KeyPair}
     */
    let contractAccountKeyPair;

    before(async () => {

        worker = await Worker.init();

        connectionConfig.nodeUrl = worker.provider.connection.url;
        root = worker.rootAccount;

        bob = await worker.rootAccount.createAccount('bob.test.near');
        alice = await worker.rootAccount.createAccount('alice.test.near');

        contract = await root.devDeploy('out/fungible_token.wasm');
        await contract.call(contract.accountId, 'new_default_meta', { owner_id: 'bob.test.near', total_supply: 1_000_000n.toString() });
        contractAccountKeyPair = await contract.getKey();
        connectionConfig.keyStore.setKey("sandbox", contract.accountId, contractAccountKeyPair);
    });
    after(async () => {
        await worker.tearDown();
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
                javascript: `
                export function transfer_2_000_to_alice() {
                    const amount = 2_000n;
                    const transfer_id = env.signer_account_id() + '_' + new Date().getTime();
                    env.set_data(transfer_id, JSON.stringify({receiver_id: env.signer_account_id(), refund_amount: (amount / 2n).toString()}));
                    env.ft_transfer('alice.test.near', amount.toString());
                    env.value_return(transfer_id);
                }

                export function refund() {
                    const { transfer_id } = JSON.parse(env.input());
                    const {refund_amount, receiver_id} = JSON.parse(env.get_data(transfer_id));
                    env.clear_data(transfer_id);
                    env.ft_transfer(receiver_id, refund_amount);
                }
                `
            }
        });
        await bob.call(accountId, 'storage_deposit', {
            account_id: 'bob.test.near',
            registration_only: true,
        }, {
            attachedDeposit: 1_0000_0000000000_0000000000n.toString()
        });
        await alice.call(accountId, 'storage_deposit', {
            account_id: 'alice.test.near',
            registration_only: true,
        }, {
            attachedDeposit: 1_0000_0000000000_0000000000n.toString()
        });

        expect(await contract.view('ft_balance_of', { account_id: 'bob.test.near' })).to.equal(1_000_000n.toString());

        const transfer_id = await bob.call(accountId, 'call_js_func',
            {
                function_name: "transfer_2_000_to_alice"
            }, {
            attachedDeposit: '1'
        });

        expect(await contract.view('ft_balance_of', { account_id: 'bob.test.near' })).to.equal(998_000n.toString());
        expect(await contract.view('ft_balance_of', { account_id: 'alice.test.near' })).to.equal(2_000n.toString());
        await alice.call(accountId, 'call_js_func',
            {
                function_name: "refund",
                transfer_id
            }, {
            attachedDeposit: '1'
        });
        expect(await contract.view('ft_balance_of', { account_id: 'bob.test.near' })).to.equal(999_000n.toString());
        expect(await contract.view('ft_balance_of', { account_id: 'alice.test.near' })).to.equal(1_000n.toString());
    });
});
