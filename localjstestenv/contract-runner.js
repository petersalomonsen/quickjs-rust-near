
import { prepareWASM } from './prepare-wasm.js';
import * as nearenv from './wasm-near-environment.js';

export async function getContractInstanceExports(wasmbinary) {
    const preparedwasmbinary = await prepareWASM(wasmbinary);
    
    const memory = new WebAssembly.Memory({
        initial: 1024,
        maximum: 2048
    });
    nearenv.set_wasm_memory(memory);

    const wasmmod = await WebAssembly.instantiate(preparedwasmbinary, {
        "env": nearenv
    });

    return { nearenv, memory, exports: wasmmod.instance.exports };
}