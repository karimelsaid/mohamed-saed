/**
 * Book Token Parser Utility
 * Utility functions for parsing and replacing BOOK tokens in AI responses
 * BOOK token format (old): [BOOK:id:title:author:price:url]
 * BOOK token format (new): [BOOK:title] - simplified format
 */

/**
 * Regex pattern for BOOK tokens (new simplified format)
 * Accepts [BOOK:title] format
 */
const BOOK_TOKEN_REGEX_NEW = /\[BOOK:([^\]]+)\]/g;

/**
 * Regex pattern for BOOK tokens (old format) - for backward compatibility
 */
const BOOK_TOKEN_REGEX_OLD = /\[BOOK:([^:]+):([^:]+):([^:]+):([^:]+):([^\]]+)\]/g;

/**
 * Parse BOOK tokens from text and extract book data
 * Supports both new [BOOK:title] and old [BOOK:id:title:author:price:url] formats
 * @param {string} text - Text containing BOOK tokens
 * @param {Array} availableBooks - Array of available books to match titles against
 * @returns {Array} - Array of book objects with full data
 */
/**
 * تطبيع النص لمقارنة أكثر مرونة (يتجاهل الهمزات والتشكيل)
 */
function normalizeForMatch(text) {
  return (text || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[ً-ٟ]/g, '') // حذف التشكيل
    .trim()
    .toLowerCase();
}

function parseBookTokens(text, availableBooks = []) {
  const books = [];
  
  // Try new format first: [BOOK:title]
  const newMatches = text.match(BOOK_TOKEN_REGEX_NEW);
  if (newMatches) {
    for (const match of newMatches) {
      const titleMatch = match.match(/\[BOOK:([^\]]+)\]/);
      if (titleMatch) {
        const title = titleMatch[1];
        // Find book by title in availableBooks
        // 1. exact match أولاً
        let book = availableBooks.find(b => b.title === title || b.product_name === title);

        // 2. normalized match (يتجاهل الهمزات والتشكيل)
        if (!book) {
          const normTitle = normalizeForMatch(title);
          book = availableBooks.find(b => {
            const normDb = normalizeForMatch(b.title || b.product_name);
            return normDb === normTitle ||
                   normDb.startsWith(normTitle) ||
                   normTitle.startsWith(normDb) ||
                   normDb.includes(normTitle) ||
                   normTitle.includes(normDb);
          });
          if (book) {
            console.log('[parseBookTokens] Normalized match found:', title, '->', book.title || book.product_name);
          }
        }

        if (book) {
          books.push({
            id: book.id || book.products_id,
            title: book.title || book.product_name,
            author: book.author || 'غير محدد',
            price: book.price || book.product_price,
            buyUrl: book.buyUrl || book.url
          });
        } else {
          console.warn('[parseBookTokens] Book not found in availableBooks:', title);
        }
      }
    }
  }
  
  // If no new format matches, try old format for backward compatibility
  if (books.length === 0) {
    let match;
    while ((match = BOOK_TOKEN_REGEX_OLD.exec(text)) !== null) {
      books.push({
        id: match[1],
        title: match[2],
        author: match[3],
        price: match[4],
        buyUrl: match[5]
      });
    }
  }
  
  return books;
}

/**
 * Replace BOOK tokens with book titles in text
 * @param {string} text - Text containing BOOK tokens
 * @returns {string} - Text with BOOK tokens replaced by titles
 */
function replaceBookTokensWithTitles(text) {
  // Try new format first
  let result = text.replace(BOOK_TOKEN_REGEX_NEW, (match, title) => title);
  // If no replacement happened, try old format
  if (result === text) {
    result = text.replace(BOOK_TOKEN_REGEX_OLD, (match, id, title) => title);
  }
  return result;
}

/**
 * Remove BOOK tokens from text completely
 * @param {string} text - Text containing BOOK tokens
 * @returns {string} - Text with BOOK tokens removed
 */
function removeBookTokens(text) {
  // Remove both formats
  let result = text.replace(BOOK_TOKEN_REGEX_NEW, '');
  result = result.replace(BOOK_TOKEN_REGEX_OLD, '');
  return result;
}

/**
 * Check if text contains valid BOOK tokens
 * @param {string} text - Text to check
 * @returns {boolean} - True if valid BOOK tokens are present
 */
function hasValidBookTokens(text) {
  const newMatches = text.match(BOOK_TOKEN_REGEX_NEW);
  const oldMatches = text.match(BOOK_TOKEN_REGEX_OLD);
  return (newMatches && newMatches.length > 0) || (oldMatches && oldMatches.length > 0);
}

module.exports = {
  BOOK_TOKEN_REGEX: BOOK_TOKEN_REGEX_OLD, // Keep old name for backward compatibility
  BOOK_TOKEN_REGEX_NEW,
  BOOK_TOKEN_REGEX_OLD,
  parseBookTokens,
  replaceBookTokensWithTitles,
  removeBookTokens,
  hasValidBookTokens
};