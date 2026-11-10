const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('  🚀 أداة بناء ملفات الـ EXE لنظام ويندوز (Windows Exe Builder)');
console.log('========================================================\n');

const rootDir = path.resolve(__dirname, '..');
const tempBuildDir = path.join(process.env.LOCALAPPDATA || 'C:\\Users\\karim\\AppData\\Local', 'suit-store-build');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(tempBuildDir)) fs.mkdirSync(tempBuildDir, { recursive: true });
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

console.log('1. تنظيف أي عمليات مفتوحة سابقاً...');
try {
  execSync('powershell -Command "Stop-Process -Name \'*بدل*\' -Force -ErrorAction SilentlyContinue"', { stdio: 'pipe' });
} catch (_) {}

console.log('2. جاري بناء ملفات التثبيت (NSIS Installer & Portable)...');
const electronBuilderCmd = `npx electron-builder --win --config.directories.output="${tempBuildDir.replace(/\\/g, '/')}"`;

try {
  execSync(electronBuilderCmd, { cwd: rootDir, stdio: 'inherit' });
  console.log('\n3. نسخ ملفات الـ EXE إلى مجلد dist في المشروع...');

  const files = fs.readdirSync(tempBuildDir);
  for (const file of files) {
    if (file.endsWith('.exe') || file.endsWith('.yml')) {
      const src = path.join(tempBuildDir, file);
      const dest = path.join(distDir, file);
      fs.copyFileSync(src, dest);
      const stat = fs.statSync(dest);
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
      console.log(`  ✓ ${file} (${sizeMb} MB) -> dist/${file}`);
    }
  }

  console.log('\n========================================================');
  console.log('🎉 تم إنشاء وبناء ملفات الـ EXE بنجاح 100%!');
  console.log(`📂 المجلد: ${distDir}`);
  console.log('========================================================\n');
} catch (err) {
  console.error('\n❌ خطأ أثناء البناء:', err.message);
  process.exit(1);
}

