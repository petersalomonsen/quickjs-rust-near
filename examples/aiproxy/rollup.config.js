import html from '@web/rollup-plugin-html';
import { terser } from 'rollup-plugin-terser';
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';

export default {
  input: ['./web/index.html'],
  output: { dir: 'dist' },
  plugins: [html({ minify: true }), terser(), {
    name: 'inline-js',
    closeBundle: () => {
      const js = readFileSync('dist/main.js').toString();
      const html = readFileSync('dist/index.html').toString()
        .replace(`<script src="main.js" type="module"></script>`, `<script type="module">${js}</script>`);
      
      writeFileSync('web4.js', `
export function web4_get() {
      env.value_return(JSON.stringify({
            contentType: 'text/html; charset=UTF-8',
            body: '${Buffer.from(html).toString('base64')}'
        })
      );
}
        
      `);
      
    }
  }],
};
