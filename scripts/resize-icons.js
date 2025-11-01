// Icon Resizer Script
// Run: node scripts/resize-icons.js
// Requires: npm install sharp (or use online tool)

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];
const sourceLogo = path.join(__dirname, '../public/icons/logo.png');
const outputDir = path.join(__dirname, '../public/icons');

// Check if source exists
if (!fs.existsSync(sourceLogo)) {
  console.error('❌ Source logo not found:', sourceLogo);
  console.log('Please ensure logo.png exists in public/icons/');
  process.exit(1);
}

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
  console.log('✓ Using Sharp for image processing');
} catch (e) {
  console.log('⚠ Sharp not installed. Installing...');
  console.log('Run: npm install sharp');
  console.log('\nAlternatively, use an online tool:');
  console.log('1. Go to: https://www.pwabuilder.com/imageGenerator');
  console.log('2. Upload logo.png');
  console.log('3. Download all sizes');
  console.log('4. Save to public/icons/ as icon-{size}x{size}.png');
  process.exit(1);
}

async function resizeIcons() {
  try {
    console.log('📸 Resizing logo to required sizes...\n');
    
    for (const size of sizes) {
      const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);
      
      await sharp(sourceLogo)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✓ Created icon-${size}x${size}.png`);
    }
    
    console.log('\n✅ All icons generated successfully!');
    console.log('📁 Icons saved to: public/icons/');
  } catch (error) {
    console.error('❌ Error resizing images:', error.message);
    process.exit(1);
  }
}

resizeIcons();

