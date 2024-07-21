import { test } from 'node:test';
import { readFile } from "fs/promises";
import { getContractInstanceExports } from "../../../localjstestenv/contract-runner.js";
import { expect } from 'chai';

test('should find exported javascript methods as contract methods and run them', async () => {    
    const { exports, nearenv } = await getContractInstanceExports(await readFile('./purejs.wasm'));
    nearenv.set_args({ name: 'peter' });
    exports.hello();
    expect(nearenv.latest_return_value).to.equal('hello peter');

    nearenv.set_args({ a: 22, b: 23 });
    exports.add();
    expect(JSON.parse(nearenv.latest_return_value).result).to.equal(45);
});