import { readFile, writeFile } from 'fs/promises';
import { createQuickJS } from '../../quickjslib/js/quickjs.js';

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

const exported_functions = ['hello', 'add'];

let purejswat = (await readFile('./purejs.wat')).toString();

let purejswatlines = purejswat.split('\n');

let insideFunc = false;
const some_js_function_lines = [];
const some_js_function_lines_indices = [];
purejswatlines.forEach((line, ndx) => {
    const has_some_js_function = line.indexOf('some_js_function') >= 0;
    if (!insideFunc && has_some_js_function) {
        if (line.indexOf('(func') >= 0) {
            insideFunc = true;
        }
        some_js_function_lines.push(line);
        some_js_function_lines_indices.push(ndx);
        purejswatlines[ndx] = '';
    } else if (insideFunc) {
        if (line.indexOf('(func') >= 0) {
            insideFunc = false;
            return;
        }
        some_js_function_lines[some_js_function_lines.length - 1] += `\n${line}`;
        purejswatlines[ndx] = '';
    }
});

const data_section_end = parseInt(process.argv[process.argv.length - 1].match(/end\=0x([0-9a-f]+)/)[1], 16);
const contractDataString = `(data $.quickjs_bytecode (i32.const ${data_section_end}) "${Array.from(quickjs_bytecode).map(c => '\\' + c.toString(16).padStart(2, '0')).join('')}")`;
const functionnamestringsstart = data_section_end + quickjs_bytecode.length;
const functionnamestrings = `(data $.function_names (i32.const ${functionnamestringsstart}) "${exported_functions.join('\\00')}\\00")`;

let funcNamePosition = functionnamestringsstart;
exported_functions.forEach(funcName => {
    some_js_function_lines.forEach((val, ndx) => {
        purejswatlines[some_js_function_lines_indices[ndx]] += '\n' +
            val.replaceAll('some_js_function', funcName)
                .replaceAll('456123987', funcNamePosition)
                .replaceAll('123456789', data_section_end)
                .replaceAll('987654321', quickjs_bytecode.length);
    });
    funcNamePosition += funcName.length + 1;
});
purejswat = purejswatlines.join('\n');


purejswat = purejswat.substring(0, purejswat.lastIndexOf(')')) + `\n${contractDataString}\n${functionnamestrings})\n`;
await writeFile('purejs.wat', purejswat);