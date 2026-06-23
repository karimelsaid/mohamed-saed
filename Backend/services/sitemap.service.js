const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/**
 * Generates a URL slug that EXACTLY matches Angular's SlugService.getBookSlug().
 * Keeps: Arabic letters, Latin letters/numbers (\w), and hyphens.
 * Removes: all other characters (punctuation, special chars, etc.)
 */
function slugify(text) {
  if (!text) return '';
  return text.toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')                                              // spaces → hyphens
    .replace(/[^\w\u0621-\u064A\u0660-\u0669\u06F0-\u06F9\-]+/g, '') // keep Arabic + Latin + numbers + hyphen
    .replace(/--+/g, '-')                                              // collapse multiple hyphens
    .replace(/^-+|-+$/g, '');                                         // trim leading/trailing hyphens
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
    // Find project root by looking for package.json upwards
    let root = __dirname;
    while (root !== path.parse(root).root) {
      if (fs.existsSync(path.join(root, 'package.json'))) break;
      root = path.join(root, '..');
    }
    
    this.outputJsonPath = path.join(root, 'output.json');
    this.sitemapPath = path.join(root, 'dist', 'browser', 'sitemap.xml');
    this.watch();
  }

  watch() {
    // Initial generation
    this.generateSitemap();

    if (!fs.existsSync(this.outputJsonPath)) {
      console.warn(`⚠️ [SitemapService] output.json not found at ${this.outputJsonPath}. Skipping watch.`);
      return;
    }

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
          if (!data || data.trim().length === 0) {
            throw new Error('File is empty or currently being written');
          }
          books = JSON.parse(data);
        } catch (parseErr) {
          // If JSON is incomplete, we should wait and retry (already handled by the outer loop)
          throw new Error(`JSON parse error: ${parseErr.message}`);
        }

        if (!Array.isArray(books)) {
          throw new Error('Content is not a JSON array');
        }

        const baseUrl = 'https://knoozbook.com';
        const stableDate = this.getStableWeeklyDate();
        const todayDate = new Date().toISOString().split('T')[0];

        // Exclude non-book, non-indexable categories
        const excludedCategories = [
          'أثاث وديكور المنزل', 'إلكترونيات', 'هدية وألعاب',
          'التجميل والعناية الشخصية', 'ملابس', 'أدوات مكتبية'
        ];

        // Deduplicate and filter books
        const seen = new Set();
        const filteredBooks = books.filter(b => {
          if (!b.products_id) return false;
          const id = String(b.products_id);
          if (seen.has(id)) return false;
          seen.add(id);
          // Filter out excluded categories
          if (excludedCategories.includes((b.product_category || '').trim())) return false;
          return true;
        });

        // --- Static Pages (only indexable pages) ---
        const staticPages = [
          { path: '/Home', changefreq: 'daily',   priority: '1.0' },
          { path: '/books', changefreq: 'daily',   priority: '0.9' },
          { path: '/عن-الموقع', changefreq: 'monthly', priority: '0.5' },
          { path: '/سياسة-الخصوصية', changefreq: 'monthly', priority: '0.3' },
          { path: '/الشروط-والاحكام', changefreq: 'monthly', priority: '0.3' },
          { path: '/promotions', changefreq: 'daily', priority: '0.8' },
          { path: '/bourse', changefreq: 'weekly', priority: '0.6' },
        ];

        const staticUrlsXml = staticPages.map(page => `
  <url>
    <loc>${baseUrl}${page.path}</loc>
    <lastmod>${todayDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('');

        // --- Category Pages (only book categories) ---
        const bookCategories = [...new Set(filteredBooks.map(b => b.product_category).filter(Boolean))];
        const categoryUrlsXml = bookCategories.map(cat => `
  <url>
    <loc>${baseUrl}/category/${encodeURIComponent(cat)}</loc>
    <lastmod>${todayDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

        // --- Product Pages ---
        const productUrlsXml = filteredBooks.map(book => {
          const slug = slugify(book.product_name || '');
          const productId = book.product_id || book.products_id;
          const categoryRoute = getCategoryRoute(book.product_category);
          // Only use 'book' or 'office-supplies' routes — skip old redirected routes
          const safeRoute = ['book', 'office-supplies'].includes(categoryRoute) ? categoryRoute : 'book';
          const loc = slug
            ? `${baseUrl}/${safeRoute}/${productId}/${slug}`
            : `${baseUrl}/${safeRoute}/${productId}`;
          const lastmod = book.promotionEndDate
            ? new Date(book.promotionEndDate).toISOString().split('T')[0]
            : stableDate;
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

        // --- Build Sitemap Index (split into 3 sub-sitemaps) ---
        const sitemapStaticContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrlsXml}${categoryUrlsXml}
</urlset>`;

        const sitemapProductsContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${productUrlsXml}
</urlset>`;

        const sitemapIndexContent = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemap-static.xml</loc>
    <lastmod>${todayDate}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-products.xml</loc>
    <lastmod>${stableDate}</lastmod>
  </sitemap>
</sitemapindex>`;

        // Ensure output directory exists
        await fs.promises.mkdir(path.dirname(this.sitemapPath), { recursive: true });

        // Write all sitemap files
        await fs.promises.writeFile(this.sitemapPath, sitemapIndexContent, 'utf8');
        await fs.promises.writeFile(this.sitemapPath.replace('sitemap.xml', 'sitemap-static.xml'), sitemapStaticContent, 'utf8');
        await fs.promises.writeFile(this.sitemapPath.replace('sitemap.xml', 'sitemap-products.xml'), sitemapProductsContent, 'utf8');

        console.log(`✅ Sitemap index generated: ${filteredBooks.length} products, ${staticPages.length} static, ${bookCategories.length} categories`);
        return; // Success

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
