import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { minify } from "html-minifier-terser";

console.log("🔨 Bundling encrypted NFT marketplace into contract...\n");

// Read the HTML file
const htmlContent = readFileSync("./index.html", "utf-8");

console.log("📄 Original HTML size:", htmlContent.length, "bytes");

// Minify the HTML (keep CDN script imports intact)
const minifiedHtml = await minify(htmlContent, {
  collapseWhitespace: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: true,
  // Don't remove script type="module" attributes
  removeAttributeQuotes: false,
  // Keep external script sources
  removeScriptTypeAttributes: false,
});

console.log("📄 Minified HTML size:", minifiedHtml.length, "bytes");

// Create dist directory
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", minifiedHtml);

// Read contract template
const contractTemplate = readFileSync("./contract.js", "utf-8");

// Base64 encode the minified HTML
const base64Html = Buffer.from(minifiedHtml).toString("base64");

console.log("📦 Base64 encoded size:", base64Html.length, "bytes");

// Replace placeholder with base64 encoded HTML
const contract = contractTemplate.replace(
  '"__VIEWER_HTML_BASE64__"',
  '"' + base64Html + '"',
);

// Write the bundled contract
const outputPath = "./contract-bundle.js";
writeFileSync(outputPath, contract);

console.log("\n✅ Contract bundle created:", outputPath);
console.log("   Total size:", contract.length, "bytes");
console.log("\n💡 To deploy:");
console.log("   yarn examples-nft-encrypted-web4bundle");
console.log("   Then upload with post_javascript");
