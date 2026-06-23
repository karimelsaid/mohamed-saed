// Fix Zone.js + undici conflict
globalThis.__Zone_disable_node_timers = true;
globalThis.__Zone_disable_customElements = true;
globalThis.__Zone_disable_requestAnimationFrame = true;

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
const newsletterRoutes = require('./routes/newsletter.routes');
const marketerRoutes = require('./routes/marketer.routes');
const marketerController = require('./controllers/marketer.controller');
const specialOffersRoutes = require('./routes/special-offers.routes');
const express = require('express');
const app = express();
const compression = require('compression');
app.use(compression());

const logStream = fs.createWriteStream(path.join(__dirname, 'requests.log'), { flags: 'a' });

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
    if (origin) console.log(`📡 [CORS_CHECK] Origin: ${origin}`);
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost') || origin.startsWith('https://knoozbook.com')) {
      callback(null, true);
    } else {
      console.warn(`⚠️ [CORS_REJECTED] Origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// On server, files are in root. Locally, they are in /Backend.
const hasLocalDist = fs.existsSync(path.join(__dirname, 'dist', 'browser'));
const projectRoot = hasLocalDist ? __dirname : (__dirname.endsWith('Backend') || fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : __dirname);

const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');

const io = new Server(server, {
  path: '/api/socket.io',
  transports: ['websocket'],
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true
});

const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

// Marketer Short Links (Highest Priority - Before Body Parsers)
app.get('/p/:shortCode', (req, res, next) => {
  console.log('🚀 [ROOT_P_HIT] Code:', req.params.shortCode);
  next();
}, marketerController.redirectShortLink); 
app.get('/api/p/:shortCode', marketerController.redirectShortLink);

app.get('/api/p/test-config', (req, res) => res.json({ 
  success: true, 
  message: 'Marketer Backend is READY', 
  timestamp: new Date(),
  version: 'ANTIGRAVITY-MARKETER-FIX-V1'
}));

app.get('/api/test-now', (req, res) => res.send('API is LIVE and REACHABLE'));

app.use((req, res, next) => {
  if (req.url.includes('marketer')) {
    console.log(`📡 [MARKETER_DEBUG_TOP] ${req.method} ${req.url} | Headers: ${JSON.stringify(req.headers)}`);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
 
 // Rate Limiting - Global
 app.use('/api/', generalLimiter);
 
 // Request Logger for debugging
 app.use((req, res, next) => {
   res.setHeader('X-Backend-Version', 'ANTIGRAVITY-DEBUG-V5-FINAL');
   console.log(`📡 [TRAFFIC] ${req.method} ${req.url} | Origin: ${req.headers.origin || 'N/A'}`);
   const logEntry = `[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin || 'no-origin'} - Headers: ${JSON.stringify(req.headers)}\n`;
   if (typeof logStream !== 'undefined') {
     logStream.write(logEntry);
   }
 
   // Log response status
   const oldSend = res.send;
   res.send = function (data) {
     const resLog = `[${new Date().toISOString()}] Response for ${req.url}: ${res.statusCode}\n`;
     if (typeof logStream !== 'undefined') {
       logStream.write(resLog);
     }
     return oldSend.apply(res, arguments);
   };
 
   next();
 });
 
 app.get('/api/ping', (req, res) => res.json({ success: true, version: 'ANTIGRAVITY-DEBUG-V3', timestamp: new Date() }));
 app.get('/api/test-order', (req, res) => res.json({ success: true, message: 'API order path is reachable via GET' }));
 app.post('/api/test-post', (req, res) => res.json({ success: true, message: 'API POST is working', received: req.body }));
 app.get('/api/test-p', (req, res) => res.send('Marketer routing is working!'));

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
app.use('/api/marketer', (req, res, next) => {
  console.log(`🔍 [MARKETER_ROUTING_DEBUG] ${req.method} ${req.url}`);
  next();
});

app.get('/api/marketer/test-db', async (req, res) => {
  try {
    const User = require('./models/User.model');
    const allUsers = await User.find({}).limit(5).select('username email role marketer');
    const marketerCount = await User.countDocuments({
      $or: [
        { role: 'marketer' },
        { 'marketer.isMarketer': true },
        { 'marketer.applicationStatus': 'approved' },
        { 'marketer.applicationStatus': 'pending' }
      ]
    });
    res.json({ success: true, totalUsersSample: allUsers, totalMarketersInDb: marketerCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/debug/marketer-stats/:email', async (req, res) => {
  try {
    const User = require('./models/User.model');
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      email: user.email,
      role: user.role,
      marketerConfig: user.marketer,
      referralCode: user.referralCode
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/marketer', marketerRoutes);

app.use('/api/users', usersRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/chat-ai', chatAiRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/merchant', merchantRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/bourse', bourseRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/newsletter', newsletterRoutes);

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
app.use('/api/special-offers', specialOffersRoutes);
app.use('/api/notifications', notificationRoutes); // Notification Routes
app.use('/api/quran-progress', quranProgressRoutes); // Quran Progress Routes
app.use('/api/mutabaa', require('./routes/mutabaa.routes')); // Smart Mutaba'a Routes
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
// جدولة تحديث بيانات الكتب كل يوم (تم إيقافها لأن قاعدة البيانات والشيت الجديد أصبحا الأساس)
// cron.schedule('0 */2 * * *', () => {
//   console.log('🔄 جاري تحديث بيانات الكتب...');
//   updateBooksData()
//     .then(() => {
//       generateRobotsTxt();
//     })
//     .catch(console.error);
// });

// تحديث عند بدء التشغيل
// updateBooksData().catch(console.error);

// Seed test ebooks if needed
// const seedEbooks = require('./scripts/seed-ebooks-module');
// seedEbooks().catch(console.error);

// توليد ملف sitemap وقت تشغيل السيرفر
generateRobotsTxt();


function generateRobotsTxt() {
  try {
    // Explicitly block pages that should NOT be indexed
    const disallowRoutes = [
      '/login',
      '/register',
      '/basket',
      '/favorites',
      '/Favorites',
      '/ControlPanel',
      '/research',       // Search results - no independent SEO value
      '/profile',        // User account pages
      '/profile/',
      '/requests',       // User order history
      '/library',        // Personal reading library
      '/reader/',        // eBook reader
      '/achievements',   // Gamification - not for indexing
      '/earn',
      '/referrals',
      '/print',
      '/downloads',
      '/subscription',
      '/marketer-hub',
      '/merchant/',
      '/order/',
      '/subscription/',
    ];

    // Explicitly allow pages that ARE indexable
    const allowRoutes = [
      //'/Home',
      '/book/',
      '/category/',
      '/books',
      '/promotions',
      '/bourse',
      '/community',
      '/عن-الموقع',
      '/سياسة-الخصوصية',
      '/الشروط-والاحكام',
    ];

    let content = 'User-agent: *\n';
    // Allow rules come FIRST (more specific = higher priority in robots.txt)
    allowRoutes.forEach(route => {
      content += `Allow: ${route}\n`;
    });
    disallowRoutes.forEach(route => {
      content += `Disallow: ${route}\n`;
    });

    // Point to sitemap index (covers all sub-sitemaps)
    content += '\nSitemap: https://knoozbook.com/sitemap.xml\n';

    const robotsPath = path.join(projectRoot, 'dist', 'browser', 'robots.txt');
    const dir = path.dirname(robotsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(robotsPath, content);
    console.log('✅ robots.txt generated successfully');
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

// ============================================================
// SEO: Server-level permanent redirects (301)
// These must be placed BEFORE the SSR catch-all so Googlebot
// receives proper redirects instead of client-side navigation.
// ============================================================

// Redirect root / to /Home (LandingComponent only works client-side)
app.get('/', (req, res) => {
  res.redirect(301, '/Home');
});

// Redirect /product/:id/:name? → /book/:id/:name?
// Unifies product URLs so each product has exactly one canonical URL.
app.get('/product/:id/:name?', (req, res) => {
  const { id, name } = req.params;
  const destination = name ? `/book/${id}/${name}` : `/book/${id}`;
  res.redirect(301, destination);
});

// Redirect old English category aliases → /category/:arabicName
const categoryAliasMap = {
  'Business-Marketing-Finance': '/category/%D8%A3%D8%B9%D9%85%D8%A7%D9%84%20%D9%88%D8%AA%D8%B3%D9%88%D9%8A%D9%82%20%D9%88%D9%85%D8%A7%D9%84%D9%8A%D8%A9',
  'Education-children':         '/category/%D8%AA%D8%B1%D8%A8%D9%8A%D8%A9%20%D9%88%D8%A3%D8%B7%D9%81%D8%A7%D9%84',
  'Arts-crafts':                '/category/%D9%81%D9%86%D9%88%D9%86%20%D9%88%D8%AD%D8%B1%D9%81',
  'HealthMedicineScience':      '/category/%D8%B5%D8%AD%D8%A9%20%D9%88%D8%B7%D8%A8%20%D9%88%D8%B9%D9%84%D9%88%D9%85',
  'Islamic':                    '/category/%D9%83%D8%AA%D8%A8%20%D8%AF%D9%8A%D9%86%D9%8A%D8%A9',
  'Novels-stories':             '/category/%D8%B1%D9%88%D8%A7%D9%8A%D8%A7%D8%AA%20%D9%88%D9%82%D8%B5%D8%B5',
  'Self-development-psychology':'/category/%D8%AA%D8%B7%D9%88%D9%8A%D8%B1%20%D8%A7%D9%84%D8%B0%D8%A7%D8%AA%20%D9%88%D8%B9%D9%84%D9%85%20%D8%A7%D9%84%D9%86%D9%81%D8%B3',
  'History-Biographies':        '/category/%D8%AA%D8%A7%D8%B1%D9%8A%D8%AE%20%D9%88%D8%B3%D9%8A%D8%B1%20%D8%B0%D8%A7%D8%AA%D9%8A%D8%A9',
  'Dictionaries-References':    '/category/%D9%82%D9%88%D8%A7%D9%85%D9%8A%D8%B3%20%D9%88%D9%85%D8%B1%D8%A7%D8%AC%D8%B9',
};
Object.entries(categoryAliasMap).forEach(([alias, target]) => {
  app.get(`/${alias}`, (req, res) => res.redirect(301, target));
});

// Bypass SSR for lazy-loaded routes — not supported in Angular Universal (NgModule)
const csrBypassRoutes = ["/books", "/category", "/research", "/basket", "/favorites", "/earn", "/bourse", "/exchange", "/auctions", "/community", "/reader-community", "/subscription/callback", "/order/callback", "/promotions"];
csrBypassRoutes.forEach(route => {
  app.get(`${route}*`, (req, res) => {
    const csrPath = path.join(projectRoot, "dist", "browser", "index.csr.html");
    if (fs.existsSync(csrPath)) return res.sendFile(csrPath);
    return res.sendFile(path.join(projectRoot, "dist", "browser", "index.html"));
  });
});



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
    const csrPath = path.join(projectRoot, 'dist', 'browser', 'index.csr.html');
    const serveCsr = () => {
      if (fs.existsSync(csrPath)) res.sendFile(csrPath);
      else res.status(404).send('Frontend not built.');
    };

    try {
      const angularApp = await angularAppPromise;

      // Use Promise.race to enforce timeout — avoids Zone.js blocking setTimeout
      const ssrPromise = new Promise((resolve, reject) => {
        try {
          angularApp(req, res, (err) => {
            if (err) reject(err);
            else resolve('next');
          });
        } catch (e) {
          reject(e);
        }
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SSR_TIMEOUT')), 5000)
      );

      await Promise.race([ssrPromise, timeoutPromise]).catch((err) => {
        if (!res.headersSent) {
          if (err && err.message === 'SSR_TIMEOUT') {
            console.warn(`⚠️ [SSR_TIMEOUT] ${req.originalUrl} — falling back to CSR`);
          } else {
            console.error('🔥 SSR error:', err);
          }
          serveCsr();
        }
      });

    } catch (err) {
      console.error('🔥 Angular SSR Error:', err);
      if (!res.headersSent) serveCsr();
    }
    return;
  }

  // Development or if SSR is disabled: Fallback to CSR
  const csrPathDefault = path.join(projectRoot, 'dist', 'browser', 'index.csr.html');
  const indexPathDefault = path.join(projectRoot, 'dist', 'browser', 'index.html');
  
  if (fs.existsSync(csrPathDefault)) {
    console.log(`✅ [FALLBACK] Serving index.csr.html from: ${csrPathDefault}`);
    res.sendFile(csrPathDefault);
  } else if (fs.existsSync(indexPathDefault)) {
    console.log(`✅ [FALLBACK] Serving index.html from: ${indexPathDefault}`);
    res.sendFile(indexPathDefault);
  } else {
    console.error('❌ Frontend Entry Point Not Found!');
    console.error('Searched paths:', { csrPathDefault, indexPathDefault });
    console.error('projectRoot was:', projectRoot);
    console.error('__dirname was:', __dirname);
    console.error('Local dist exists:', fs.existsSync(path.join(__dirname, 'dist', 'browser')));
    
    res.status(404).json({
      success: false,
      message: 'Frontend entry point not found in dist/browser.',
      debug: { 
        projectRoot, 
        __dirname,
        csrPathDefault, 
        localDistFound: fs.existsSync(path.join(__dirname, 'dist', 'browser')) 
      }
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

// بدء السيرفر بعد الاتصال بقاعدة البيانات لضمان عدم حدوث سباق
async function startServer() {
  try {
    // الانتظار حتى يكتمل الاتصال بقاعدة البيانات أولاً
    await connectDB();

    // فحص التحديثات الحية بعد الاتصال بنجاح
    detectAndUpdateLiveVersion().catch(err => {
      console.error('❌ [LiveUpdate] Check failed:', err.message);
    });

    server.listen(port, '0.0.0.0', () => {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      const addresses = [];
      for (const k in interfaces) {
        for (const k2 in interfaces[k]) {
          const address = interfaces[k][k2];
          if (address.family === 'IPv4' && !address.internal) {
            addresses.push(address.address);
          }
        }
      }
      console.log('✅ [SERVER_START] IPs:', addresses.join(', '));
      console.log(`🚀 [VERSION-ANTIGRAVITY-1.1] Running on http://0.0.0.0:${port}`);
      cronJobs.initCronJobs();
    });
  } catch (err) {
    logger.error('❌ فشل بدء الخادم بسبب خطأ في قاعدة البيانات:', { error: err.message });
    process.exit(1);
  }
}

// All non-API routes serve Angular
// JSON 404 handler for API routes
app.use('/api/*', (req, res) => {
  console.log(`❌ [MISSED_API] ${req.method} ${req.url} - Not matched by any route`);
  res.status(404).json({
    success: false,
    message: `API Route not found: ${req.method} ${req.originalUrl}`
  });
});

// All non-API routes serve Angular
app.get('*', (req, res) => {
  res.sendFile(path.join(projectRoot, 'dist', 'browser', 'index.html'));
});

startServer();

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error(`🔥 [ERROR_HANDLER] ${req.method} ${req.url} - ${err.message}`);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: err.message
  });
});

module.exports = {
  app
};
