/**
 * 🚀 Kenouz Cross-Platform Deployment Script
 * يعمل على Mac و Windows
 * 
 * الاستخدام:
 *   node deploy.js              ← لبناء ونشر واتن (الافتراضي)
 *   node deploy.js --app=kenouz ← لبناء ونشر كنوز
 *   node deploy.js --skip-build ← رفع بدون بناء
 */

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

// =============================================
// ⚙️ الإعدادات — غيّر هنا فقط
// =============================================
const CONFIG = {
  apps: {
    watin:  'npm run watin:build:prod',
    kenouz: 'npm run build:prod',
  },
  defaultApp: 'watin',
  server: 'root@162.35.163.242',
  remotePath: '/var/www/kenouz/',
  localBackend: path.join(__dirname, 'Backend'),
  localDist: path.join(__dirname, 'dist'),
  excludes: [
    'node_modules', 'uploads', 'output.json', 'output_raw.json',
    'requests.log', '*.log', '*.mp3', '*.png', '*.jpg',
    '.env', '.git', '.DS_Store'
  ]
};

// =============================================
// 🔧 تحليل الأوامر
// =============================================
const args = process.argv.slice(2);
const appArg = args.find(a => a.startsWith('--app='));
const appName = appArg ? appArg.split('=')[1] : CONFIG.defaultApp;
const skipBuild = args.includes('--skip-build');
const buildCmd = CONFIG.apps[appName];

if (!buildCmd && !skipBuild) {
  console.error(`❌ تطبيق غير معروف: ${appName}`);
  console.error(`   التطبيقات المتاحة: ${Object.keys(CONFIG.apps).join(', ')}`);
  process.exit(1);
}

// =============================================
// 🛠️ دوال مساعدة
// =============================================
const isWindows = os.platform() === 'win32';

function run(cmd, label) {
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`${label}`);
  console.log(`${'━'.repeat(45)}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: __dirname, shell: true });
  } catch (e) {
    console.error(`\n❌ فشل: ${label}`);
    process.exit(1);
  }
}

function getExcludeFlags() {
  return CONFIG.excludes.map(e => `--exclude='${e}'`).join(' ');
}

function getSCPorRsync(localPath, remoteDest) {
  // rsync متاح على Mac مباشرة، وعلى Windows عبر Git Bash أو WSL
  // نحاول rsync أولاً، وإن لم يوجد نستخدم scp
  const excludes = getExcludeFlags();
  return `rsync -avzc --progress ${excludes} "${localPath}/" "${CONFIG.server}:${remoteDest}"`;
}

// =============================================
// 🚀 التنفيذ
// =============================================
console.log(`\n${'═'.repeat(45)}`);
console.log(`🚀 نشر تطبيق: ${appName.toUpperCase()}`);
console.log(`📦 النظام: ${isWindows ? 'Windows' : 'Mac/Linux'}`);
console.log(`${'═'.repeat(45)}`);

// 1️⃣ البناء
if (!skipBuild) {
  run(buildCmd, `🏗️  جاري البناء: ${buildCmd}`);
} else {
  console.log('\n⏭️  تخطي البناء (--skip-build)');
}

// 2️⃣ رفع Backend
run(
  getSCPorRsync(CONFIG.localBackend, CONFIG.remotePath),
  '📤 جاري رفع Backend...'
);

// 3️⃣ رفع dist
run(
  getSCPorRsync(CONFIG.localDist, CONFIG.remotePath + 'dist/'),
  '📤 جاري رفع dist...'
);

// 4️⃣ إعادة التشغيل
run(
  `ssh ${CONFIG.server} "chmod 755 ${CONFIG.remotePath} && chown -R www-data:www-data ${CONFIG.remotePath}dist && chmod -R 755 ${CONFIG.remotePath}dist && cd ${CONFIG.remotePath} && pm2 restart kenouz-backend && nginx -s reload"`,
  '🔧 جاري ضبط الصلاحيات وإعادة التشغيل...'
);

console.log(`\n${'═'.repeat(45)}`);
console.log(`✅ تم نشر ${appName.toUpperCase()} بنجاح! 🎉`);
console.log(`${'═'.repeat(45)}\n`);
