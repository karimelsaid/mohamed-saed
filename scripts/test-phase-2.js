const fs = require('fs');
const path = require('path');
const { ipcRouter, ALLOWED_CHANNELS } = require('../apps/desktop/electron/ipc/ipc-router');
const { logger } = require('../apps/desktop/electron/logging/logger');

const root = path.join(__dirname, '..');
let failed = false;

console.log('Testing Phase 2: Project Foundation...\n');

// 1. Files existence check
console.log('1. Verifying foundation files existence...');
const requiredFiles = [
  'package.json',
  'packages/contracts/src/ipc-channels.ts',
  'packages/shared/src/enums.ts',
  'apps/desktop/electron/main/index.js',
  'apps/desktop/electron/preload/preload.js',
  'apps/desktop/electron/ipc/ipc-router.js',
  'apps/desktop/electron/logging/logger.js',
  'apps/desktop/renderer/index.html',
  'apps/desktop/renderer/styles.css',
  'apps/desktop/renderer/renderer.js'
];

requiredFiles.forEach(relPath => {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) {
    console.error(`  ❌ Missing required foundation file: ${relPath}`);
    failed = true;
  } else {
    console.log(`  ✓ Found: ${relPath}`);
  }
});

// 2. Electron & Preload Security Verification
console.log('\n2. Verifying Electron & Preload Security Rules...');
const mainSrc = fs.readFileSync(path.join(root, 'apps/desktop/electron/main/index.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(root, 'apps/desktop/electron/preload/preload.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(root, 'apps/desktop/renderer/index.html'), 'utf8');

if (!mainSrc.includes('contextIsolation: true')) {
  console.error('  ❌ Security Violation: contextIsolation must be true in main/index.js');
  failed = true;
} else {
  console.log('  ✓ contextIsolation is enabled (true)');
}

if (!mainSrc.includes('nodeIntegration: false')) {
  console.error('  ❌ Security Violation: nodeIntegration must be false in main/index.js');
  failed = true;
} else {
  console.log('  ✓ nodeIntegration is disabled (false)');
}

if (!preloadSrc.includes('contextBridge.exposeInMainWorld')) {
  console.error('  ❌ Security Violation: preload.js must use contextBridge.exposeInMainWorld');
  failed = true;
} else {
  console.log('  ✓ contextBridge is used for secure API exposition');
}

if (!htmlSrc.includes('dir="rtl"') || !htmlSrc.includes('lang="ar"')) {
  console.error('  ❌ UI Violation: index.html must specify dir="rtl" and lang="ar"');
  failed = true;
} else {
  console.log('  ✓ Arabic RTL correctly set in index.html');
}

if (!htmlSrc.includes('Content-Security-Policy')) {
  console.error('  ❌ Security Violation: CSP header missing in index.html');
  failed = true;
} else {
  console.log('  ✓ Content-Security-Policy configured');
}

// 3. IPC Router & Allowlist Unit Testing
console.log('\n3. Testing IPC Router & Channel Allowlist Security...');

async function testIpc() {
  // Test unauthorized channel blocking
  const rogueChannel = 'fs:delete-hard-drive';
  const rogueRes = await ipcRouter.dispatch(rogueChannel, {});
  if (rogueRes.success || rogueRes.error?.code !== 'UNAUTHORIZED_CHANNEL') {
    console.error('  ❌ IPC Security failure: Rogue channel was not blocked!', rogueRes);
    failed = true;
  } else {
    console.log('  ✓ Rogue channel was correctly blocked by allowlist:', rogueRes.error.message);
  }

  // Register and test legitimate handler
  ipcRouter.register('app:get-info', async () => ({ appName: 'نظام بدل ', ok: true }));
  const validRes = await ipcRouter.dispatch('app:get-info');
  if (!validRes.success || validRes.data?.appName !== 'نظام بدل ') {
    console.error('  ❌ Legitimate IPC handler call failed:', validRes);
    failed = true;
  } else {
    console.log('  ✓ Legitimate IPC handler executed and returned data:', validRes.data);
  }

  // Test logger
  logger.info('Test log entry from Phase 2 test suite', { test: true });
  console.log('  ✓ Logger executed without error');
}

testIpc().then(() => {
  if (failed) {
    console.error('\n❌ Phase 2 Project Foundation tests failed.');
    process.exit(1);
  } else {
    console.log('\n✅ All Phase 2 Project Foundation tests passed successfully!');
  }
});
