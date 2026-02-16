const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\u0600-\u06FF\w\-]+/g, '')       // Remove all non-word chars except Arabic letters
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

// Mapping of Arabic category names to Angular route paths
const categoryRouteMap = {
  'أعمال وتسويق ومالية': 'book',
  'تربية وأطفال': 'book',
  'فنون وحرف': 'book',
  'صحة وطب وعلوم': 'book',
  'كتب دينية': 'book',
  'روايات وقصص': 'book',
  'تطوير الذات وعلم النفس': 'book',
  'تاريخ وسير ذاتية': 'book',
  'قواميس ومراجع': 'book',
  'أدوات مكتبية': 'office-supplies',
  'إلكترونيات': 'electronics',
  'ملابس': 'clothing',
  'التجميل والعناية الشخصية': 'cosmetics',
  'أحذية': 'shoes',
  'أثاث وديكور المنزل': 'furniture',
  'هدية وألعاب': 'games',
  'أقمشة': 'fabrics',
  'أخرى': 'others',
  'غير مصنف': 'others'
};

// Function to get the correct route path for a category
function getCategoryRoute(category) {
  if (!category) return 'book'; // Default fallback
  // Return the mapped route or fallback to 'book'
  return categoryRouteMap[category] || 'book';
}

class SitemapService extends EventEmitter {
  constructor() {
    super();
    this.outputJsonPath = path.join(__dirname, '..', 'output.json');
    this.sitemapPath = path.join(__dirname, '..', 'dist', 'browser', 'sitemap.xml');
    this.watch();
  }

  watch() {
    // Watch output.json for changes with debounce
    let timeout = null;
    fs.watch(this.outputJsonPath, (eventType) => {
      if (eventType === 'change') {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          this.generateSitemap();
          timeout = null;
        }, 500); // 500ms debounce delay
      }
    });
    // Initial generation
    this.generateSitemap();
  }

  async generateSitemap() {
    const maxRetries = 5;
    const retryDelay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let data;
        try {
          data = await fs.promises.readFile(this.outputJsonPath, 'utf8');
        } catch (readErr) {
          // If file doesn't exist yet or is locked, throw to retry
          throw new Error(`Read error: ${readErr.message}`);
        }

        if (!data || data.trim().length === 0) {
          throw new Error('File is empty');
        }

        let books;
        try {
          books = JSON.parse(data);
        } catch (parseErr) {
          throw new Error(`JSON parse error: ${parseErr.message}`);
        }

        if (!Array.isArray(books)) {
          // If for some reason it's not an array (bad write), retry
          throw new Error('Content is not a JSON array');
        }

        // Base URL - domain only
        const baseUrl = 'https://knoozbook.com/';

        // Generate sitemap XML content
        const urls = books.map(book => {
          const slug = slugify(book.product_name || '');
          // Handle inconsistent product ID keys ('product_id' or 'products_id')
          const productId = book.product_id || book.products_id;
          // Get category route (dynamic based on product category)
          const categoryRoute = getCategoryRoute(book.product_category);
          // Construct the URL with the correct structure: /category-route/id/slug
          const loc = `${baseUrl}${categoryRoute}/${productId}/${slug}`;
          const lastmod = new Date().toISOString();
          return `
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
        }).join('');

        const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

        // Ensure directory exists
        await fs.promises.mkdir(path.dirname(this.sitemapPath), { recursive: true });

        // Write sitemap.xml
        await fs.promises.writeFile(this.sitemapPath, sitemapContent, 'utf8');
        return; // Success, exit loop

      } catch (error) {
        console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed to generate sitemap: ${error.message}`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          console.error('❌ Failed to generate sitemap after multiple attempts.');
        }
      }
    }
  }
}

module.exports = new SitemapService();
