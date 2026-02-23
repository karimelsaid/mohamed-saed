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

  /**
   * Get a stable weekly date string (Monday of the current week).
   * This prevents lastmod from changing on every regeneration.
   */
  getStableWeeklyDate() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon, ...
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().split('T')[0]; // YYYY-MM-DD format
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
          throw new Error('Content is not a JSON array');
        }

        const baseUrl = 'https://knoozbook.com';
        const stableDate = this.getStableWeeklyDate();
        const todayDate = new Date().toISOString().split('T')[0];

        // --- Static Pages ---
        const staticPages = [
          { path: '/', changefreq: 'daily', priority: '1.0' },
          { path: '/Home', changefreq: 'daily', priority: '0.9' },
          { path: '/books', changefreq: 'daily', priority: '0.8' },
          { path: '/Business-Marketing-Finance', changefreq: 'weekly', priority: '0.7' },
          { path: '/Education-children', changefreq: 'weekly', priority: '0.7' },
          { path: '/Arts-crafts', changefreq: 'weekly', priority: '0.7' },
          { path: '/HealthMedicineScience', changefreq: 'weekly', priority: '0.7' },
          { path: '/Islamic', changefreq: 'weekly', priority: '0.7' },
          { path: '/Novels-stories', changefreq: 'weekly', priority: '0.7' },
          { path: '/Self-development-psychology', changefreq: 'weekly', priority: '0.7' },
          { path: '/History-Biographies', changefreq: 'weekly', priority: '0.7' },
          { path: '/Dictionaries-References', changefreq: 'weekly', priority: '0.7' },
          { path: '/electronics', changefreq: 'weekly', priority: '0.6' },
          { path: '/clothing', changefreq: 'weekly', priority: '0.6' },
          { path: '/cosmetics', changefreq: 'weekly', priority: '0.6' },
          { path: '/shoes', changefreq: 'weekly', priority: '0.6' },
          { path: '/furniture', changefreq: 'weekly', priority: '0.6' },
          { path: '/games', changefreq: 'weekly', priority: '0.6' },
          { path: '/office-supplies', changefreq: 'weekly', priority: '0.6' },
          { path: '/عن-الموقع', changefreq: 'monthly', priority: '0.4' },
          { path: '/سياسة-الخصوصية', changefreq: 'monthly', priority: '0.3' },
          { path: '/الشروط-والاحكام', changefreq: 'monthly', priority: '0.3' },
        ];

        const staticUrls = staticPages.map(page => `
  <url>
    <loc>${baseUrl}${page.path}</loc>
    <lastmod>${todayDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('');

        // --- Product Pages ---
        const productUrls = books.map(book => {
          const slug = slugify(book.product_name || '');
          const productId = book.product_id || book.products_id;
          const categoryRoute = getCategoryRoute(book.product_category);
          const loc = `${baseUrl}/${categoryRoute}/${productId}/${slug}`;
          // Use promotion end date if available, otherwise stable weekly date
          const lastmod = book.promotionEndDate
            ? new Date(book.promotionEndDate).toISOString().split('T')[0]
            : stableDate;
          // Higher priority for in-stock and promoted items
          const hasDiscount = (book.product_discount_percent || 0) > 0;
          const inStock = (book.product_quantity || 0) > 0;
          const priority = hasDiscount ? '0.9' : (inStock ? '0.8' : '0.5');

          return `
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
        }).join('');

        const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${productUrls}
</urlset>`;

        // Ensure directory exists
        await fs.promises.mkdir(path.dirname(this.sitemapPath), { recursive: true });

        // Write sitemap.xml
        await fs.promises.writeFile(this.sitemapPath, sitemapContent, 'utf8');
        console.log(`✅ Sitemap generated: ${books.length} products + ${staticPages.length} static pages`);
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
