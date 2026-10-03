// Raster fallbacks for the same SVG brand mark; no external icon fonts or CDN.
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const directory = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("favicon.svg", directory), "utf8");
for (const [name, size] of [["favicon-32.png", 32], ["favicon-48.png", 48], ["favicon-96.png", 96], ["icon-192.png", 192], ["icon-512.png", 512]]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(fileURLToPath(new URL(name, directory)));
}
// Touch and maskable icons use a solid square field. The motif is inset into
// the central safe area so platform masks cannot cut off the map layers.
for (const [name, size, inset] of [["apple-touch-icon.png", 180, 0], ["icon-maskable-512.png", 512, 8]]) {
  const square = svg.replace('rx="14"', 'rx="0"').replace('<g fill=', `<g transform="translate(${inset} ${inset}) scale(${(64 - inset * 2) / 64})" fill=`);
  await sharp(Buffer.from(square)).resize(size, size).png().toFile(fileURLToPath(new URL(name, directory)));
}
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((data, i) => {
  const entry = 6 + i * 16;
  header[entry] = header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(data.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
await writeFile(new URL("favicon.ico", directory), Buffer.concat([header, ...images]));
console.log("Built crisp favicon, touch, shortcut and maskable icons.");
