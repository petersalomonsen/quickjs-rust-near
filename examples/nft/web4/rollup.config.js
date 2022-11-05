import html from '@web/rollup-plugin-html';
import { terser } from 'rollup-plugin-terser';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';

export default {
  input: ['./index.html'],
  output: { dir: 'dist' },
  plugins: [html({ minify: true }), terser(), {
    name: 'inline-js',
    closeBundle: () => {
      const js = readFileSync('dist/main.js').toString();
      const html = readFileSync('dist/index.html').toString()
        .replace(`<script type="module" src="./main.js"></script>`, `<script type="module">${js}</script>`);
      const serviceworker = readFileSync('serviceworker.js');
      const musicwasm = readFileSync('music.wasm');
      writeFileSync('dist/index.html', html);
      unlinkSync(`dist/main.js`);
      const contractFileName = '../src/contract.js';
      const contractjs = readFileSync(contractFileName).toString();
      const contractlines = contractjs.split('\n');
      contractlines[0] = `const INDEX_HTML = '${Buffer.from(html).toString('base64')}'`;
      contractlines[1] = `const SERVICEWORKER = '${Buffer.from(serviceworker).toString('base64')}'`;
      contractlines[2] = `const MUSIC_WASM = '${Buffer.from(musicwasm).toString('base64')}'`;
      writeFileSync('../src/contract.js', contractlines.join('\n'));
    }
  }],
};