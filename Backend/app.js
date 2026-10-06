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


const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Validate required Amazon environment variables
console.log('🔍 [Amazon Config] Validating required environment variables...');
const requiredAmazonVars = [
  'SELLING_PARTNER_APP_CLIENT_ID',
  'SELLING_PARTNER_APP_CLIENT_SECRET',
  'AMAZON_SP_API_REFRESH_TOKEN',
  'AMAZON_SP_API_MARKETPLACE_ID',
  'AMAZON_SP_API_REGION'
];

const optionalAmazonVars = [
  'AMAZON_SP_API_ROLE_ARN',
  'AMAZON_SP_API_SELLER_ID',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SELLING_PARTNER_ROLE',
  'SELLING_PARTNER_SELLER_ID'
];

let missingVars = [];
requiredAmazonVars.forEach(varName => {
  const isSet = !!process.env[varName];
  console.log(`  ${isSet ? '✅' : '❌'} ${varName}: ${isSet ? 'SET' : 'MISSING'}`);
  if (!isSet) missingVars.push(varName);
});

optionalAmazonVars.forEach(varName => {
  const isSet = !!process.env[varName];
  console.log(`  ${isSet ? '✅' : '⚠️ '} ${varName}: ${isSet ? 'SET' : 'NOT SET (optional)'}`);
});

if (missingVars.length > 0) {
  console.error('❌ [Amazon Config] FATAL: Missing required environment variables:', missingVars.join(', '));
  console.error('❌ [Amazon Config] Amazon publishing features will be disabled');
  process.env.AMAZON_CONFIG_VALID = 'false';
} else {
  console.log('✅ [Amazon Config] All required Amazon environment variables are set');
  process.env.AMAZON_CONFIG_VALID = 'true';
}

// Load Amazon queue module but don't initialize yet
console.log('🚀 [App] Loading Amazon queue module...');
const PublishAmazonProductJob = require('./jobs/publish-amazon-product.job');

const logger = require('./services/logger.service');
const { generalLimiter, messageLimiter, authLimiter, uploadLimiter } = require('./middleware/rate-limiter.middleware');
const User = require('./models/User.model');
const { ObjectId } = require('mongoose').Types;
const cors = require('cors');
const session = require('express-session');
const cron = require('node-cron');
const fs = require('fs');
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
const promotionsRoutes = require('./routes/promotion.routes');
const booksRoutes = require('./routes/books.routes');
const productsRoutes = require('./routes/products.routes');
const ordersRoutes = require('./routes/orders.routes');
const paymentRoutes = require('./routes/payment.routes');
const printRoutes = require('./routes/print.routes');
const chatAiRoutes = require('./routes/chat-ai.routes');
const quickActionsRoutes = require('./routes/quick-actions.routes');
const adminRoutes = require('./routes/admin.routes'); // تأكد من وجود هذا المسار
const statisticsRoutes = require('./routes/statistics.routes');
const bookRequestRoutes = require('./routes/book-request.routes');
const merchantRoutes = require('./routes/merchant.routes');
const paymentRequestsRoutes = require('./routes/payment-requests.routes'); // استيراد مسارات طلبات الدفع
const versionRoutes = require('./routes/version.routes');
const feedbackRoutes = require('./routes/feedback.routes');
const affiliateRoutes = require('./routes/affiliate.routes');
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
const n8nWorkflowRoutes = require('./routes/n8n-workflow.routes');
const newsletterRoutes = require('./routes/newsletter.routes');
const marketerRoutes = require('./routes/marketer.routes');
const marketerController = require('./controllers/marketer.controller');
const specialOffersRoutes = require('./routes/special-offers.routes');
const amazonProductRoutes = require('./routes/amazon-product.routes');
const amazonDiagnosticsRoutes = require('./routes/amazon-diagnostics.routes');
const amazonAccountRoutes = require('./routes/amazon-account.routes');
const amazonOAuthRoutes = require('./routes/amazon-oauth.routes');
const publisherRoutes = require('./routes/publisher.routes');
const shippingSettingRoutes = require('./routes/shipping-setting.routes');
const youtubeVideoRoutes = require('./routes/youtube-video.routes');
const adminPartnershipRoutes = require('./routes/adminPartnershipRoutes');
const partnerRoutes = require('./routes/partnerRoutes');
const categoriesRoutes = require('./routes/categories.routes');
const express = require('express');
const app = express();
const compression = require('compression');
app.use(compression());

