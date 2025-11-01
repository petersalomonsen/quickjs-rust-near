import { readFileSync, writeFileSync } from 'fs';
import { minify } from 'html-minifier-terser';

console.log('🔨 Building encrypted NFT contract with embedded viewer...\n');

// Read the HTML file
const htmlPath = './decrypt_nft_viewer.html';
const html = readFileSync(htmlPath, 'utf-8');

console.log('📄 Read HTML file:', htmlPath);
console.log('   Original size:', html.length, 'bytes');

// Minify HTML
const minified = await minify(html, {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  useShortDoctype: true,
  minifyCSS: true,
  minifyJS: true,
});

console.log('   Minified size:', minified.length, 'bytes');
console.log('   Reduction:', ((1 - minified.length / html.length) * 100).toFixed(1) + '%');

// Base64 encode
const base64 = Buffer.from(minified).toString('base64');
console.log('   Base64 size:', base64.length, 'bytes');

// Read contract template
const contractTemplate = readFileSync('./contract.js', 'utf-8');

// Replace placeholder with base64 encoded HTML
const contract = contractTemplate.replace(
  '"__VIEWER_HTML_BASE64__"',
  '`' + base64 + '`'
);

// Write output
const outputPath = './contract-bundle.js';
writeFileSync(outputPath, contract);

console.log('\n✅ Contract bundle created:', outputPath);
console.log('   Total size:', contract.length, 'bytes');
console.log('\n💡 Next steps:');
console.log('   1. Copy this to ../src/contract.js');
console.log('   2. Run ./build.sh to compile');
console.log('   3. Deploy to NEAR');
