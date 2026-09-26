const fs = require('fs');
let code = fs.readFileSync('Backend/controllers/admin.controller.js', 'utf8');

// Normalize line endings to find the block
const target1 = `      // Map Arabic category (short or full) to English enum value
      let englishCategory = englishCategoryMap[product.product_category];
      if (!englishCategory) {
        // If product_category is a full Arabic name, get its short key via reverseCategoryMap
        const shortKey = reverseCategoryMap[product.product_category] || product.product_category;
        // Then map the short key to English enum
        englishCategory = englishCategoryMap[shortKey] || 'Novels-stories';
      }`;

const repl1 = `      // Use product's real category directly (preserving Arabic categories added by admin)
      const bookCategory = product.product_category || 'غير مصنف';`;

// Handle both CRLF and LF
const codeNormalized = code.replace(/\r\n/g, '\n');
if (codeNormalized.includes(target1)) {
    let replaced = codeNormalized.replace(target1, repl1);
    replaced = replaced.replace('category: englishCategory,', 'category: bookCategory,');
    replaced = replaced.split(`product_category: product_category || 'Novels-stories'`).join(`product_category: product_category || 'غير مصنف'`);
    // Restore CRLF
    fs.writeFileSync('Backend/controllers/admin.controller.js', replaced.replace(/\n/g, '\r\n'), 'utf8');
    console.log('✅ admin.controller.js successfully updated!');
} else {
    console.log('❌ target1 not found in code');
}
