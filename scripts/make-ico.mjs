import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

async function main() {
  const src = path.resolve('public/icons/icon-512x512.png');
  const outDir = path.resolve('build');
  const out = path.join(outDir, 'icon.ico');
  if (!fs.existsSync(src)) {
    console.error(`Source icon not found: ${src}`);
    process.exit(1);
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  // Generate multiple PNG sizes for a valid ICO (NSIS is picky)
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngBuffers = [];
  for (const size of sizes) {
    const b = await sharp(src).resize(size, size, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer();
    pngBuffers.push(b);
  }
  const ico = await pngToIco(pngBuffers);
  fs.writeFileSync(out, ico);
  console.log(`Wrote ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });



