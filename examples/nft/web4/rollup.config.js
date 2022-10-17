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
      writeFileSync('../src/web4content.rs', `
        pub static INDEX_HTML: &str = "${Buffer.from(html).toString('base64')}";
        pub static SERVICEWORKER: &str = "${Buffer.from(serviceworker).toString('base64')}";
        pub static MUSIC_WASM: &str = "${Buffer.from(musicwasm).toString('base64')}";

        
        `);
    }
  }],
};