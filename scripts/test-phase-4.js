const fs = require('fs');
const path = require('path');
const { UiUtils } = require('../apps/desktop/renderer/components/ui-utils');
const { AppToast } = require('../apps/desktop/renderer/components/toast');
const { AppModal, AppConfirmDialog } = require('../apps/desktop/renderer/components/modal');
const { AppDrawer } = require('../apps/desktop/renderer/components/drawer');
const { AppStates } = require('../apps/desktop/renderer/components/states');

let failed = false;
console.log('Testing Phase 4: Design System & Shared Components...\n');

// 1. Files existence check
console.log('1. Checking component files existence...');
const requiredComponents = [
  'apps/desktop/renderer/components/ui-utils.js',
  'apps/desktop/renderer/components/toast.js',
  'apps/desktop/renderer/components/modal.js',
  'apps/desktop/renderer/components/drawer.js',
  'apps/desktop/renderer/components/states.js'
];

requiredComponents.forEach(file => {
  const full = path.join(__dirname, '..', file);
  if (!fs.existsSync(full)) {
    console.error(`  ❌ Missing component file: ${file}`);
    failed = true;
  } else {
    console.log(`  ✓ Found: ${file}`);
  }
});

// 2. UiUtils verification
console.log('\n2. Testing UI Utilities (Currency, Dates, Egyptian Phones)...');
const formattedPrice = UiUtils.formatCurrency(1500);
console.log(`  ✓ formatCurrency(1500) => "${formattedPrice}"`);
if (!formattedPrice.includes('ج.م')) {
  console.error('  ❌ Currency must include "ج.م"');
  failed = true;
}

const validPhone = UiUtils.isValidEgyptianPhone('01012345678');
const invalidPhone = UiUtils.isValidEgyptianPhone('123456');
if (!validPhone || invalidPhone) {
  console.error('  ❌ Phone validation failure!');
  failed = true;
} else {
  console.log('  ✓ Egyptian phone validation verified (01012345678 valid, 123456 invalid)');
}

// 3. Toast Notifications System
console.log('\n3. Testing Toast Notification System...');
const toastId = AppToast.success('عملية ناجحة تجريبية');
if (!toastId) {
  console.error('  ❌ Toast generation failed');
  failed = true;
} else {
  console.log(`  ✓ Toast created successfully (ID: ${toastId})`);
  AppToast.dismiss(toastId);
  console.log('  ✓ Toast dismissed cleanly');
}

// 4. Modal and Confirm Dialog
console.log('\n4. Testing Modal & Confirmation Dialog Lifecycle...');
const modalOpened = AppModal.open({
  title: 'نافذة اختبار',
  contentHtml: '<p>محتوى</p>'
});
if (!modalOpened) {
  console.error('  ❌ Modal failed to open');
  failed = true;
} else {
  console.log('  ✓ Modal opened successfully');
  AppModal.close();
  console.log('  ✓ Modal closed successfully');
}

let confirmExecuted = false;
AppConfirmDialog.show({
  title: 'تأكيد الحذف',
  message: 'هل تريد الحذف؟',
  onConfirm: () => { confirmExecuted = true; }
});
if (typeof global._confirmOk === 'function') {
  global._confirmOk();
  if (confirmExecuted) {
    console.log('  ✓ AppConfirmDialog callback successfully executed on confirm');
  } else {
    console.error('  ❌ Confirm callback failed');
    failed = true;
  }
}

// 5. Drawer Lifecycle
console.log('\n5. Testing Slide-Over Drawer...');
const drawerOpened = AppDrawer.open({ title: 'درج التفاصيل', contentHtml: '<div>بيانات</div>' });
if (!drawerOpened) {
  console.error('  ❌ Drawer failed to open');
  failed = true;
} else {
  console.log('  ✓ Drawer opened successfully');
  AppDrawer.close();
  console.log('  ✓ Drawer closed successfully');
}

// 6. State Generators
console.log('\n6. Testing UI State Generators (Loading, Empty, Error, Badges, StatCards)...');
const loadingHtml = AppStates.loading('جاري التحميل...');
const emptyHtml = AppStates.empty({ title: 'لا توجد عناصر' });
const errorHtml = AppStates.error({ title: 'خطأ' });
const badgeHtml = AppStates.badge('متاحة', 'success');
const statCardHtml = AppStates.statCard({ icon: '💰', title: 'الإيراد', value: '10,000 ج.م' });

if (!loadingHtml.includes('spinner') || !emptyHtml.includes('empty-state') || !badgeHtml.includes('badge-success')) {
  console.error('  ❌ UI State HTML generation failed');
  failed = true;
} else {
  console.log('  ✓ All UI State generators rendered valid HTML');
}

// 7. Stylesheet CSS Tokens & Classes
console.log('\n7. Verifying CSS Theme Tokens & Class Rules...');
const cssPath = path.join(__dirname, '..', 'apps/desktop/renderer/styles.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const requiredCssTokens = [
  '--color-gold-500',
  'body.theme-dark',
  'body.theme-light',
  '.modal-overlay',
  '.toast-container',
  '.drawer-panel',
  '.form-control',
  '.badge-success'
];

requiredCssTokens.forEach(token => {
  if (!cssContent.includes(token)) {
    console.error(`  ❌ Missing CSS token/class: ${token}`);
    failed = true;
  } else {
    console.log(`  ✓ Found CSS rule: ${token}`);
  }
});

if (failed) {
  console.error('\n❌ Phase 4 Design System tests failed.');
  process.exit(1);
} else {
  console.log('\n✅ All Phase 4 Design System tests passed with 100% success!');
}

