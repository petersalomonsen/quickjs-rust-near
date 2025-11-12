import { rollupPluginHTML as html } from "@web/rollup-plugin-html";
import { terser } from "rollup-plugin-terser";
import { readFileSync, writeFileSync } from "fs";

export default {
  input: ["./index.html"],
  output: {
    dir: "dist",
    format: "iife",
  },
  plugins: [
    html({
      minify: true,
      extractAssets: false,
      inlineModules: true,
    }),
    terser(),
    {
      name: "bundle-to-contract",
      closeBundle: () => {
        console.log("🔨 Bundling encrypted NFT marketplace into contract...\n");

        // Read the minified HTML
        const htmlContent = readFileSync("dist/index.html").toString();

        console.log("📄 Minified HTML size:", htmlContent.length, "bytes");

        // Read contract template
        const contractTemplate = readFileSync("./contract.js").toString();

        // Base64 encode the HTML
        const base64Html = Buffer.from(htmlContent).toString("base64");

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
      },
    },
  ],
};
