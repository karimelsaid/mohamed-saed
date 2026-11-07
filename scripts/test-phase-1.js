const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const docsDir = path.join(root, 'docs');
const pagesDir = path.join(docsDir, 'pages');
const modulesDir = path.join(docsDir, 'modules');

const requiredMainDocs = [
  '00-PRODUCT-VISION.md',
  '01-PRD.md',
  '02-TECHNICAL-ARCHITECTURE.md',
  '03-DATABASE-DESIGN.md',
  '04-DESIGN-SYSTEM.md',
  '05-BUSINESS-RULES.md',
  '06-SECURITY.md',
  '07-OFFLINE-ARCHITECTURE.md',
  '08-UPDATE-SYSTEM.md',
  '09-BACKUP-AND-RESTORE.md',
  '10-WHATSAPP-INTEGRATION.md',
  '11-PRINTING-AND-INVOICES.md',
  '12-TESTING-STRATEGY.md',
  '13-DEVELOPMENT-ROADMAP.md',
  '14-EDITOR-RULES.md',
  'PROJECT-DISCOVERY.md',
  'EXECUTION-STATUS.md'
];

const requiredPages = [
  'DASHBOARD.md',
  'SUITS-INVENTORY.md',
  'SHOES-INVENTORY.md',
  'ACCESSORIES-INVENTORY.md',
  'BOOKINGS.md',
  'POS-SALES.md',
  'CUSTOMERS.md',
  'TASKS.md',
  'INVOICES.md',
  'FINANCE.md',
  'REPORTS.md',
  'ADMINISTRATION.md',
  'SETTINGS.md'
];

const requiredModules = [
  'INVENTORY-ENGINE.md',
  'BOOKING-ENGINE.md',
  'FINANCIAL-ENGINE.md',
  'NOTIFICATION-ENGINE.md',
  'UPDATE-ENGINE.md',
  'BACKUP-ENGINE.md'
];

let failed = false;

function verify(files, dir, name) {
  console.log(`Checking ${name}...`);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Missing file: ${file}`);
      failed = true;
    } else {
      const stat = fs.statSync(fullPath);
      if (stat.size < 100) {
        console.error(`❌ File too small: ${file} (${stat.size} bytes)`);
        failed = true;
      } else {
        console.log(`  ✓ ${file} (${stat.size} bytes)`);
      }
    }
  }
}

verify(requiredMainDocs, docsDir, 'Main Docs');
verify(requiredPages, pagesDir, 'Pages Docs');
verify(requiredModules, modulesDir, 'Modules Docs');

if (failed) {
  console.error('\n❌ Phase 1 Documentation verification failed.');
  process.exit(1);
} else {
  console.log('\n✅ All Phase 1 Documentation verified successfully! (36/36 files present and complete)');
}

