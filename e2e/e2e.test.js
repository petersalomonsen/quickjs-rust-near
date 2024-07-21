import { Worker } from 'near-workspaces';
import { before, after, test, describe } from 'node:test';
import { expect } from 'chai';

describe('run simple js', () => {
    /**
     * @type {Worker}
     */
    let worker;

    /**
     * @type {Account}
     */
    let root;

    /**
     * @type {Contract}
     */
    let contract;

    /**
     * @type {KeyPair}
     */
    let contractAccountKeyPair;

    before(async () => {
        worker = await Worker.init();
        root = worker.rootAccount;
        contract = await root.devDeploy('out/main.wasm');
        contractAccountKeyPair = await contract.getKey();
    });
    after(async () => {
        await worker.tearDown();
    });
    test('should run custom javascript in contract', async () => {
        const result = await contract.callRaw(contract.accountId, 'run_script', {
            script: `print('hello');(function() { return 1234; })();`
        });
        expect(result.receipts_outcomes[0].outcome.logs[0]).to.equal('hello');
        expect(Buffer.from(result.status.SuccessValue, 'base64').toString()).to.equal('"1234"');
    });

    test('should submit javascript and call ', async () => {
        await contract.call(
            contract.accountId, 'submit_script',
            {
                script: `print('world');(function() { return 5678; })();`
            }
        );
        const result = await contract.callRaw(
            contract.accountId,
            'run_script_for_account',
            { account_id: contract.accountId }, {
            gas: "300000000000000"
        }
        );

        expect(Buffer.from(result.status.SuccessValue, 'base64').toString()).to.equal('"5678"');
        expect(result.receipts_outcomes[0].outcome.logs[0]).to.equal('world');
    }, 40000);

    test('should verify signed message in javascript', async () => {
        const keyPair = contractAccountKeyPair;
        const messageToBeSigned = 'the expected message to be signed';


        const signature = await keyPair.sign(new TextEncoder().encode(messageToBeSigned));
        const signatureBase64 = btoa(String.fromCharCode(...signature.signature));

        await contract.call(
            contract.accountId,
            'submit_script',
            {
                script: `
const args = JSON.parse(env.input());
const result = env.verify_signed_message('${messageToBeSigned}', args.signature, '${contract.accountId}') ?
                    'valid' : 'invalid';
env.value_return(JSON.stringify(result));            `
            }
        );

        await contract.call(
            contract.accountId,
            'store_signing_key',
            {}
        );
        const result = await contract.view(
            'run_script_for_account_no_return',
            {
                account_id: contract.accountId,
                signature: signatureBase64
            }
        );
        expect(result).to.equal('valid');
    }, 40000);

});