// Request Logger for debugging
app.use((req, res, next) => {
  res.setHeader('X-Backend-Version', 'ANTIGRAVITY-DEBUG-V5-FINAL');
  console.log(`📡 [TRAFFIC] ${req.method} ${req.url} | Origin: ${req.headers.origin || 'N/A'}`);
  next();
});

const allowedOrigins = [
  'https://knoozbook.com',
  'https://www.knoozbook.com',
  'https://localhost',
  'http://localhost',
  'http://localhost:3000',
  'capacitor://localhost',
  'http://localhost:4200',
  'http://localhost:8100',
  'http://localhost:8080',
  'http://127.0.0.1:57885'
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

// Increase server timeout for bulk operations (15 minutes)
server.timeout = 900000;
server.keepAliveTimeout = 900000;
server.headersTimeout = 910000;

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
    return res.status(400).send('Missing url or bookId parameter');
  }

  // Generate a safe filename from URL
  const urlParts = fileUrl.split('/');
  const safeName = urlParts[urlParts.length - 1].replace(/[^a-zA-Z0-9.-]/g, '_');
  const tempDir = path.join(__dirname, 'uploads', 'temp_extract', bookId);
  const rarPath = path.join(tempDir, safeName);

  // Ensure temp dir exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    // 1. Download RAR
    console.log(`[EXTRACT] Downloading: ${fileUrl}`);
    const response = await axios({
      method: 'get',
      url: fileUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://old.shamela.ws/'
      },
      timeout: 60000
    });

    const writer = fs.createWriteStream(rarPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`[EXTRACT] Downloaded to: ${rarPath}`);

    // 2. Extract RAR using node-unrar-js (pure JS, no system binary needed)
    const { createExtractorFromFile } = require('node-unrar-js');
    const extractor = await createExtractorFromFile({ filepath: rarPath, targetPath: tempDir });
    const extractResult = extractor.extract();
    // Iterate through extracted files to ensure extraction completes
    const extractedFiles = [...extractResult.files];
    console.log(`[EXTRACT] Extracted ${extractedFiles.length} files to: ${tempDir}`);

    // 3. Find .bok file (Access/MDB)
    const files = fs.readdirSync(tempDir);
    const bokFile = files.find(f => f.toLowerCase().endsWith('.bok'));

    if (!bokFile) {
      throw new Error('No .bok file found in RAR');
    }

    const bokPath = path.join(tempDir, bokFile);
    console.log(`[EXTRACT] Found BOK: ${bokPath}`);

    // 4. Parse BOK (MDB) using mdb-reader
    const MDBReader = require('mdb-reader').default;
    const buffer = fs.readFileSync(bokPath);
    const reader = new MDBReader(buffer);

    // Shamela .bok structure:
    // Content table: 'b' + number (e.g. 'b31700') with columns: id, nass, page, Part
    // TOC table: 't' + number (e.g. 't31700') with columns: id, tit, lvl, sub
    const tables = reader.getTableNames();
    console.log(`[EXTRACT] Tables:`, tables);

    // Find content table (starts with 'b' followed by digits)
    const contentTable = tables.find(t => /^b\d+$/i.test(t)) || tables.find(t => t.toLowerCase().startsWith('b') || t.toLowerCase() === 'book');

    if (!contentTable) {
      throw new Error('Could not find content table in .bok');
    }

    console.log(`[EXTRACT] Using content table: ${contentTable}`);
    const table = reader.getTable(contentTable);
    const rows = table.getData();

    // Fix Windows-1256 encoding - mdb-reader reads as latin1, need to convert
    const iconv = require('iconv-lite');
    const fixEncoding = (text) => {
      if (!text) return '';
      // Convert from the garbled latin1 representation back to proper Arabic
      const buf = Buffer.from(text, 'latin1');
      return iconv.decode(buf, 'win1256');
    };

    // Extract text from 'nass' column with encoding fix
    let fullText = rows.map(r => {
      const rawText = r.nass || r.Nass || '';
      return fixEncoding(rawText);
    }).join('\n\n');

    // Clean up HTML-like tags Shamela uses
    fullText = fullText.replace(/<(.*?)>/g, '');

    // Build TOC from t-table if available
    const tocTableName = contentTable.replace(/^b/i, 't');
    let toc = [];
    let idMap = {};
    if (tables.includes(tocTableName)) {
      try {
        const tocTable = reader.getTable(tocTableName);
        const tocRows = tocTable.getData();
        toc = tocRows.map(r => ({
          id: r.id,
          title: fixEncoding(r.tit || ''),
          level: r.lvl || 1
        }));
        // Build idMap: maps page IDs to row indices
        rows.forEach((r, idx) => {
          if (r.id) idMap[String(r.id)] = idx;
        });
        console.log(`[EXTRACT] Built TOC with ${toc.length} entries`);
      } catch (e) {
        console.log(`[EXTRACT] TOC extraction failed:`, e.message);
      }
    }

    console.log(`[EXTRACT] Extracted ${rows.length} pages, total text length: ${fullText.length}`);

    res.json({
      success: true,
      bookId,
      content: fullText,
      length: fullText.length,
      toc,
      idMap
    });

  } catch (error) {
    console.error(`[EXTRACT_ERROR]`, error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    // Clean up temp files
    try {
      if (fs.existsSync(tempDir)) {
        // fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (e) { }
  }
});

// Routes
app.use('/api/users', usersRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/promotions', promotionsRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/chat-ai', chatAiRoutes);
app.use('/api/quick-actions', quickActionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/book-requests', bookRequestRoutes);
app.use('/api/merchant', merchantRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/bourse', bourseRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/n8n', n8nWorkflowRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/publishers', publisherRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/shipping-settings', shippingSettingRoutes);
app.use('/api/youtube', youtubeVideoRoutes);
app.use('/api/admin/partnership', adminPartnershipRoutes);
app.use('/api/partnership', partnerRoutes);

// Delete print order and associated file
const mongoose = require('mongoose');
// تسجيل مسار طلبات الدفع
app.use('/api/payment-requests', paymentRequestsRoutes);
app.use('/api/mobile-version', versionRoutes); // Register version check route
app.use('/api/mushafs', require('./routes/mushafs.routes'));


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
app.use('/api/asr-review', require('./routes/asr-review.routes')); // ASR Voice Review Routes
app.use('/api/reading-challenges', require('./routes/reading-challenge.routes')); // Reading Challenges Routes
app.use('/api/watin', require('./routes/watin.routes')); // Watin App Routes (Public + Admin)
app.use('/api/admin/watin', require('./routes/watin-admin.routes')); // Watin Admin Routes

// Apply specific rate limiters to sensitive routes
app.use('/api/users/login', authLimiter);
app.use('/api/halaqa/upload-voice', uploadLimiter);
app.use('/api/halaqa/upload-file', uploadLimiter);

// Amazon Integration Routes
app.use('/api/amazon', amazonProductRoutes);
app.use('/api/amazon', amazonDiagnosticsRoutes);
app.use('/api/amazon/accounts', amazonAccountRoutes);
app.use('/api/amazon/oauth', amazonOAuthRoutes);

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// SSR and Static Files Configuration
const distPath = path.join(__dirname, 'dist', 'browser');
if (fs.existsSync(distPath)) {
  console.log(`✅ [App] Serving static files from: ${distPath}`);
  app.use(express.static(distPath, {
    maxAge: '1y',
    index: false
  }));

  // Server-side rendering for Angular
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.url.startsWith('/api/')) return next();
    // Skip file extensions
    if (req.url.includes('.')) return next();

    const indexPath = fs.existsSync(path.join(distPath, 'index.html'))
      ? path.join(distPath, 'index.html')
      : path.join(distPath, 'index.csr.html');
    res.sendFile(indexPath);
  });
} else {
  console.warn(`⚠️ [App] Static files directory not found: ${distPath}`);
}

