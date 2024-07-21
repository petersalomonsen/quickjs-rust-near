import { KeyPairEd25519, Worker, BN } from 'near-workspaces';
import { before, after, test, describe } from 'node:test';
import { expect } from 'chai';
import { readFile } from 'fs/promises';
import musicscript from './musicscript.js';
import { wrapJSmusicInTemplate } from '../web4/webassemblymusic/musictemplate.js';

describe('create music in JS', () => {
    /**
     * @type {Worker}
     */
    let worker;

    /**
     * @type {import('near-workspaces').NearAccount}
     */
    let root;

    /**
     * @type {import('near-workspaces').NearAccount}
     */
    let contract;

    /**
     * @type {KeyPairEd25519}
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
    test('should create music', async () => {
        await contract.call(contract.accountId,
            'submit_script',
            {
                script: musicscript
            }
        );
        const result = await contract.call(contract.accountId,
            'run_script_for_account_no_return',
            {
                account_id: contract.accountId
            }, {
            gas: new BN(30 * 10 ** 13)
        }
        );
        expect(result).to.deep.equal([{ "time": 0, "message": [148, 26, 100] }, { "time": 0, "message": [146, 60, 100] }, { "time": 166, "message": [146, 66, 10] }, { "time": 233, "message": [130, 66, 0] }, { "time": 267, "message": [132, 26, 0] }, { "time": 333, "message": [146, 66, 80] }, { "time": 500, "message": [148, 26, 100] }, { "time": 533, "message": [130, 66, 0] }, { "time": 567, "message": [132, 26, 0] }, { "time": 666, "message": [148, 33, 100] }, { "time": 666, "message": [146, 62, 100] }, { "time": 667, "message": [130, 60, 0] }, { "time": 799, "message": [132, 33, 0] }, { "time": 833, "message": [148, 36, 100] }, { "time": 966, "message": [132, 36, 0] }, { "time": 1000, "message": [146, 66, 70] }, { "time": 1166, "message": [148, 38, 100] }, { "time": 1166, "message": [146, 60, 100] }, { "time": 1200, "message": [130, 66, 0] }, { "time": 1299, "message": [132, 38, 0] }, { "time": 1333, "message": [130, 62, 0] }, { "time": 1500, "message": [148, 36, 100] }, { "time": 1500, "message": [146, 66, 10] }, { "time": 1567, "message": [130, 66, 0] }, { "time": 1666, "message": [146, 66, 80] }, { "time": 1666, "message": [146, 60, 100] }, { "time": 1700, "message": [132, 36, 0] }, { "time": 1833, "message": [148, 33, 100] }, { "time": 1833, "message": [130, 60, 0] }, { "time": 1866, "message": [130, 66, 0] }, { "time": 1966, "message": [132, 33, 0] }, { "time": 2000, "message": [146, 62, 100] }, { "time": 2166, "message": [148, 33, 100] }, { "time": 2299, "message": [132, 33, 0] }, { "time": 2333, "message": [148, 36, 100] }, { "time": 2333, "message": [146, 66, 70] }, { "time": 2333, "message": [130, 60, 0] }, { "time": 2400, "message": [132, 36, 0] }, { "time": 2500, "message": [148, 38, 100] }, { "time": 2500, "message": [146, 62, 20] }, { "time": 2533, "message": [130, 66, 0] }, { "time": 2567, "message": [130, 62, 0] }, { "time": 2633, "message": [132, 38, 0] }, { "time": 2666, "message": [-1] }]);
    });

    test('should create and execute music script using function in web app', async () => {
        const scriptToUpload = wrapJSmusicInTemplate(await readFile('./web4/webassemblymusic/sample_music2.js'));
        await contract.call(
            contract.accountId,
            'submit_script',
            {
                script: scriptToUpload
            }
        );
        const result = await contract.view(
            'run_script_for_account_no_return',
            {
                account_id: contract.accountId
            }
        );

        expect(result.length).to.equal(115);
    });
});