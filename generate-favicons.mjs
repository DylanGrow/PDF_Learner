// generate-favicons.mjs
// Generates favicon-192.png and favicon-512.png from the SVG favicon
// Uses only built-in Node.js APIs + the 'sharp' package (installed temporarily)
// Run: node generate-favicons.mjs

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Install sharp temporarily if not present
try {
  execSync("npm list sharp --depth=0", { stdio: "ignore", cwd: __dirname });
} catch {
  console.log("Installing sharp for favicon generation...");
  execSync("npm install --save-dev sharp", { stdio: "inherit", cwd: __dirname });
}

const { default: sharp } = await import("sharp");

const svgPath = path.join(__dirname, "favicon.svg");
const svgData = readFileSync(svgPath);

for (const size of [192, 512]) {
  const outPath = path.join(__dirname, `favicon-${size}.png`);
  await sharp(svgData)
    .resize(size, size)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);
  console.log(`✅ Generated favicon-${size}.png`);
}

console.log("All favicons generated.");
