const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * سكريبت لضغط ملفات المتصفح بعد البناء لتسهيل عملية التحديث المباشر
 * Script to zip browser files after build for easier Live Update
 */

// Check possible build locations - Prioritize the one where build:prod outputs
const possibleSourcePaths = [
  path.resolve(process.cwd(), 'Backend/dist/browser'),   // Absolute check for Backend dist
  path.resolve(process.cwd(), 'dist/mobile/browser'),    // Fallback for mobile specific build
  path.resolve(process.cwd(), 'dist/browser')           // Standard production build fallback
];

let sourceDir = null;
for (const p of possibleSourcePaths) {
  if (fs.existsSync(p)) {
    sourceDir = p;
    break;
  }
}

// Fixed output path: The user wants it inside Backend/dist/browser/
// Since we are now in Backend/scripts/, .. is Backend/
const outputZip = path.join(__dirname, '..', 'dist', 'browser', 'bundle.zip');
const outputDir = path.dirname(outputZip);

console.log('📦 Moving to zip build files...');

try {
  if (!sourceDir) {
    console.error(`❌ Error: Distribution folder not found. Tested paths: \n- ${possibleSourcePaths.join('\n- ')}`);
    console.error('Please run "npm run build:prod" or "npm run android:run" first.');
    process.exit(1);
  }

  console.log(`📂 Found source at: ${sourceDir}`);
  console.log(`🎯 Output target: ${outputZip}`);

  // Ensure target directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // CRITICAL: Capacitor/Capgo requires index.html at the root of the zip.
  // Angular SSR builds often output index.csr.html instead of index.html.
  const indexHtml = path.join(sourceDir, 'index.html');
  const indexCsrHtml = path.join(sourceDir, 'index.csr.html');
  if (!fs.existsSync(indexHtml) && fs.existsSync(indexCsrHtml)) {
    console.log('📄 [Fix] Copying index.csr.html to index.html for Capacitor compatibility...');
    fs.copyFileSync(indexCsrHtml, indexHtml);
  }

  // Use @capgo/cli to create a cross-platform compatible ZIP
  // This avoids "Windows path not supported" errors during unzip on Android/iOS
  // The command creates the zip in the current working directory
  const bundleId = 'com.kenouz.bookstore2';
  const tempZipName = 'bundle.zip'; // Changed to explicitly include .zip
  const command = `npx -y @capgo/cli@latest bundle zip ${bundleId} --path "${sourceDir}" --name ${tempZipName} --no-code-check`;
  
  execSync(command, { stdio: 'inherit' });

  // Move the generated zip to the target destination if it's not already there
  const generatedZip = path.resolve(process.cwd(), tempZipName);
  if (fs.existsSync(generatedZip)) {
    console.log(`🚚 Moving generated zip to target: ${outputZip}`);
    if (fs.existsSync(outputZip)) fs.unlinkSync(outputZip);
    fs.renameSync(generatedZip, outputZip);
  }

  console.log(`✅ Bundle created successfully: ${outputZip}`);
} catch (error) {
  console.error('❌ حدث خطأ أثناء ضغط الملفات:', error.message);
  process.exit(1);
}
