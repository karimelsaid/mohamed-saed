const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = false;

console.log('Testing Phase 0: Discovery & Planning...');

const discoveryDoc = path.join(root, 'docs', 'PROJECT-DISCOVERY.md');
const executionStatus = path.join(root, 'docs', 'EXECUTION-STATUS.md');
const readme = path.join(root, 'README.md');

[discoveryDoc, executionStatus, readme].forEach(f => {
  if (!fs.existsSync(f)) {
    console.error(`❌ Missing Phase 0 file: ${path.basename(f)}`);
    failed = true;
  } else {
    console.log(`  ✓ ${path.basename(f)} exists and valid`);
  }
});

if (failed) {
  process.exit(1);
} else {
  console.log('✅ Phase 0 verification passed!');
}
