const fs = require('fs');
const { execSync } = require('child_process');

console.log('========================================================');
console.log('  Running Complete Test Suite for Completed Phases');
console.log('========================================================\n');

const testScripts = [
  'scripts/test-phase-0.js',
  'scripts/test-phase-1.js',
  'scripts/test-phase-2.js',
  'scripts/test-phase-3.js',
  'scripts/test-phase-4.js',
  'scripts/test-phase-5.js',
  'scripts/test-phase-6.js',
  'scripts/test-phase-7.js',
  'scripts/test-phase-8.js',
  'scripts/test-phase-9.js',
  'scripts/test-phase-10.js',
  'scripts/test-phase-11.js',
  'scripts/test-phase-12.js',
  'scripts/test-phase-13.js',
  'scripts/test-phase-14.js',
  'scripts/test-phase-15.js',
  'scripts/test-phase-16.js'
];

let ranAny = false;
for (const script of testScripts) {
  if (!fs.existsSync(script)) continue;
  ranAny = true;
  console.log(`>>> Running ${script}...`);
  try {
    execSync(`node ${script}`, { stdio: 'inherit' });
    console.log(`>>> ${script} PASSED!\n`);
  } catch (err) {
    console.error(`>>> ${script} FAILED!`);
    process.exit(1);
  }
}

// فحص سلامة جميع الخدمات والملفات البرمجية
console.log('>>> Validating syntax of all system files...');
const filesToCheck = [
  'apps/desktop/electron/main/index.js',
  'apps/desktop/renderer/renderer.js',
  'apps/desktop/electron/services/update-engine-service.js',
  'apps/desktop/electron/services/whatsapp-direct-service.js',
  'apps/desktop/electron/services/tasks-notifications-service.js',
  'apps/desktop/electron/services/settings-service.js',
  'apps/desktop/electron/services/google-drive-service.js',
  'apps/desktop/electron/services/booking-engine-service.js',
  'apps/desktop/electron/services/finance-engine-service.js',
  'apps/desktop/electron/services/inventory-engine-service.js',
  'apps/desktop/electron/services/pos-sales-service.js',
  'apps/desktop/electron/services/reports-engine-service.js',
  'apps/desktop/electron/services/backup-engine-service.js',
  'apps/desktop/electron/services/admin-service.js'
];

for (const file of filesToCheck) {
  if (fs.existsSync(file)) {
    execSync(`node --check ${file}`, { stdio: 'pipe' });
    console.log(`  ✓ ${file} syntax OK`);
  }
}

console.log('========================================================');
console.log('  All Completed Phases Verified Successfully (100%)');
console.log('========================================================');

