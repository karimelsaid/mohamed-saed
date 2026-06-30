/**
 * Test script for real book search scenario
 * Tests the actual search functionality with Arabic normalization
 */

const { arabicFuzzyRegex, containsArabic, normalizeArabic } = require('./arabic-normalizer');

console.log('=== Real Book Search Scenario Test ===\n');

// Simulated book data (from database)
const books = [
  {
    products_id: 'BOOK_ID_1',
    product_name: 'أهم 6000 جملة في الإنجليزي',
    product_category: 'لغات',
    product_description: 'دليل عملي لتعلّم التحدث باللغة الإنجليزية بطلاقة دون الحاجة للترجمة الذهنية',
    product_price: 150,
    product_quantity: 200,
    keywords: ['انجليزي', 'انجليزية', 'تعلم', 'لغة', 'محادثة', 'جمل', 'كلمات']
  },
  {
    products_id: '427502239565',
    product_name: 'اكتب حتي لا اصاب بالجنون',
    product_category: 'تطوير الذات',
    product_description: 'دليل عملي للكتابة العلاجية والتعبير عن المشاعر',
    product_price: 85,
    product_quantity: 50,
    keywords: ['كتابة', 'تطوير', 'نفسي', 'صحة', 'علاجية']
  },
  {
    products_id: 'BOOK_ID_3',
    product_name: 'تعلم الإنجليزية في 30 يوماً',
    product_category: 'لغات',
    product_description: 'كتاب شامل لتعلم أساسيات اللغة الإنجليزية للمبتدئين',
    product_price: 120,
    product_quantity: 150,
    keywords: ['انجليزي', 'تعلم', 'مبتدئين', 'اساسيات', 'لغة']
  }
];

// User query from the actual scenario
const userQuery = 'محتاج كتاب ليعلمني اللغه الانجليزيه';

console.log('User Query:', userQuery);
console.log('Normalized Query:', normalizeArabic(userQuery));
console.log('\n--- Searching for books ---\n');

// Extract keywords from user query
const queryKeywords = userQuery.split(/\s+/).filter(word => word.length > 2);
console.log('Extracted keywords:', queryKeywords);

// Score each book
const scoredBooks = books.map(book => {
  let score = 0;
  const reasons = [];

  // Check category match
  if (containsArabic(book.product_category, 'لغة') || containsArabic(book.product_category, 'لغات')) {
    score += 50;
    reasons.push('Category match (لغات)');
  }

  // Check title match
  if (containsArabic(book.product_name, 'انجليزي') || containsArabic(book.product_name, 'انجليزية') || containsArabic(book.product_name, 'انجليزيه')) {
    score += 30;
    reasons.push('Title contains "انجليزي"');
  }

  // Check description match
  if (containsArabic(book.product_description, 'تعلم') || containsArabic(book.product_description, 'تعلّم')) {
    score += 15;
    reasons.push('Description contains "تعلم"');
  }

  // Check keywords match
  const keywordMatches = book.keywords.filter(kw => 
    containsArabic(kw, 'انجليزي') || containsArabic(kw, 'انجليزية') || containsArabic(kw, 'انجليزيه')
  );
  if (keywordMatches.length > 0) {
    score += keywordMatches.length * 5;
    reasons.push(`Keywords match: ${keywordMatches.join(', ')}`);
  }

  return {
    book,
    score,
    reasons
  };
});

// Sort by score (descending)
scoredBooks.sort((a, b) => b.score - a.score);

// Display results
console.log('\n--- Search Results ---\n');
scoredBooks.forEach((result, index) => {
  console.log(`${index + 1}. ${result.book.product_name}`);
  console.log(`   ID: ${result.book.products_id}`);
  console.log(`   Category: ${result.book.product_category}`);
  console.log(`   Score: ${result.score}`);
  console.log(`   Reasons: ${result.reasons.join(', ')}`);
  console.log(`   Price: ${result.book.product_price} EGP`);
  console.log(`   In Stock: ${result.book.product_quantity}`);
  console.log();
});

// Verify expectations
console.log('--- Verification ---\n');
const topBook = scoredBooks[0];
if (topBook.book.product_name.includes('6000 جملة') || topBook.book.product_name.includes('الإنجليزي')) {
  console.log('✅ PASS: Top book is related to English language');
} else {
  console.log('❌ FAIL: Top book is not related to English language');
}

const writeBook = scoredBooks.find(r => r.book.products_id === '427502239565');
if (writeBook && writeBook.score < 30) {
  console.log('✅ PASS: "اكتب حتي لا اصاب بالجنون" has low score (not recommended)');
} else if (writeBook) {
  console.log('⚠️  WARNING: "اكتب حتي لا اصاب بالجنون" has high score (may be incorrectly recommended)');
}

console.log('\n=== Test Completed ===');
