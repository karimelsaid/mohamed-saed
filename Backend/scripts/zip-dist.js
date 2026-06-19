const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * سكريبت لضغط ملفات المتصفح بعد البناء لتسهيل عملية التحديث المباشر
 * Script to zip browser files after build for easier Live Update
 *
 * Uses the system `zip` command (built into macOS/Linux) instead of
 * @capgo/cli which re-downloads itself on every run and can hang.
 */

// Check possible build locations - Prioritize the one where build:prod outputs
const possibleSourcePaths = [
  path.resolve(process.cwd(), 'Backend/dist/browser'),   // Absolute check for Backend dist
  path.resolve(process.cwd(), 'dist/mobile/browser'),    // Fallback for mobile specific build
  path.resolve(process.cwd(), 'dist/browser')            // Standard production build fallback
];

let sourceDir = null;
for (const p of possibleSourcePaths) {
  if (fs.existsSync(p)) {
    sourceDir = p;
    break;
  }
}

// Fixed output path inside Backend/dist/browser/
const outputZip = path.join(__dirname, '..', 'dist', 'browser', 'bundle.zip');
const outputDir  = path.dirname(outputZip);

console.log('📦 Creating bundle zip...');

try {
  if (!sourceDir) {
    console.error(`❌ Error: Distribution folder not found. Tested paths:\n- ${possibleSourcePaths.join('\n- ')}`);
    console.error('Please run "npm run build:prod" first.');
    process.exit(1);
  }

  console.log(`📂 Source: ${sourceDir}`);
  console.log(`🎯 Output: ${outputZip}`);

  // Ensure target directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // CRITICAL: Capacitor/Capgo requires index.html at the root of the zip.
  // Angular SSR builds often output index.csr.html instead of index.html.
  const indexHtml    = path.join(sourceDir, 'index.html');
  const indexCsrHtml = path.join(sourceDir, 'index.csr.html');
  if (!fs.existsSync(indexHtml) && fs.existsSync(indexCsrHtml)) {
    console.log('📄 [Fix] Copying index.csr.html → index.html for Capacitor compatibility...');
    fs.copyFileSync(indexCsrHtml, indexHtml);
  }

  // Remove old zip first so we always get a fresh file
  if (fs.existsSync(outputZip)) {
    fs.unlinkSync(outputZip);
    console.log('🗑️  Removed old bundle.zip');
  }

  // Use the system `zip` command (built into macOS/Linux) — fast and reliable.
  // -r  : recursive
  // -q  : quiet (no per-file output)
  // -X  : exclude extra attributes (keeps the zip clean for Android/iOS unzip)
  // --exclude: skip source maps and other build artifacts
  const command = `cd "${sourceDir}" && zip -r -q -X "${outputZip}" . --exclude "*.map" --exclude "*.DS_Store" --exclude "__MACOSX/*"`;
  console.log('🔧 Running zip...');
  execSync(command, { stdio: 'inherit' });

  const stats = fs.statSync(outputZip);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✅ Bundle created successfully: ${outputZip} (${sizeMB} MB)`);
} catch (error) {
  console.error('❌ حدث خطأ أثناء ضغط الملفات:', error.message);
  process.exit(1);
}
