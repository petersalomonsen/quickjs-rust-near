import { rollupPluginHTML as html } from "@web/rollup-plugin-html";
import { terser } from "rollup-plugin-terser";
import { readFileSync, writeFileSync } from "fs";

export default {
  input: ["./decrypt_nft_viewer.html"],
  output: { dir: "dist" },
  plugins: [
    html({ minify: true }),
    terser(),
    {
      name: "bundle-to-contract",
      closeBundle: () => {
        console.log('🔨 Bundling encrypted NFT viewer into contract...\n');

        // Read the minified HTML
        const htmlContent = readFileSync("dist/decrypt_nft_viewer.html").toString();

        console.log('📄 Minified HTML size:', htmlContent.length, 'bytes');

        // Base64 encode
        const base64 = Buffer.from(htmlContent).toString('base64');
        console.log('📦 Base64 encoded size:', base64.length, 'bytes');

        // Read contract template
        const contractTemplate = readFileSync("./contract.js").toString();

        // Replace placeholder with base64 encoded HTML
        const contract = contractTemplate.replace(
          '"__VIEWER_HTML_BASE64__"',
          '`' + base64 + '`'
        );

        // Write the bundled contract
        const outputPath = "./contract-bundle.js";
        writeFileSync(outputPath, contract);

        console.log('\n✅ Contract bundle created:', outputPath);
        console.log('   Total size:', contract.length, 'bytes');
        console.log('\n💡 To deploy:');
        console.log('   cp web4_encrypted_nft/contract-bundle.js src/contract.js');
        console.log('   ./build.sh');
      },
    },
  ],
};
