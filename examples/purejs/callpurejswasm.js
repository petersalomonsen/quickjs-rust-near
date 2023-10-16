import { readFile } from 'fs/promises';
import { getContractInstanceExports } from '../../localjstestenv/contract-runner.js';
 
const { exports, nearenv } = await getContractInstanceExports(await readFile('./purejs.wasm'));
nearenv.set_args({ name: 'peter' }); 
exports.hello();
console.log(nearenv.latest_return_value);

nearenv.set_args({ a: 22,b: 23 }); 
exports.add();
console.log(nearenv.latest_return_value);