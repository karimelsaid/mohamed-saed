const { execSync } = require('child_process');

console.log('========================================================');
console.log('  Running Complete Test Suite for Completed Phases');
console.log('========================================================\n');

const testScripts = [
  'scripts/test-phase-0.js',
  'scripts/test-phase-1.js',
  'scripts/test-phase-2.js',
  'scripts/test-phase-3.js'
];

for (const script of testScripts) {
  console.log(`>>> Running ${script}...`);
  try {
    execSync(`node ${script}`, { stdio: 'inherit' });
    console.log(`>>> ${script} PASSED!\n`);
  } catch (err) {
    console.error(`>>> ${script} FAILED!`);
    process.exit(1);
  }
}

console.log('========================================================');
console.log('  All Completed Phases Verified Successfully (100%)');
console.log('========================================================');
