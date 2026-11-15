/**
 * Patch for @capgo/capacitor-updater DelayUpdateUtils.java
 * Fixes Java 21 qualified enum switch labels to Java 17 compatible unqualified labels.
 * This runs automatically after npm install via the postinstall script.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capgo',
  'capacitor-updater',
  'android',
  'src',
  'main',
  'java',
  'ee',
  'forgr',
  'capacitor_updater',
  'DelayUpdateUtils.java'
);

if (!fs.existsSync(filePath)) {
  console.log('[patch] DelayUpdateUtils.java not found, skipping patch.');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');
const original = content;

// Replace qualified enum switch labels with unqualified ones (Java 17 compat)
content = content.replace(/case\s+DelayUntilNext\.background:/g, 'case background:');
content = content.replace(/case\s+DelayUntilNext\.kill:/g, 'case kill:');
content = content.replace(/case\s+DelayUntilNext\.date:/g, 'case date:');
content = content.replace(/case\s+DelayUntilNext\.nativeVersion:/g, 'case nativeVersion:');

if (content !== original) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('[patch] ✅ DelayUpdateUtils.java patched for Java 17 compatibility.');
} else {
  console.log('[patch] DelayUpdateUtils.java already patched or no changes needed.');
}
