/**
 * Amazon Egypt Affiliate Helper
 * Kenouz Book (knoozbook.com)
 * Store ID: knoozbook-21
 */

/**
 * Extract ASIN from a raw string or Amazon URL
 * @param {string} input - ASIN (e.g. B08XW2K1J8) or full Amazon link
 * @returns {string} Cleaned 10-character ASIN
 */
function extractAsin(input) {
  if (!input) return '';
  const trimmed = String(input).trim();
  // Check if standard 10-character alphanumeric ASIN
  if (/^[A-Z0-9]{10}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  // Extract ASIN from URL formats like /dp/ASIN or /gp/product/ASIN
  const match = trimmed.match(/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  return trimmed;
}

/**
 * Generate Amazon Egypt Affiliate link with Store Tag
 * @param {string} asinOrLink - ASIN or Amazon product URL
 * @returns {string} Tracked Amazon affiliate URL
 */
function generateAmazonAffiliateLink(asinOrLink) {
  const asin = extractAsin(asinOrLink);
  if (!asin) return '';
  const tag = process.env.AMAZON_AFFILIATE_STORE_ID || 'knoozbook-21';
  return `https://www.amazon.eg/dp/${asin}/?tag=${tag}`;
}

module.exports = {
  extractAsin,
  generateAmazonAffiliateLink
};
