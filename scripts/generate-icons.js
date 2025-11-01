// Simple script to generate PWA icons
// Run with: node scripts/generate-icons.js
// Or use an online tool like https://www.pwabuilder.com/imageGenerator

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

console.log('PWA Icon Generation Instructions:');
console.log('=====================================');
console.log('1. Create a 512x512px icon with "CSMS" text');
console.log('2. Use your brand color (#3c55f3) as background');
console.log('3. Save as PNG with transparent or white background');
console.log('4. Use an online tool to resize:');
console.log('   - https://www.pwabuilder.com/imageGenerator');
console.log('   - https://realfavicongenerator.net/');
console.log('\nRequired sizes:', sizes.join(', '));
console.log('\nSave all icons to: public/icons/');
console.log('Naming format: icon-{size}x{size}.png');
console.log('\nAlternatively, open public/icons/generate-icons.html in a browser');
console.log('to generate icons programmatically.');

// Create a simple SVG template
const svgTemplate = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3c55f3;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4f73ff;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="102" fill="url(#grad)"/>
  <text x="256" y="256" font-family="Arial, sans-serif" font-size="120" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">CSMS</text>
</svg>`;

const publicDir = path.join(process.cwd(), 'public');
const iconsDir = path.join(publicDir, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Save SVG template
const svgPath = path.join(iconsDir, 'icon-template.svg');
fs.writeFileSync(svgPath, svgTemplate);
console.log(`\n✓ Created SVG template at: ${svgPath}`);
console.log('   You can convert this to PNG using an image editor or online converter.');

