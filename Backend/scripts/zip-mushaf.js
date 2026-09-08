const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * سكريبت لضغط ملفات تطبيق المصحف بعد البناء للتحديث المباشر
 * Script to zip Mushaf browser files after build for Live Update
 */

const possibleSourcePaths = [
  path.resolve(process.cwd(), 'Backend/dist/mushaf-wird/browser'),
  path.resolve(process.cwd(), 'Backend/dist/mushaf-wird'),
  path.resolve(process.cwd(), 'dist/mushaf-wird/browser'),
  path.resolve(process.cwd(), 'dist/mushaf-wird')
];

let sourceDir = null;
for (const p of possibleSourcePaths) {
  if (fs.existsSync(p)) {
    sourceDir = p;
    break;
  }
}

const outputZip = path.join(__dirname, '..', 'dist', 'browser', 'mushaf-bundle.zip');
const outputDir = path.dirname(outputZip);

console.log('📦 Moving to zip Mushaf build files...');

try {
  if (!sourceDir) {
    console.error(`❌ Error: Mushaf distribution folder not found. Tested paths: \n- ${possibleSourcePaths.join('\n- ')}`);
    console.error('Please run "npm run mushaf:build" first.');
    process.exit(1);
  }

  console.log(`📂 Found source at: ${sourceDir}`);
  console.log(`🎯 Output target: ${outputZip}`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const indexHtml = path.join(sourceDir, 'index.html');
  const indexCsrHtml = path.join(sourceDir, 'index.csr.html');
  if (!fs.existsSync(indexHtml) && fs.existsSync(indexCsrHtml)) {
    console.log('📄 [Fix] Copying index.csr.html to index.html for Capacitor compatibility...');
    fs.copyFileSync(indexCsrHtml, indexHtml);
  }

  if (fs.existsSync(outputZip)) {
    fs.unlinkSync(outputZip);
    console.log('🗑️  Removed old mushaf-bundle.zip');
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
  console.log(`✅ Mushaf Bundle created successfully: ${outputZip} (${sizeMB} MB)`);

  // Copy to root dist/browser for Nginx static serving compatibility
  const rootDistZip = path.join(__dirname, '..', '..', 'dist', 'browser', 'mushaf-bundle.zip');
  if (path.resolve(outputZip) !== path.resolve(rootDistZip)) {
    try {
      const rootDistDir = path.dirname(rootDistZip);
      if (!fs.existsSync(rootDistDir)) fs.mkdirSync(rootDistDir, { recursive: true });
      fs.copyFileSync(outputZip, rootDistZip);
      console.log(`📋 Copied bundle to root Nginx dir: ${rootDistZip}`);
    } catch (e) { }
  }
} catch (error) {
  console.error('❌ حدث خطأ أثناء ضغط ملفات المصحف:', error.message);
  process.exit(1);
}
