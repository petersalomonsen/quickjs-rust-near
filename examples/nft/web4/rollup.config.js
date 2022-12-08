import html from '@web/rollup-plugin-html';
import { terser } from 'rollup-plugin-terser';
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';

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
      const musicwasmsdir = 'musicwasms';
      const musicwasms = readdirSync(musicwasmsdir);
      writeFileSync('dist/index.html', html);
      unlinkSync(`dist/main.js`);
    }
  }],
};