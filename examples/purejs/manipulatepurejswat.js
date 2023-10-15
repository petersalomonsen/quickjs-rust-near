import { readFile, writeFile } from 'fs/promises';
import { createQuickJS } from './compiler/quickjs.js';
    
const quickjs = await createQuickJS();
const quickjs_bytecode = quickjs.compileToByteCode(/*javascript*/`
export function hello() {
    const name = JSON.parse(env.input()).name;
    env.value_return('hello ' + name);
}

export function add() {
    const input = JSON.parse(env.input());
    const result = (input.a + input.b);
    env.value_return(JSON.stringify({result}));
}
`, 'contract.js');


let purejswat = (await readFile('./purejs.wat')).toString();

const data_section_end = parseInt(process.argv[process.argv.length - 1].match(/end\=0x([0-9a-f]+)/)[1], 16);
const contractDataString = `(data $.quickjs_bytecode (i32.const ${data_section_end}) "${Array.from(quickjs_bytecode).map(c => '\\' + c.toString(16).padStart(2, '0')).join('')}")\n`;

purejswat = purejswat.substring(0, purejswat.lastIndexOf(')')) + `\n${contractDataString})`;
await writeFile('purejs.wat', purejswat);