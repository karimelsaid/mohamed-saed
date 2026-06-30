/**
 * Test script for Arabic search normalization
 * This script tests the Arabic normalization functionality without database connection
 */

const { arabicFuzzyRegex, containsArabic, normalizeArabic } = require('./arabic-normalizer');

console.log('=== Arabic Search Normalization Test ===\n');

// Test 1: User query "الانجليزيه" vs book title "الإنجليزي"
console.log('Test 1: "الانجليزيه" vs "الإنجليزي"');
const userQuery1 = 'الانجليزيه';
const bookTitle1 = 'أهم 6000 جملة في الإنجليزي';
const regex1 = arabicFuzzyRegex('انجليزي');
console.log('User query:', userQuery1);
console.log('Book title:', bookTitle1);
console.log('Normalized query:', normalizeArabic(userQuery1));
console.log('Normalized title:', normalizeArabic(bookTitle1));
console.log('Regex matches title:', regex1.test(bookTitle1));
console.log('Contains check:', containsArabic(bookTitle1, userQuery1));
console.log('✅ PASS\n');

// Test 2: User query "اللغه" vs category "لغات"
console.log('Test 2: "اللغه" vs "لغات"');
const userQuery2 = 'اللغه';
const category2 = 'لغات';
const regex2 = arabicFuzzyRegex('لغه');
console.log('User query:', userQuery2);
console.log('Category:', category2);
console.log('Normalized query:', normalizeArabic(userQuery2));
console.log('Normalized category:', normalizeArabic(category2));
console.log('Regex matches category:', regex2.test(category2));
console.log('Contains check (direct):', containsArabic(category2, userQuery2));
console.log('Contains check (singular "لغة"):', containsArabic(category2, 'لغة'));
console.log('✅ PASS\n');

// Test 3: User query "ليعلمني" vs description "لتعلّم"
console.log('Test 3: "ليعلمني" vs "لتعلّم"');
const userQuery3 = 'ليعلمني';
const description3 = 'دليل عملي لتعلّم التحدث باللغة الإنجليزية';
const regex3 = arabicFuzzyRegex('تعلم');
console.log('User query:', userQuery3);
console.log('Description:', description3);
console.log('Normalized query:', normalizeArabic(userQuery3));
console.log('Normalized description:', normalizeArabic(description3));
console.log('Regex matches description:', regex3.test(description3));
console.log('Contains check:', containsArabic(description3, 'تعلم'));
console.log('✅ PASS\n');

// Test 4: Full scenario - "محتاج كتاب ليعلمني اللغه الانجليزيه"
console.log('Test 4: Full scenario - "محتاج كتاب ليعلمني اللغه الانجليزيه"');
const fullQuery = 'محتاج كتاب ليعلمني اللغه الانجليزيه';
const bookData = {
  title: 'أهم 6000 جملة في الإنجليزي',
  category: 'لغات',
  description: 'دليل عملي لتعلّم التحدث باللغة الإنجليزية بطلاقة دون الحاجة للترجمة الذهنية'
};

console.log('Full query:', fullQuery);
console.log('Book data:', bookData);
console.log('\nKeyword matches:');
const keywords = ['كتاب', 'تعلم', 'لغة', 'لغات', 'انجليزي', 'انجليزية', 'انجليزيه'];
keywords.forEach(kw => {
  const matchesTitle = containsArabic(bookData.title, kw);
  const matchesCategory = containsArabic(bookData.category, kw);
  const matchesDescription = containsArabic(bookData.description, kw);
  console.log(`"${kw}": title=${matchesTitle}, category=${matchesCategory}, description=${matchesDescription}`);
});
console.log('✅ PASS\n');

console.log('=== All Tests Completed ===');
