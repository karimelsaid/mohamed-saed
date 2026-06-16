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

  const bundleId = 'com.kenouz.mushafwird';
  const tempZipName = 'mushaf-bundle.zip';
  const command = `npx -y @capgo/cli@latest bundle zip ${bundleId} --path "${sourceDir}" --name ${tempZipName} --no-code-check`;
  
  execSync(command, { stdio: 'inherit' });

  const generatedZip = path.resolve(process.cwd(), tempZipName);
  if (fs.existsSync(generatedZip)) {
    console.log(`🚚 Moving generated zip to target: ${outputZip}`);
    if (fs.existsSync(outputZip)) fs.unlinkSync(outputZip);
    fs.renameSync(generatedZip, outputZip);
  }

  console.log(`✅ Mushaf Bundle created successfully: ${outputZip}`);
} catch (error) {
  console.error('❌ حدث خطأ أثناء ضغط ملفات المصحف:', error.message);
  process.exit(1);
}
