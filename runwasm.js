import {readFileSync} from 'fs';
(async function() {
//const wasm = readFileSync('./out/main.wasm');
const wasm = readFileSync('./main.wasm');
    const instance = (await WebAssembly.instantiate(wasm, {
    })).instance.exports;
    console.log(instance.run_script());
})();