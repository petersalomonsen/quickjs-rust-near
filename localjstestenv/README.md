A minimal environment for simulation of WASM smart contracts
============================================================

Sometimes spinning up near-workspaces might not be needed if you're only going to simulate view methods or storage. By mocking the NEAR environment imports you can easily and fast spin up a smart contract runner for such simple use cases.

Given you have a simple contract `my-contract.wasm` that exports a view function named `hello`, and you can provide `name` as an argument, you can test that it returns a given value like shown in the example below.

```javascript
import { getContractInstanceExports } from "./contract-runner.js";

const { exports, nearenv } = await getContractInstanceExports(await readFile('./my-contract.wasm'));
nearenv.set_args({ name: 'peter' });
exports.hello();
expect(nearenv.latest_return_value).to.equal('hello peter');
```
