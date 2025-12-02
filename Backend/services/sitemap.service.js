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

  generateSitemap() {
    fs.readFile(this.outputJsonPath, 'utf8', (err, data) => {
      if (err) {
        console.error('Error reading output.json:', err);
        return;
      }
      let books;
      try {
        books = JSON.parse(data);
      } catch (parseErr) {
        console.error('Error parsing output.json:', parseErr);
        return;
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
      fs.mkdir(path.dirname(this.sitemapPath), { recursive: true }, (mkdirErr) => {
        if (mkdirErr) {
          console.error('Error creating sitemap directory:', mkdirErr);
          return;
        }
        // Write sitemap.xml
        fs.writeFile(this.sitemapPath, sitemapContent, 'utf8', (writeErr) => {
          if (writeErr) {
            console.error('Error writing sitemap.xml:', writeErr);
          } else {
            console.log('✅ sitemap.xml generated successfully');
          }
        });
      });
    });
  }
}

module.exports = new SitemapService();
