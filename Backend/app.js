require('./loadEnv');

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { connectDB } = require('./config/database');
const { updateBooksData } = require('./controllers/books.controller');
const sitemapService = require('./services/sitemap.service'); // Added import for sitemap service

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
const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Middlewares
app.use(bodyParser.json());

app.use('/api/print', printRoutes);

// إضافة رؤوس Cross-Origin-Opener-Policy و Cross-Origin-Embedder-Policy
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// إعداد CORS للسماح بالمصادر المناسبة
const allowedOrigins = ['https://knoozbook.com', 'https://www.knoozbook.com'];
if (!isProduction) {
  allowedOrigins.push('http://localhost:4200');
}
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Session middleware
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Middleware to handle referral code
app.use((req, res, next) => {
  if (req.query.ref) {
    req.session.referrerCode = req.query.ref;
  }
  next();
});




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

const uploadsAbsolutePath = require('path').resolve(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsAbsolutePath));

// الاتصال بقاعدة البيانات
connectDB().catch(err => {
  console.error('❌ فشل في الاتصال بقاعدة البيانات:', err);
  process.exit(1);
});

// تسجيل المسارات
app.use('/api/users', usersRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payment', paymentRoutes); // تعديل المسار ليكون أكثر تحديداً

app.use('/api/chat-ai', chatAiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/merchant', merchantRoutes);

// Delete print order and associated file
const mongoose = require('mongoose');
// تسجيل مسار طلبات الدفع
app.use('/api/payment-requests', paymentRequestsRoutes);

const User = require('./models/User.model');
const { ObjectId } = mongoose.Types;

// Directly define the print order deletion route here to ensure it's correct
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
updateBooksData().catch(console.error);

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

    const robotsPath = path.join(__dirname, 'dist/browser/robots.txt');
    const dir = path.dirname(robotsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(robotsPath, content);
    console.log('✅ تم إنشاء ملف robots.txt بنجاح مع روابط ثابتة وكتب');
  } catch (error) {
    console.error('❌ فشل في إنشاء robots.txt:', error.message);
  }
}

// في بيئة SSR، لم نعد بحاجة لتقديم ملفات Angular الثابتة أو مسار catch-all من هنا.
// سيقوم خادم SSR (server.ts) بهذه المهمة.
// app.use(express.static(path.join(__dirname, 'dist/browser')));
// app.get('*', (req, res, next) => {
//   if (req.path.startsWith('/uploads/')) {
//     return next();
//   }
//   res.sendFile(path.join(__dirname, 'dist/browser/index.html'));
// });

// بدء السيرفر

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 الخادم يعمل على http://0.0.0.0:${port}`);
});

module.exports = {
  app
};
