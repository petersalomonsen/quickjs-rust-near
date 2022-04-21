import {execSync } from 'child_process';
import {readFileSync,writeFileSync} from 'fs';
execSync('wasm2wat main.wasm -o main.wat');
let mainwat = readFileSync('main.wat').toString();
mainwat = mainwat.split('\n').filter(line => line.indexOf('  (export ') != 0 || line.indexOf('  (export "run_script" ') == 0).join('\n');
/*writeFileSync('main.wat', mainwat);

execSync('wat2wasm main.wat -o main.wasm');
execSync('wasm-opt --remove-unused-module-elements main.wasm -o main.wasm');
execSync('wasm2wat main.wasm -o main.wat');*/
