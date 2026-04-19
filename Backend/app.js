
process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', err);
  // Keep process alive if possible for debugging, or log and exit
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 UNHANDLED REJECTION:', reason);
});


require('dotenv').config();
const logger = require('./services/logger.service');
const { generalLimiter, messageLimiter, authLimiter, uploadLimiter } = require('./middleware/rate-limiter.middleware');
const User = require('./models/User.model');
const { ObjectId } = require('mongoose').Types;
const cors = require('cors');
const session = require('express-session');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { connectDB } = require('./config/database');
const { updateBooksData } = require('./controllers/books.controller');
const sitemapService = require('./services/sitemap.service'); // Added import for sitemap service
const axios = require('axios'); // For proxying requests
const cronJobs = require('./services/cron-jobs.service'); // Added cron jobs service
// const MDBReader = require('mdb-reader').default; // Moved to dynamic import inside route due to ESM
// const unrar = require('unrar-promise'); // Moved to dynamic import inside route due to ESM
const iconv = require('iconv-lite'); // For encoding conversion (Windows-1256 to UTF-8)
const crypto = require('crypto');

// استيراد المسارات
const usersRoutes = require('./routes/users.routes');
const booksRoutes = require('./routes/books.routes');
const productsRoutes = require('./routes/products.routes');
const ordersRoutes = require('./routes/orders.routes');
const paymentRoutes = require('./routes/payment.routes');
const printRoutes = require('./routes/print.routes');
const chatAiRoutes = require('./routes/chat-ai.routes');
const adminRoutes = require('./routes/admin.routes'); // تأكد من وجود هذا المسار
const merchantRoutes = require('./routes/merchant.routes');
const paymentRequestsRoutes = require('./routes/payment-requests.routes'); // استيراد مسارات طلبات الدفع
const versionRoutes = require('./routes/version.routes');
const feedbackRoutes = require('./routes/feedback.routes');
// Added version routes
const ebooksRoutes = require('./routes/ebooks.routes');
const subscriptionsRoutes = require('./routes/subscriptions.routes');
const userLibraryRoutes = require('./routes/user-library.routes');
const readingProgressRoutes = require('./routes/reading-progress.routes');
const gamificationRoutes = require('./routes/gamification.routes');
const adminSettingsRoutes = require('./routes/admin-settings');
const notificationRoutes = require('./routes/notification');
const quranProgressRoutes = require('./routes/quran-progress.routes');
const { detectAndUpdateLiveVersion } = require('./utils/live-update-detector');
const communityRoutes = require('./routes/community.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const bourseRoutes = require('./routes/bourse.routes');
const automationRoutes = require('./routes/automation.routes');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

// --- Smart Path Detection ---
// On server, files are in root. Locally, they are in /Backend.
const isInsideBackend = __dirname.endsWith('Backend') || fs.existsSync(path.join(__dirname, '..', 'package.json'));
const projectRoot = isInsideBackend ? path.join(__dirname, '..') : __dirname;

const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');

const io = new Server(server, {
  path: '/api/socket.io',
  transports: ['websocket'], // Force websocket to avoid XHR polling errors on mobile/proxies
  cors: {
    origin: (origin, callback) => {
      // Allow all origins for socket in production if needed, or stick to allowedOrigins
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
        callback(null, true);
      } else {
        console.warn(`📡 [Socket CORS] Origin ${origin} allowed via fallback logic`);
        callback(null, true);
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true // Support older clients if any
});

const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy is required for secure cookies behind a reverse proxy (e.g. Nginx/Cloudflare)
if (isProduction) {
  app.set('trust proxy', 1);
}

const logStream = fs.createWriteStream(path.join(__dirname, 'requests.log'), { flags: 'a' });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiting - Global
app.use('/api/', generalLimiter);

// Request Logger for debugging
app.use((req, res, next) => {
  const logEntry = `[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin || 'no-origin'} - Headers: ${JSON.stringify(req.headers)}\n`;
  // console.log(logEntry);
  logStream.write(logEntry);

  // Log response status
  const oldSend = res.send;
  res.send = function (data) {
    const resLog = `[${new Date().toISOString()}] Response for ${req.url}: ${res.statusCode}\n`;
    logStream.write(resLog);
    return oldSend.apply(res, arguments);
  };

  next();
});

// إضافة رؤوس Cross-Origin-Opener-Policy و Cross-Origin-Embedder-Policy
app.use((req, res, next) => {
  // Relaxed headers to allow Google Sign-In popups and external resources
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

// إعداد CORS للسماح بالمصادر المناسبة
// إعداد CORS للسماح بالمصادر المناسبة
const allowedOrigins = [
  'https://knoozbook.com',
  'https://www.knoozbook.com',
  'https://localhost',
  'http://localhost',
  'http://localhost:3000',
  'capacitor://localhost',
  'http://localhost:4200',
  'http://localhost:8100',
  'http://localhost:8080'
];

app.use(cors({
  origin: function (origin, callback) {
    // Log origin for debugging
    // if (origin) {
    //   console.log(`📡 [CORS Request] Origin: ${origin}`);
    // }

    if (!origin) return callback(null, true);

    // Normalize: remove trailing slash for comparison
    const normalizedOrigin = origin.replace(/\/$/, "");

    if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🛑 [CORS Blocked] Origin "${origin}" is not in whitelist!`);
      // For debugging, you can temporarily allow everything by calling callback(null, true)
      // but for production, we keep it strict and just log the failure.
      callback(null, true); // TEMPORARY: Allow all for debugging, but we will see the log!
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'Content-Disposition'],
  credentials: true
}));

// Inject IO into request for controllers
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use('/api/print', printRoutes);

// Session middleware
const MongoStore = require('connect-mongo');

// Session middleware
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGO_URI || "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz",
  collectionName: 'sessions',
  ttl: 14 * 24 * 60 * 60, // 14 days
  autoRemove: 'native'
});

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false, // Changed to false for better performance with MongoStore
  store: sessionStore,
  cookie: {
    secure: isProduction, // Secure in production (requires HTTPS)
    sameSite: isProduction ? 'lax' : 'lax', // Use Lax for better compatibility
    maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
  }
}));

// Middleware to handle referral code
app.use((req, res, next) => {
  if (req.query.ref) {
    req.session.referrerCode = req.query.ref;
  }
  next();
});




// Proxy Download Route with Caching
app.get('/api/proxy-download', async (req, res) => {
  const fileUrl = req.query.url;
  if (!fileUrl) {
    return res.status(400).send('Missing url parameter');
  }

  // Generate a safe filename from URL (hash or simple clean)
  // E.g. https://old.shamela.ws/.../80.rar -> 80.rar
  // Use encoding to handle query params if any, but Shamela URLs are simple usually.
  // Ensure uniqueness.
  const urlParts = fileUrl.split('/');
  const safeName = urlParts[urlParts.length - 1].replace(/[^a-zA-Z0-9.-]/g, '_');
  const cacheDir = path.join(__dirname, 'uploads', 'external_cache');
  const cacheFilePath = path.join(cacheDir, safeName);

  // Ensure cache dir exists
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // 1. Check Cache
  if (fs.existsSync(cacheFilePath)) {
    // Serve from cache
    const stat = fs.statSync(cacheFilePath);
    // Only serve if fully downloaded (simple check: size > 0). 
    // Ideally we'd have a temp file but for simplicity:
    if (stat.size > 0) {
      res.setHeader('Content-Type', 'application/x-rar-compressed');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      const readStream = fs.createReadStream(cacheFilePath);
      readStream.pipe(res);
      return;
    }
  }

  // 2. Buffer and Send (Most Stable Approach)
  try {
    const response = await axios({
      method: 'get',
      url: fileUrl,
      responseType: 'arraybuffer', // Load into memory
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Referer': 'https://old.shamela.ws/'
      },
      timeout: 60000
    });

    const buffer = response.data;
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const contentLength = buffer.length;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', contentLength);
    // Remove attachment to prevent browser dialog if accessing directly, though Angular ignores it.
    // res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length'); // Ensure client sees size

    res.send(buffer);

    // Cache Async (Fire and Forget)
    // Don't let caching errors stop the response
    try {
      if (!fs.existsSync(cacheFilePath)) {
        fs.writeFileSync(cacheFilePath, buffer);
        console.log('File cached successfully (Buffered):', safeName);
      }
    } catch (cacheErr) {
      console.error('Cache Write Error:', cacheErr.message);
    }

  } catch (error) {
    console.error('Proxy Error Details:', error.message);
    if (!res.headersSent) {
      if (error.response) {
        res.status(error.response.status).send('External Error');
      } else {
        res.status(500).send('Proxy Failed: ' + error.message);
      }
    }
  }
});


// Extract Book Content API - Downloads RAR, extracts BOK, parses database, returns text
app.get('/api/extract-book', async (req, res) => {
  const fileUrl = req.query.url;
  const bookId = req.query.bookId;

  if (!fileUrl || !bookId) {
    return res.status(400).json({ error: 'Missing url or bookId parameter' });
  }

  // Generate safe filename
  const urlParts = fileUrl.split('/');
  const safeName = urlParts[urlParts.length - 1].replace(/[^a-zA-Z0-9.-]/g, '_');
  const cacheDir = path.join(__dirname, 'uploads', 'external_cache');
  const extractDir = path.join(__dirname, 'uploads', 'extracted');
  const cacheFilePath = path.join(cacheDir, safeName);

  // Ensure directories exist
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  if (!fs.existsSync(extractDir)) fs.mkdirSync(extractDir, { recursive: true });

  // Dynamic import for ESM module
  const { default: MDBReader } = await import('mdb-reader');
  const unrar = await import('unrar-promise');

  try {
    // Step 1: Download RAR if not cached
    if (!fs.existsSync(cacheFilePath)) {
      // console.log('Downloading:', fileUrl);
      const response = await axios({
        method: 'get',
        url: fileUrl,
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://old.shamela.ws/'
        },
        timeout: 60000
      });
      fs.writeFileSync(cacheFilePath, response.data);
      // console.log('Downloaded and cached:', safeName);
    }

    // Step 2: Extract RAR
    const bookExtractDir = path.join(extractDir, bookId);
    if (!fs.existsSync(bookExtractDir)) {
      fs.mkdirSync(bookExtractDir, { recursive: true });
    }

    // console.log('Extracting RAR...');
    await unrar.unrar(cacheFilePath, bookExtractDir);

    // Step 3: Find BOK file
    const extractedFiles = fs.readdirSync(bookExtractDir);
    let bokFile = extractedFiles.find(f => f.toLowerCase().endsWith('.bok'));

    if (!bokFile && extractedFiles.length > 0) {
      bokFile = extractedFiles[0]; // Use first file if no .bok
    }

    if (!bokFile) {
      throw new Error('No BOK file found in archive');
    }

    const bokPath = path.join(bookExtractDir, bokFile);
    // console.log('Parsing BOK:', bokPath);

    // Step 4: Parse BOK database
    const buffer = fs.readFileSync(bokPath);
    const reader = new MDBReader(buffer);
    const tableNames = reader.getTableNames();
    // console.log('Tables:', tableNames);

    let bookContent = '';

    // Shamela BOK format: b{bookId} contains the actual text with 'nass' column
    // Look for tables starting with 'b' followed by numbers
    let contentTable = tableNames.find(t => /^b\d+$/.test(t));

    // Fallback to other common names
    if (!contentTable) {
      const possibleTables = ['b', 'book', 'page', 't', 'text'];
      contentTable = tableNames.find(t => possibleTables.includes(t.toLowerCase()));
    }

    // Last resort: first non-system, non-Main table
    if (!contentTable) {
      contentTable = tableNames.find(t => !t.startsWith('MSys') && t !== 'Main' && !t.startsWith('men_')) || tableNames[0];
    }

    // console.log('Using table:', contentTable);



    let idMap = {}; // Maps record ID -> word count index
    let currentWordCount = 0;

    if (contentTable) {
      const table = reader.getTable(contentTable);
      const data = table.getData();
      const columns = table.getColumns();

      // console.log(`Table '${contentTable}' has ${data.length} rows`);

      // Find text column
      const textColNames = ['nass', 'text', 'content', 'page', 'body'];
      const textCol = columns.find(c => textColNames.includes(c.name.toLowerCase()));
      const idCol = columns.find(c => ['id', 'nass_id', 'target'].includes(c.name.toLowerCase()));

      let parsedContentParts = [];

      if (textCol) {
        data.forEach(row => {
          const rawText = row[textCol.name];
          if (rawText && String(rawText).trim().length > 0) {
            const text = String(rawText);

            // Map ID to current word count
            if (idCol) {
              idMap[row[idCol.name]] = currentWordCount;
            } else if (row.id) {
              idMap[row.id] = currentWordCount;
            }

            parsedContentParts.push(text);

            // Approximate word count (same logic as Reader)
            const wordCount = text.split(/\s+/).length;
            currentWordCount += wordCount;
          }
        });
        bookContent = parsedContentParts.join('\n\n---\n\n');

      } else {
        // Fallback: stringify first non-id column
        const contentCol = columns.find(c => !['id', 'parentid', 'pagenum'].includes(c.name.toLowerCase()));
        if (contentCol) {
          bookContent = data.map(row => String(row[contentCol.name] || '')).join('\n\n');
        }
      }
    }



    // --- TOC Extraction Logic ---
    let toc = [];
    let tocTable = null;
    if (contentTable) {
      const idMatch = contentTable.match(/^b(\d+)$/);
      if (idMatch) {
        const tableId = idMatch[1];
        tocTable = tableNames.find(t => t === `t${tableId}`);
      }
    }

    // Fallback for TOC table
    if (!tocTable) {
      tocTable = tableNames.find(t => ['titles', 'f', 'fehres'].includes(t.toLowerCase()));
    }

    if (tocTable) {
      // console.log('Using TOC table:', tocTable);
      const tTable = reader.getTable(tocTable);
      const tData = tTable.getData();
      const tColumns = tTable.getColumns();

      // Identify columns: tit (title), lvl (level), id (target id)
      const titCol = tColumns.find(c => ['tit', 'title', 'nass'].includes(c.name.toLowerCase()));
      const lvlCol = tColumns.find(c => ['lvl', 'level'].includes(c.name.toLowerCase()));
      const idCol = tColumns.find(c => ['id', 'nass_id', 'target'].includes(c.name.toLowerCase()));

      if (titCol && idCol) {
        toc = tData.map(row => {
          let title = String(row[titCol.name] || '');
          // Decode title if needed
          if (/[\xC0-\xFF]/.test(title)) {
            const buffer = Buffer.from(title, 'latin1');
            title = iconv.decode(buffer, 'windows-1256');
          }

          return {
            id: row[idCol.name],
            title: title,
            level: lvlCol ? Number(row[lvlCol.name]) || 0 : 0
          };
        });
      }
    } else {
      // console.log('No TOC table found');
    }

    if (!bookContent || bookContent.length < 100) {
      throw new Error('Could not extract readable content from BOK file');
    }

    // Convert from Windows-1256 (Arabic) to UTF-8 if needed
    // Check if text looks like misencoded Arabic (Latin-1 chars where Arabic should be)
    if (/[\xC0-\xFF]/.test(bookContent.substring(0, 1000))) {
      // console.log('Detected Windows-1256 encoding, converting...');
      // Convert: treat the string as Latin-1 bytes, decode as Windows-1256
      const buffer = Buffer.from(bookContent, 'latin1');
      bookContent = iconv.decode(buffer, 'windows-1256');
    }

    // console.log('Extracted content length:', bookContent.length);
    // console.log('Sample (first 200 chars):', bookContent.substring(0, 200));

    // Clean up extracted files to save server space
    try {
      fs.rmSync(bookExtractDir, { recursive: true, force: true });
      // ALSO remove the cached RAR file to save space
      if (fs.existsSync(cacheFilePath)) {
        fs.unlinkSync(cacheFilePath);
      }
      // console.log('Cleaned up extracted files and RAR:', safeName);
    } catch (cleanErr) {
      console.error('Cleanup error:', cleanErr.message);
    }

    res.json({
      success: true,
      bookId: bookId,
      content: bookContent,
      length: bookContent.length,
      toc: toc,
      idMap: idMap
    });

  } catch (error) {
    console.error('Extract Book Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


const uploadsAbsolutePath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsAbsolutePath));

const promotionRoutes = require('./routes/promotion.routes');
app.use('/api/promotions', promotionRoutes);
// Dedicated route to serve files with Content-Disposition attachment to force download
app.get('/uploads/:filename', (req, res) => {
  const encodedFilename = req.params.filename;
  const filename = decodeURIComponent(encodedFilename);
  const filePath = path.join(__dirname, 'uploads', filename);
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error('File does not exist:', filePath);
      return res.status(404).send('File not found');
    }
    // Set Content-Type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (ext === '.rar') {
      contentType = 'application/x-rar-compressed';
    } else if (ext === '.zip') {
      contentType = 'application/zip';
    }
    res.setHeader('Content-Type', contentType);
    // Remove Content-Disposition header to allow inline display
    // res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Error sending file for download:', err);
        res.status(500).send('Error downloading file');
      }
    });
  });
});

// تسجيل المسارات
app.use('/api/users', usersRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payment', paymentRoutes); // تعديل المسار ليكون أكثر تحديداً

app.use('/api/chat-ai', chatAiRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/merchant', merchantRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/bourse', bourseRoutes);
app.use('/api/automation', automationRoutes);

// Delete print order and associated file
const mongoose = require('mongoose');
// تسجيل مسار طلبات الدفع
app.use('/api/payment-requests', paymentRequestsRoutes);
app.use('/api/mobile-version', versionRoutes); // Register version check route

// E-book system routes
app.use('/api/ebooks', ebooksRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/user-library', userLibraryRoutes);
app.use('/api/reading-progress', readingProgressRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/notifications', notificationRoutes); // Notification Routes
app.use('/api/quran-progress', quranProgressRoutes); // Quran Progress Routes
app.use('/api/mutabaa', require('./routes/mutabaa.routes')); // Smart Mutaba'a Routes

// JSON 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API Route not found: ${req.method} ${req.originalUrl}`
  });
});
app.use('/api/hifz-plan', require('./routes/hifzPlan.routes')); // Dynamic Hifz Plan Routes
app.use('/api/halaqa', require('./routes/halaqa.routes')); // Community Halaqa Routes

// Apply specific rate limiters to sensitive routes
app.use('/api/users/login', authLimiter);
app.use('/api/halaqa/upload-voice', uploadLimiter);
app.use('/api/halaqa/upload-file', uploadLimiter);
app.get('/api/feedback', feedbackRoutes); // Feedback Routes

// Global Error Handler for API
app.use('/api', (err, req, res, next) => {
  console.error('🔥 API ERROR:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: isProduction ? {} : err
  });
});


// Direct route definition for deleting print order
const printController = require('./controllers/print.controller');
app.delete('/api/print/orders/:userId/:orderId', printController.deletePrintOrder);
// Add the old route for admin dashboard compatibility
app.delete('/api/print/delete-print-order/:userId/:orderId', printController.deletePrintOrder);

// جدولة تحديث بيانات الكتب كل يوم
cron.schedule('0 */2 * * *', () => {
  console.log('🔄 جاري تحديث بيانات الكتب...');
  updateBooksData()
    .then(() => {
      generateRobotsTxt();
    })
    .catch(console.error);
});

// تحديث عند بدء التشغيل
// updateBooksData().catch(console.error);

// Seed test ebooks if needed
// const seedEbooks = require('./scripts/seed-ebooks-module');
// seedEbooks().catch(console.error);

// توليد ملف sitemap وقت تشغيل السيرفر
generateRobotsTxt();


function generateRobotsTxt() {
  try {
    const disallowRoutes = ['/login', '/register', '/basket', '/Favorites', '/ControlPanel'];
    const allowRoutes = ['book', 'Home', 'Business-Marketing-Finance', 'Education-children', 'Arts-crafts', 'HealthMedicineScience', 'Islamic', 'Novels-stories', 'Self-development-psychology', 'History-Biographies', 'Dictionaries-References', 'research', 'requests', 'print'];

    let content = 'User-agent: *\n';
    disallowRoutes.forEach(route => {
      content += `Disallow: ${route}\n`;
    });
    allowRoutes.forEach(route => {
      content += `Allow: /${route}\n`;
    });

    content += '\nSitemap: https://knoozbook.com/sitemap.xml\n';

    const robotsPath = path.join(projectRoot, 'dist', 'browser', 'robots.txt');
    const dir = path.dirname(robotsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(robotsPath, content);
  } catch (error) {
    console.error('❌ فشل في إنشاء robots.txt:', error.message);
  }
}

// --- Angular SSR Integration ---
let angularAppPromise = null;

if (isProduction) {
  // Use dynamic import for ESM module in CommonJS
  const serverPath = path.join(projectRoot, 'dist', 'server', 'server.mjs');
  angularAppPromise = import('file://' + serverPath).then(m => m.app());
}

// Serve static files from /browser
app.use(express.static(path.join(projectRoot, 'dist', 'browser'), {
  maxAge: '1y',
  index: false // Don't serve index.html directly from static middleware
}));

// SSR Catch-all route
app.get('*', async (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }

  // If the request is for a file (has an extension) that wasn't caught by static middleware,
  // it's likely a missing asset. Don't serve index.html for it.
  if (path.extname(req.path)) {
    return res.status(404).send('Not found');
  }

  if (isProduction && angularAppPromise) {
    try {
      const angularApp = await angularAppPromise;
      return angularApp(req, res, next);
    } catch (err) {
      console.error('🔥 Angular SSR Error:', err);
      // Fallback to CSR if SSR fails - but check if file exists first!
      const csrPath = path.join(projectRoot, 'dist', 'browser', 'index.csr.html');
      if (fs.existsSync(csrPath)) {
        return res.sendFile(csrPath);
      } else {
        return res.status(404).send('Frontend not built. Please run npm run build.');
      }
    }
  }

  // Development or if SSR is disabled: Fallback to CSR
  const csrPathDefault = path.join(projectRoot, 'dist', 'browser', 'index.csr.html');
  if (fs.existsSync(csrPathDefault)) {
    res.sendFile(csrPathDefault);
  } else {
    // If we're in ng serve mode, this is expected to be handled by the dev server proxy
    // but the backend shouldn't crash if it hits this endpoint.
    res.status(404).json({
      success: false,
      message: 'Frontend entry point not found in dist/browser. If using ng serve, access via port 4200.'
    });
  }
});

// Endpoint to provide dynamic ICE servers with TURN credentials
app.get('/api/ice-servers', (req, res) => {
  const secret = process.env.TURN_SECRET || 'kenouz_default_secret';
  const turnDomain = process.env.TURN_DOMAIN || 'turn.knoozbook.com';

  // Expiry time (24 hours from now)
  const ttl = 24 * 3600;
  const timestamp = Math.floor(Date.now() / 1000) + ttl;

  // Username for Coturn in REST mode is just the timestamp
  const username = timestamp.toString();

  // Password is the HMAC-SHA1 of the username using the secret
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(username);
  const password = hmac.digest('base64');

  res.json({
    success: true,
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: [`turn:${turnDomain}:3478?transport=udp`, `turn:${turnDomain}:3478?transport=tcp`],
        username: username,
        credential: password
      }
    ]
  });
});

// Socket.io Logic for Presence
const activeUsersInRooms = {}; // { halaqaId: Map(userIds) }
const globalOnlineUsers = new Map(); // Map(userId -> { username, socketId })

// Main Namespace: Presence & Messaging
io.on('connection', (socket) => {
  console.log('👤 New socket connection:', socket.id);

  socket.on('user_online', ({ userId, username }) => {
    socket.userId = userId;
    socket.username = username;
    globalOnlineUsers.set(userId, { username, socketId: socket.id, lastSeen: new Date() });
    io.emit('global_presence_update', Array.from(globalOnlineUsers.keys()));
    console.log(`📡 User ${username} is globally online`);
  });

  socket.on('join_halaqa', ({ halaqaId, userId, username }) => {
    socket.join(halaqaId);
    socket.userId = userId;
    socket.halaqaId = halaqaId;
    socket.username = username;

    if (!activeUsersInRooms[halaqaId]) {
      activeUsersInRooms[halaqaId] = new Map();
    }

    activeUsersInRooms[halaqaId].set(userId, {
      userId,
      username,
      socketId: socket.id,
      joinedAt: new Date()
    });

    io.to(halaqaId).emit('presence_update', Array.from(activeUsersInRooms[halaqaId].values()));
    console.log(`✅ User ${username} joined Halaqa ${halaqaId}`);
  });

  socket.on('sync_page', ({ halaqaId, userId, pageNumber }) => {
    console.log(`📖 Page Sync: User ${userId} updated page to ${pageNumber} in Halaqa ${halaqaId}`);
    socket.to(halaqaId).emit('page_sync_update', { userId, pageNumber, timestamp: new Date() });
  });

  socket.on('disconnect', () => {
    const { halaqaId, userId } = socket;
    if (userId) {
      globalOnlineUsers.delete(userId);
      io.emit('global_presence_update', Array.from(globalOnlineUsers.keys()));
    }
    if (halaqaId && userId && activeUsersInRooms[halaqaId]) {
      activeUsersInRooms[halaqaId].delete(userId);
      io.to(halaqaId).emit('presence_update', Array.from(activeUsersInRooms[halaqaId].values()));
      console.log(`❌ User ${userId} disconnected from Room ${halaqaId}`);
    }
  });
});

// Dedicated Signaling Namespace for Calls (1:1 + Group)
const signaling = io.of('/signaling');
const signalingUsers = new Map(); // userId -> socketId
const callRooms = new Map(); // roomId -> Map(userId -> { socketId, username, joinedAt })

signaling.on('connection', (socket) => {
  logger.info(`📞 New signaling connection: ${socket.id}`);

  socket.on('register', (userId) => {
    socket.userId = userId;
    signalingUsers.set(userId, socket.id);
    logger.info(`📡 [Signaling] User ${userId} registered`);
  });

  // === 1:1 Call Events (preserved) ===
  socket.on('call-user', ({ to, offer }) => {
    const targetSocketId = signalingUsers.get(to);
    if (targetSocketId) {
      signaling.to(targetSocketId).emit('call-made', {
        offer,
        from: socket.userId
      });
    }
  });

  socket.on('make-answer', ({ to, answer }) => {
    const targetSocketId = signalingUsers.get(to);
    if (targetSocketId) {
      signaling.to(targetSocketId).emit('answer-made', {
        answer,
        from: socket.userId
      });
    }
  });

  // 1:1 ice-candidate (by user ID)
  socket.on('ice-candidate', ({ to, candidate }) => {
    const targetSocketId = signalingUsers.get(to);
    if (targetSocketId) {
      signaling.to(targetSocketId).emit('ice-candidate', {
        candidate,
        from: socket.userId
      });
    }
  });

  // === Group Call Events ===

  // Join a call room
  socket.on('join-room', ({ roomId, username }) => {
    const userId = socket.userId;
    if (!userId) return;

    socket.join(`call:${roomId}`);
    socket.callRoomId = roomId;

    if (!callRooms.has(roomId)) {
      callRooms.set(roomId, new Map());
    }

    const room = callRooms.get(roomId);

    // Get existing users BEFORE adding the new one
    const existingUsers = Array.from(room.entries()).map(([uid, info]) => ({
      userId: uid,
      username: info.username,
      socketId: info.socketId
    }));

    // Add new user to room
    room.set(userId, { socketId: socket.id, username, joinedAt: new Date() });

    // Send existing users list to the joiner
    socket.emit('room-users', existingUsers);

    // Notify everyone else about the new user
    socket.to(`call:${roomId}`).emit('user-joined', {
      userId,
      username,
      socketId: socket.id
    });

    // Broadcast updated room info to halaqa chat namespace too
    io.to(roomId).emit('call_room_update', {
      roomId,
      participants: Array.from(room.values()).map(u => u.username),
      count: room.size
    });

    logger.info(`📞 [Group] ${username} joined call room ${roomId} (${room.size} users)`);
  });

  // Leave a call room
  socket.on('leave-room', ({ roomId }) => {
    handleLeaveRoom(socket, roomId);
  });

  // Group call signaling: relay offer to specific peer in room
  socket.on('group-offer', ({ to, offer, roomId }) => {
    const targetSocketId = signalingUsers.get(to);
    if (targetSocketId) {
      signaling.to(targetSocketId).emit('group-offer', {
        offer,
        from: socket.userId,
        roomId
      });
    }
  });

  // Group call signaling: relay answer to specific peer in room
  socket.on('group-answer', ({ to, answer, roomId }) => {
    const targetSocketId = signalingUsers.get(to);
    if (targetSocketId) {
      signaling.to(targetSocketId).emit('group-answer', {
        answer,
        from: socket.userId,
        roomId
      });
    }
  });

  // Group call signaling: relay ICE candidate to specific peer in room
  socket.on('group-ice-candidate', ({ to, candidate, roomId }) => {
    const targetSocketId = signalingUsers.get(to);
    if (targetSocketId) {
      signaling.to(targetSocketId).emit('group-ice-candidate', {
        candidate,
        from: socket.userId,
        roomId
      });
    }
  });

  // Get current call room info (for showing active call indicator)
  socket.on('get-room-info', ({ roomId }, callback) => {
    const room = callRooms.get(roomId);
    if (room && room.size > 0) {
      callback({
        active: true,
        participants: Array.from(room.entries()).map(([uid, info]) => ({
          userId: uid,
          username: info.username
        })),
        count: room.size
      });
    } else {
      callback({ active: false, participants: [], count: 0 });
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      signalingUsers.delete(socket.userId);
      // If user was in a call room, clean up
      if (socket.callRoomId) {
        handleLeaveRoom(socket, socket.callRoomId);
      }
      logger.info(`❌ [Signaling] User ${socket.userId} disconnected`);
    }
  });
});

function handleLeaveRoom(socket, roomId) {
  const userId = socket.userId;
  if (!userId) return;

  socket.leave(`call:${roomId}`);

  const room = callRooms.get(roomId);
  if (room) {
    const userInfo = room.get(userId);
    room.delete(userId);

    // Notify remaining users
    signaling.to(`call:${roomId}`).emit('user-left', { userId });

    // Update halaqa chat namespace
    io.to(roomId).emit('call_room_update', {
      roomId,
      participants: Array.from(room.values()).map(u => u.username),
      count: room.size
    });

    console.log(`📞 [Group] ${userInfo?.username || userId} left call room ${roomId} (${room.size} remaining)`);

    // Cleanup empty rooms
    if (room.size === 0) {
      callRooms.delete(roomId);
    }
  }

  socket.callRoomId = null;
}


// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('🔥 Global Error Handler:', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// بدء السيرفر بعد التأكد من الاتصال بقاعدة البيانات
async function startServer() {
  try {
    await connectDB();
    
    // Check for live updates on startup
    await detectAndUpdateLiveVersion();

    server.listen(port, '0.0.0.0', () => {
      logger.info(`🚀 [VERSION-ANTIGRAVITY-1.1] الخادم يعمل على http://0.0.0.0:${port}`);
      // Initialize Cron Jobs
      cronJobs.initCronJobs();
    });
  } catch (err) {
    logger.error('❌ فشل بدء الخادم بسبب خطأ في قاعدة البيانات:', { error: err.message });
    process.exit(1);
  }
}

startServer();

module.exports = {
  app
};
