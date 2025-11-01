# PowerShell script to resize icons using Windows built-in tools
# Run: powershell -ExecutionPolicy Bypass -File scripts/resize-icons-powershell.ps1

$sourceLogo = "public/icons/logo.png"
$outputDir = "public/icons"
$sizes = @(72, 96, 128, 144, 152, 192, 384, 512)

# Check if source exists
if (-not (Test-Path $sourceLogo)) {
    Write-Host "❌ Source logo not found: $sourceLogo" -ForegroundColor Red
    exit 1
}

Write-Host "📸 Resizing logo to required sizes...`n" -ForegroundColor Cyan

# Check if ImageMagick is available
$magick = Get-Command magick -ErrorAction SilentlyContinue

if ($magick) {
    Write-Host "✓ Using ImageMagick`n" -ForegroundColor Green
    foreach ($size in $sizes) {
        $outputPath = "$outputDir/icon-${size}x${size}.png"
        & magick $sourceLogo -resize "${size}x${size}" $outputPath
        Write-Host "✓ Created icon-${size}x${size}.png" -ForegroundColor Green
    }
    Write-Host "`n✅ All icons generated successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠ ImageMagick not found." -ForegroundColor Yellow
    Write-Host "`nPlease install ImageMagick:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://imagemagick.org/script/download.php" -ForegroundColor Yellow
    Write-Host "2. Or use: winget install ImageMagick.ImageMagick" -ForegroundColor Yellow
    Write-Host "`nAlternatively, use online tool:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://www.pwabuilder.com/imageGenerator" -ForegroundColor Yellow
    Write-Host "2. Upload logo.png" -ForegroundColor Yellow
    Write-Host "3. Download all sizes" -ForegroundColor Yellow
    Write-Host "4. Save to public/icons/ as icon-{size}x{size}.png" -ForegroundColor Yellow
    exit 1
}

