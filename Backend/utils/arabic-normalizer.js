/**
 * Arabic Text Normalizer Utility
 * Utility functions for normalizing Arabic text and generating regex patterns
 * for fuzzy matching of Arabic text with common spelling variations
 */

/**
 * Normalize Arabic text for consistent matching
 * Handles common Arabic spelling variations:
 * - Unifies ألف forms (أ، إ، آ → ا)
 * - Unifies تاء مربوطة and هاء (ة → ه)
 * - Removes diacritics (تشكيل: فتحة، ضمة، كسرة، تنوين، شدة، سكون)
 * - Unifies ياء and ألف مقصورة (ى → ي)
 * - Unifies همزة on و/ي (ؤ → و، ئ → ي)
 * - Removes extra spaces
 * @param {string} text - Text to normalize
 * @returns {string} - Normalized text
 */
function normalizeArabic(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return text
    // Convert to lowercase for consistency
    .toLowerCase()
    // Unify ألف forms (أ، إ، آ → ا)
    .replace(/[أإآ]/g, 'ا')
    // Unify تاء مربوطة and هاء (ة → ه)
    .replace(/ة/g, 'ه')
    // Remove diacritics (تشكيل: فتحة، ضمة، كسرة، تنوين، شدة، سكون)
    // Unicode range for Arabic diacritics: \u064B-\u0652
    .replace(/[\u064B-\u0652\u0670]/g, '')
    // Unify ياء and ألف مقصورة (ى → ي)
    .replace(/ى/g, 'ي')
    // Unify همزة on و (ؤ → و)
    .replace(/ؤ/g, 'و')
    // Unify همزة on ي (ئ → ي)
    .replace(/ئ/g, 'ي')
    // Remove extra spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a regex pattern that matches Arabic text with common spelling variations
 * This is more effective than normalizing only one side of the comparison
 * @param {string} text - Text to generate pattern for
 * @returns {RegExp} - Regex pattern that matches variations
 */
function arabicFuzzyRegex(text) {
  if (!text || typeof text !== 'string') {
    return new RegExp('');
  }
  
  // Normalize the text first
  const normalized = normalizeArabic(text);
  
  // Escape special regex characters
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Build pattern that matches variations
  // أ/إ/آ → [أإآا]
  // ة/ه → [ةه]
  // ئ/ي → [ئي]
  // ؤ/و → [ؤو]
  // ى/ي → [ىي]
  let pattern = escaped
    .replace(/ا/g, '[أإآا]')
    .replace(/ه/g, '[ةه]')
    .replace(/ي/g, '[ئيي]')
    .replace(/و/g, '[ؤو]')
    .replace(/ى/g, '[ىي]');
  
  return new RegExp(pattern, 'i');
}

/**
 * Normalize Arabic text but preserve some diacritics if needed
 * This is a less aggressive normalization for cases where diacritics matter
 * @param {string} text - Text to normalize
 * @returns {string} - Normalized text
 */
function normalizeArabicLight(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return text
    .toLowerCase()
    // Unify ألف forms (أ، إ، آ → ا)
    .replace(/[أإآ]/g, 'ا')
    // Unify تاء مربوطة and هاء (ة → ه)
    .replace(/ة/g, 'ه')
    // Unify ياء and ألف مقصورة (ى → ي)
    .replace(/ى/g, 'ي')
    // Unify همزة on و/ي
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    // Remove extra spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two Arabic texts are semantically equivalent after normalization
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {boolean} - True if texts are equivalent after normalization
 */
function areArabicTextsEquivalent(text1, text2) {
  if (!text1 || !text2) {
    return text1 === text2;
  }
  
  return normalizeArabic(text1) === normalizeArabic(text2);
}

/**
 * Check if Arabic text contains a substring after normalization
 * @param {string} text - Text to search in
 * @param {string} substring - Substring to search for
 * @returns {boolean} - True if text contains substring after normalization
 */
function containsArabic(text, substring) {
  if (!text || !substring) {
    return false;
  }
  
  const normalizedText = normalizeArabic(text);
  const normalizedSubstring = normalizeArabic(substring);
  
  // Direct match
  if (normalizedText.includes(normalizedSubstring)) {
    return true;
  }
  
  // Try singular/plural variations for Arabic
  const singularPluralVariations = getSingularPluralVariations(normalizedSubstring);
  for (const variation of singularPluralVariations) {
    if (normalizedText.includes(variation)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get singular/plural variations for Arabic words
 * @param {string} word - Word to get variations for
 * @returns {Array} - Array of variations
 */
function getSingularPluralVariations(word) {
  const variations = [word];
  
  // Common Arabic plural patterns
  // Masculine plural (ات)
  if (!word.endsWith('ات')) {
    variations.push(word + 'ات');
  } else {
    variations.push(word.slice(0, -2)); // Remove 'ات'
  }
  
  // Feminine plural (ات) - same as above
  // Broken plurals are complex, these are simple patterns
  
  // Common patterns (using normalized forms)
  const pluralMap = {
    'كتاب': 'كتب',
    'كتب': 'كتاب',
    'لغه': 'لغات',
    'لغات': 'لغه',
    'مكتبه': 'مكتبات',
    'مكتبات': 'مكتبه',
    'قصه': 'قصص',
    'قصص': 'قصه',
    'كلمه': 'كلمات',
    'كلمات': 'كلمه',
    'جمله': 'جمل',
    'جمل': 'جمله',
    'سنه': 'سنوات',
    'سنوات': 'سنه',
    'دوله': 'دول',
    'دول': 'دوله',
    'مدينه': 'مدن',
    'مدن': 'مدينه',
  };
  
  if (pluralMap[word]) {
    variations.push(pluralMap[word]);
  }
  
  return [...new Set(variations)];
}

module.exports = {
  normalizeArabic,
  normalizeArabicLight,
  arabicFuzzyRegex,
  areArabicTextsEquivalent,
  containsArabic
};
