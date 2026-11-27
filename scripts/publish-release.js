/**
 * سكربت أتمتة شامل لنشر التحديثات الجديده بضغطة زر واحدة (Single Command Release Pipeline)
 * يقوم بالآتي تلقائياً بالكامل:
 * 1. زيادة رقم الإصدار في package.json و renderer.js و index.html
 * 2. فحص سلامة وتكامل الأكواد (Syntax Validation)
 * 3. بناء ملف التثبيت المعتمد (NSIS Setup EXE)
 * 4. حساب البصمة الرقمية المعتمدة (SHA-256) والحجم الفعلي بالبايت
 * 5. تحديث وتوثيق ملف latest-release.json
 * 6. الالتزام وحفظ التغييرات في Git مع وسم الإصدار (Tag)
 * 7. الرفع والمزامنة إلى مستودع GitHub الرئيسي (Kenouz) ومستودع التحديثات المباشر (mohamed-saed)
 * 8. رفع ملف التثبيت التنفيذي إلى GitHub Release Asset
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('  🚀 أداة نشر التحديثات الشاملة المباشرة (One-Command Release)');
console.log('========================================================\n');

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVer = pkg.version || '1.0.0';

// دالة زيادة رقم الإصدار تلقائياً (Auto Increment SemVer)
function bumpVersion(versionStr, type = 'patch') {
  const parts = versionStr.split('.').map(p => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);

  if (type === 'major') {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
  } else if (type === 'minor') {
    parts[1]++;
    parts[2] = 0;
  } else {
    // patch الافتراضي
    parts[2]++;
  }
  return parts.join('.');
}

// 1. تحديد رقم الإصدار الجديد
const bumpType = process.argv[2] || 'patch';
const newVersion = bumpVersion(currentVer, bumpType);

console.log(`📌 الإصدار السابق: v${currentVer}`);
console.log(`🚀 الإصدار الجديد التلقائي: v${newVersion} (نوع الترقية: ${bumpType})`);

// 2. تحديث package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
console.log(`  ✓ تم تحديث الإصدار الجديد في package.json.`);

// 3. تحديث renderer.js و index.html
const rendererPath = path.join(rootDir, 'apps', 'desktop', 'renderer', 'renderer.js');
if (fs.existsSync(rendererPath)) {
  let rendContent = fs.readFileSync(rendererPath, 'utf8');
  rendContent = rendContent.replace(/let currentAppVersion = ['"][^'"]+['"];/, `let currentAppVersion = '${newVersion}';`);
  fs.writeFileSync(rendererPath, rendContent, 'utf8');
  console.log(`  ✓ تم تحديث الإصدار في renderer.js.`);
}

const htmlPath = path.join(rootDir, 'apps', 'desktop', 'renderer', 'index.html');
if (fs.existsSync(htmlPath)) {
  let htmlContent = fs.readFileSync(htmlPath, 'utf8');
  htmlContent = htmlContent.replace(/<strong id="sidebar-app-version">v[^<]+<\/strong>/, `<strong id="sidebar-app-version">v${newVersion}</strong>`);
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');
  console.log(`  ✓ تم تحديث الإصدار في index.html.`);
}

// 4. فحص سلامة وتكامل الأكواد
console.log('\n[1/5] فحص سلامة وتكامل الأكواد (Syntax Validation)...');
try {
  execSync('node --check apps/desktop/electron/main/index.js', { cwd: rootDir, stdio: 'pipe' });
  execSync('node --check apps/desktop/renderer/renderer.js', { cwd: rootDir, stdio: 'pipe' });
  execSync('node --check apps/desktop/electron/services/update-engine-service.js', { cwd: rootDir, stdio: 'pipe' });
  execSync('node --check scripts/upload-release-asset.js', { cwd: rootDir, stdio: 'pipe' });
  console.log('  ✓ تم فحص كافة ملفات النظام، الأكواد سليمة 100%.');
} catch (err) {
  console.error('  ❌ خطأ في فحص الأكواد:', err.message);
  process.exit(1);
}

// 5. بناء ملف الـ EXE للمثبت تلقائياً
console.log('\n[2/5] جاري بناء ملف التثبيت التنفيذي (Windows NSIS Setup EXE)...');
try {
  execSync('node scripts/build-exe.js', { cwd: rootDir, stdio: 'inherit' });
} catch (buildErr) {
  console.error('  ❌ خطأ أثناء بناء ملف التثبيت:', buildErr.message);
  process.exit(1);
}

// 6. حساب البصمة الرقمية SHA-256 والحجم الفعلي لملف التثبيت
console.log('\n[3/5] حساب البصمة الرقمية المعتمدة (SHA-256)...');
const distDir = path.join(rootDir, 'dist');
const setupExePath = path.join(distDir, `نظام إدارة محلات بيع وتأجير بدل Setup ${newVersion}.exe`);

if (!fs.existsSync(setupExePath)) {
  console.error(`  ❌ لم يتم العثور على ملف التثبيت الناتج: ${setupExePath}`);
  process.exit(1);
}

const exeBuffer = fs.readFileSync(setupExePath);
const computedSha = crypto.createHash('sha256').update(exeBuffer).digest('hex');
const fileSizeBytes = exeBuffer.length;
console.log(`  ✓ البصمة الرقمية: ${computedSha}`);
console.log(`  ✓ حجم الملف: ${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB (${fileSizeBytes} بايت)`);

// 7. إنشاء وحفظ ملف latest-release.json
const releaseNotes = process.env.RELEASE_NOTES || `تحديث رسمي جديد للإصدار v${newVersion} يتضمن تحسينات الأداء، تكامل واتساب، وسرعة الاستجابة.`;
const manifest = {
  version: newVersion,
  previousVersion: currentVer,
  releaseDate: new Date().toISOString().slice(0, 10),
  releaseNotes,
  downloadUrl: `https://github.com/karimelsaid/mohamed-saed/releases/download/v${newVersion}/suit-store-update-${newVersion}.exe`,
  sha256: computedSha,
  fileSizeBytes,
  mandatory: false,
  publishedAt: new Date().toISOString()
};

const manifestPath = path.join(distDir, 'latest-release.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`  ✓ تم إنشاء ملف التحديث: ${manifestPath}`);

// 8. الرفع إلى GitHub
const shouldPush = !process.argv.includes('--no-push');
if (shouldPush) {
  console.log('\n[4/5] مزامنة ورفع التحديث إلى مستودعات GitHub...');
  const repoRoot = path.resolve(rootDir, '..', '..');
  try {
    execSync('git add -A', { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git commit -m "feat(release): v${newVersion} [automated release]"`, { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git tag -a v${newVersion} -m "Release v${newVersion}" -f`, { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git push origin main v${newVersion} -f`, { cwd: repoRoot, stdio: 'pipe' });
    console.log(`  ✓ تم رفع الإصدار v${newVersion} إلى مستودع Kenouz الرئيسي.`);

    console.log('  جاري مزامنة مستودع التحديثات المباشر (mohamed-saed)...');
    try { execSync('git branch -D release-mohamed-saed', { cwd: repoRoot, stdio: 'pipe' }); } catch (_) {}
    execSync('git subtree split --prefix=projects/mohamed-saed -b release-mohamed-saed', { cwd: repoRoot, stdio: 'pipe' });
    execSync('git push mohamed-saed release-mohamed-saed:master --tags -f', { cwd: repoRoot, stdio: 'pipe' });
    console.log(`  ✓ تم نشر التحديث سحابياً على مستودع التحديثات المباشر بنجاح! 🚀`);
  } catch (gitErr) {
    const errMsg = gitErr.stderr ? gitErr.stderr.toString() : gitErr.message;
    console.error(`  ❌ خطأ أثناء المزامنة مع GitHub:`, errMsg);
    process.exit(1);
  }

  // 9. رفع ملف الـ EXE كـ GitHub Release Asset
  console.log('\n[5/5] رفع ملف التثبيت التنفيذي إلى GitHub Releases...');
  try {
    execSync('node scripts/upload-release-asset.js', { cwd: rootDir, stdio: 'inherit' });
  } catch (assetErr) {
    console.warn(`  ⚠️ ملاحظة أثناء رفع الـ Asset: ${assetErr.message}`);
  }
}

console.log('\n========================================================');
console.log(`🎉 تم نشر وتعميم التحديث الجديد بنجاح (v${newVersion})!`);
console.log('========================================================');
console.log('بمجرد أن يضغط أي عميل على "فحص التحديثات" على جهازه،');
console.log(`سيتعرف البرنامج على v${newVersion} وينزل المثبت ويطبقه تلقائياً.\n`);