// Error handler
app.use((err, req, res, next) => {
  console.error('🔥 [App Error Handler]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    await connectDB();
    console.log('✅ [App] Connected to MongoDB');

    // Initialize Amazon queue if config is valid
    if (process.env.AMAZON_CONFIG_VALID === 'true') {
      console.log('🚀 [App] Initializing Amazon Publish Queue...');
      try {
        await PublishAmazonProductJob.initializeQueue();
        console.log('✅ [App] Amazon Publish Queue initialized');
      } catch (queueErr) {
        console.error('❌ [App] Failed to initialize Amazon queue:', queueErr.message);
      }
    }

    // Start cron jobs
    cronJobs.initCronJobs();
    console.log('✅ [App] Cron jobs initialized');

    server.listen(port, () => {
      console.log(`🚀 [App] Server running on port ${port} in ${process.env.NODE_ENV || 'development'} mode`);

      // === Auto-start Python Transcription Services ===
      try {
        const { spawn } = require('child_process');
        const fs = require('fs');

        // Try quran_transcriber (legacy for mushaf-wird)
        const transcriptionDir = path.join(__dirname, '..', 'quran_transcriber');
        const venvPython = path.join(transcriptionDir, 'venv', 'bin', 'python');
        const serverScript = path.join(transcriptionDir, 'server.py');

        if (fs.existsSync(venvPython) && fs.existsSync(serverScript)) {
          console.log('🎙️  [Transcription] Starting Python Transcription API (quran_transcriber)...');
          const pythonProcess = spawn(venvPython, [serverScript], {
            cwd: transcriptionDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false
          });

          pythonProcess.stdout.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) console.log(`🎙️  [Transcription] ${msg}`);
          });

          pythonProcess.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (!msg) return;
            if (msg.includes('INFO:') || msg.includes('Started server') || msg.includes('Application startup')) {
              console.log(`🎙️  [Transcription] ${msg.replace(/^INFO:\s*/, '')}`);
            } else if (!msg.includes('WARNING') && !msg.includes('DeprecationWarning')) {
              console.error(`🎙️  [Transcription-ERR] ${msg}`);
            }
          });

          pythonProcess.on('error', (err) => {
            console.error('🎙️  [Transcription] Failed to start:', err.message);
          });

          pythonProcess.on('exit', (code) => {
            if (code !== null && code !== 0) {
              console.warn(`🎙️  [Transcription] Process exited with code ${code}`);
            }
          });

          const cleanup = () => {
            if (!pythonProcess.killed) {
              console.log('🎙️  [Transcription] Shutting down Python server...');
              pythonProcess.kill('SIGTERM');
            }
          };
          process.on('exit', cleanup);
          process.on('SIGINT', () => { cleanup(); process.exit(0); });
          process.on('SIGTERM', () => { cleanup(); process.exit(0); });
        } else {
          console.log('🎙️  [Transcription] quran_transcriber Python venv or server.py not found. Skipping.');
        }

        // Try watin-transcriber (for watin app)
        const watinDir = path.join(__dirname, '..', 'watin-transcriber');
        const watinVenvPython = path.join(watinDir, 'venv', 'bin', 'python');
        const watinServerScript = path.join(watinDir, 'server.py');

        if (fs.existsSync(watinVenvPython) && fs.existsSync(watinServerScript)) {
          console.log('🎙️  [Watin] Starting Python Transcription API (watin-transcriber)...');
          const watinPythonProcess = spawn(watinVenvPython, [watinServerScript], {
            cwd: watinDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false
          });

          watinPythonProcess.stdout.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) console.log(`🎙️  [Watin] ${msg}`);
          });

          watinPythonProcess.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (!msg) return;
            if (msg.includes('INFO:') || msg.includes('Started server') || msg.includes('Application startup')) {
              console.log(`🎙️  [Watin] ${msg.replace(/^INFO:\s*/, '')}`);
            } else if (!msg.includes('WARNING') && !msg.includes('DeprecationWarning')) {
              console.error(`🎙️  [Watin-ERR] ${msg}`);
            }
          });

          watinPythonProcess.on('error', (err) => {
            console.error('🎙️  [Watin] Failed to start:', err.message);
          });

          watinPythonProcess.on('exit', (code) => {
            if (code !== null && code !== 0) {
              console.warn(`🎙️  [Watin] Process exited with code ${code}`);
            }
          });

          const watinCleanup = () => {
            if (!watinPythonProcess.killed) {
              console.log('🎙️  [Watin] Shutting down Python server...');
              watinPythonProcess.kill('SIGTERM');
            }
          };
          process.on('exit', watinCleanup);
          process.on('SIGINT', () => { watinCleanup(); process.exit(0); });
          process.on('SIGTERM', () => { watinCleanup(); process.exit(0); });
        } else {
          console.log('🎙️  [Watin] watin-transcriber Python venv or server.py not found. Skipping.');
        }
      } catch (err) {
        console.error('🎙️  [Transcription] Auto-start error:', err.message);
      }
    });
  } catch (err) {
    console.error('❌ [App] Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

module.exports = app;
