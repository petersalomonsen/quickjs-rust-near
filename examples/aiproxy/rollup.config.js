import html from '@web/rollup-plugin-html';
import { terser } from 'rollup-plugin-terser';
import { readFileSync, writeFileSync } from 'fs';

const { AI_PROXY_BASEURL, RPC_URL, NETWORK_ID } = process.env;

if (!AI_PROXY_BASEURL) {
  throw ('Environment variable AI_PROXY_BASEURL not set. Must be set to the base URL of where the AI proxy is hosted');
}
if (!RPC_URL) {
  throw ('Environment variable RPC_URL not set. Must be set to the NEAR RPC node URL');
}
if (!NETWORK_ID) {
  throw ('Environment variable NETWORK_ID not set. Must be set to the NEAR protocol network id ( e.g. mainnet, testnet )');
}

export default {
  input: ['./web/index.html'],
  output: { dir: 'dist' },
  plugins: [html({ minify: true }), terser(), {
    name: 'inline-js',
    closeBundle: () => {
      const js = readFileSync('dist/main.js').toString()
        .replace('http://localhost:3000', AI_PROXY_BASEURL)
        .replace('http://localhost:14500', RPC_URL)
        .replace('"sandbox"', `"${NETWORK_ID}"`);

      const html = readFileSync('dist/index.html').toString()
        .replace(`<script type="module" src="./main.js"></script>`, `<script type="module">${js}</script>`);

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
