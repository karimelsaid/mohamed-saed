# KnoozBook AI Revenue Engine - System Documentation

## 📋 نظرة عامة

نظام AI Revenue Engine هو نظام مبيعات ذكي كامل يعتمد على AI + n8n + MongoDB لتحويل موقع KnoozBook من مجرد نظام أتمتة إلى محرك مبيعات تلقائي ذكي.

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Angular)                      │
│                    - Product Pages                              │
│                    - Admin Dashboard                            │
│                    - User Interface                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP/REST API
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    Backend (Node.js + Express)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  API Endpoints:                                          │  │
│  │  - /api/automation/* (Automation Control)                │  │
│  │  - /api/n8n/* (Workflow Management)                      │  │
│  │  - /api/analytics/* (Event Tracking)                     │  │
│  │  - /api/products/* (Product Data)                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Controllers:                                            │  │
│  │  - automation.controller.js                              │  │
│  │  - n8n-workflow.controller.js                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Mongoose ODM
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    MongoDB Database                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Collections:                                             │  │
│  │  - products (Product data)                                │  │
│  │  - automationlogs (Event tracking)                       │  │
│  │  - automationsettings (System config)                    │  │
│  │  - orders (Sales data)                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Webhooks + API
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    n8n Automation Platform                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Workflows:                                               │  │
│  │  1. Social Media Automation                              │  │
│  │     - Auto-post products to Facebook/Instagram            │  │
│  │     - Schedule random posts                              │  │
│  │     - Analyze engagement                                 │  │
│  │                                                           │  │
│  │  2. AI Sales Agent                                       │  │
│  │     - Receive comments/DMs from social media             │  │
│  │     - Analyze user intent (AI)                           │  │
│  │     - Recommend books from MongoDB                      │  │
│  │     - Auto-reply in Egyptian Arabic                      │  │
│  │     - Convert serious buyers to WhatsApp                  │  │
│  │                                                           │  │
│  │  3. Event Tracking System                                │  │
│  │     - Track impressions, clicks, comments               │  │
│  │     - Track purchases                                    │  │
│  │     - Aggregate metrics                                  │  │
│  │     - Trigger auto-promotion for high engagement         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ API Integration
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    External Services                             │
│  - Facebook Graph API (Social Media)                          │
│  - Instagram Graph API (Social Media)                         │
│  - OpenAI API (GPT-4o-mini for AI responses)                  │
│  - WhatsApp Business API (Lead conversion)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔌 API Endpoints

### Automation API (`/api/automation`)

#### Dashboard & Settings
- `GET /api/automation/dashboard` - Get dashboard data and settings
- `PATCH /api/automation/settings` - Update automation settings
- `GET /api/automation/logs` - Get automation logs

#### n8n Bridge
- `POST /api/automation/log` - Receive logs from n8n
- `GET /api/automation/random-product` - Get random product for posting

#### AI Sales Agent
- `POST /api/automation/ai-analyze` - Analyze user message intent
- `GET /api/automation/recommend-books?category=X&limit=3` - Get book recommendations

#### Event Tracking
- `POST /api/automation/track` - Track events (impressions, clicks, etc.)
- `POST /api/automation/aggregate` - Aggregate analytics metrics
- `POST /api/automation/trigger-promotion` - Trigger auto-promotion

#### Advanced
- `POST /api/automation/claude/execute` - Execute Claude AI commands
- `GET /api/automation/n8n/stats` - Get n8n statistics
- `POST /api/automation/deploy` - Deploy to production

### n8n Workflow Management API (`/api/n8n`)

- `GET /api/n8n/workflows` - Get all workflows
- `GET /api/n8n/workflows/:id` - Get specific workflow
- `POST /api/n8n/workflows` - Create new workflow
- `PATCH /api/n8n/workflows/:id` - Update workflow
- `PATCH /api/n8n/workflows/:id/toggle` - Activate/Deactivate workflow
- `DELETE /api/n8n/workflows/:id` - Delete workflow
- `GET /api/n8n/workflows/:id/executions` - Get workflow execution logs
- `POST /api/n8n/workflows/import` - Import preset workflow
- `POST /api/n8n/workflows/:id/execute` - Execute workflow manually

---

## 📁 n8n Workflows

### 1. Social Media Automation Workflow

**الموقع:** `Backend/n8n-workflows/social-media-automation.json`

**الوظيفة:**
- استقبال webhook عند إضافة منتج جديد
- نشر المنتج تلقائياً على Facebook و Instagram
- تسجيل النتيجة في MongoDB
- إرجاع تأكيد للنظام

**الخطوات:**
1. Webhook Trigger (POST /auto-post)
2. Fetch Product Details from Backend API
3. Post to Facebook
4. Post to Instagram
5. Log Success to Backend
6. Return Response

**الـ Webhook URL:** `https://n8n.knoozbook.com/webhook/auto-post`

---

### 2. AI Sales Agent Workflow

**الموقع:** `Backend/n8n-workflows/ai-sales-agent.json`

**الوظيفة:**
- استقبال التعليقات والرسائل من Facebook/Instagram
- تحليل نية العميل باستخدام AI
- جلب التوصيات من MongoDB
- توليد رود باللهجة المصرية
- تحويل العملاء الجادين إلى WhatsApp

**الخطوات:**
1. Webhook Trigger (POST /sales-agent)
2. Fetch Comment/DM Details
3. AI Intent Analysis (Backend API)
4. Fetch Book Recommendations
5. Generate AI Response (OpenAI GPT-4o-mini)
6. Reply to Comment/DM
7. Check if Serious Buyer
8. Log Interaction
9. Return Response

**الـ Webhook URL:** `https://n8n.knoozbook.com/webhook/sales-agent`

---

### 3. Event Tracking System Workflow

**الموقع:** `Backend/n8n-workflows/event-tracking-system.json`

**الوظيفة:**
- تسجيل جميع الأحداث (impressions, clicks, comments, purchases)
- تجميع المقاييس بشكل دوري
- تشغيل الترويج التلقائي للمنتجات ذات التفاعل العالي

**الخطوات:**
1. Webhook Trigger (POST /track-event)
2. Classify Event Type (Switch)
3. Track Event to MongoDB (based on type)
4. Aggregate Metrics
5. Check High Engagement
6. Trigger Auto Promotion (if high engagement)
7. Return Response

**الـ Webhook URL:** `https://n8n.knoozbook.com/webhook/track-event`

---

## 🔧 Configuration

### Environment Variables

في ملف `Backend/.env`:

```env
# Backend URL for n8n webhooks
BACKEND_URL=https://knoozbook.com

# n8n Configuration
N8N_API_URL=https://n8n.knoozbook.com
N8N_API_KEY=your_n8n_api_key_here

# Social Media
META_PAGE_ID=your_facebook_page_id
INSTAGRAM_BUSINESS_ID=your_instagram_id

# AI Services
OPENAI_API_KEY=your_openai_api_key
WHATSAPP_NUMBER=201xxxxxxxxx

# MongoDB
MONGO_URI=mongodb+srv://...
```

### Automation Settings (MongoDB)

في collection `automationsettings`:

```json
{
  "autoPostEnabled": true,
  "randomPostEnabled": false,
  "dailyPostLimit": 5,
  "postTiming": "0 */6 * * *",
  "aiModel": "gpt-4o-mini",
  "n8nWebhookUrls": {
    "autoPost": "https://n8n.knoozbook.com/webhook/auto-post",
    "commentReply": "https://n8n.knoozbook.com/webhook/sales-agent",
    "messageReply": "https://n8n.knoozbook.com/webhook/sales-agent"
  },
  "metaConfig": {
    "pageId": "your_page_id",
    "instagramId": "your_instagram_id"
  },
  "n8nConfig": {
    "apiUrl": "https://n8n.knoozbook.com",
    "apiKey": "your_n8n_api_key",
    "syncEnabled": true
  }
}
```

---

## 🚀 خطوات التشغيل (Deployment Guide)

### 1. إعداد n8n Instance

```bash
# تثبيت n8n
npm install -g n8n

# تشغيل n8n
n8n start
```

### 2. استيراد Workflows

من لوحة تحكم n8n:
1. اذهب إلى Workflows
2. انقر على "Import from File"
3. اختر ملفات JSON من المجلد `Backend/n8n-workflows/`
4. قم بتفعيل كل workflow

### 3. إعداد Credentials في n8n

- **Facebook API**: Page Access Token
- **Instagram API**: Business Account
- **OpenAI API**: API Key
- **HTTP Header Auth**: للاتصال بـ Backend API

### 4. تكوين Backend

```bash
cd Backend
npm install
cp .env.example .env
# تحديث .env بالقيم الصحيحة
npm start
```

### 5. اختبار النظام

```bash
# اختبار webhook للنشر التلقائي
curl -X POST https://n8n.knoozbook.com/webhook/auto-post \
  -H "Content-Type: application/json" \
  -d '{"action":"product_added","name":"Test Book"}'

# اختبار API للتحليل
curl -X POST https://knoozbook.com/api/automation/ai-analyze \
  -H "Content-Type: application/json" \
  -d '{"message":"عايز اشتري كتاب روايات","platform":"facebook"}'
```

---

## 🔒 الأمان (Security)

### 1. حماية API Endpoints

أضف authentication middleware للـ routes الحساسة:

```javascript
// في routes/automation.routes.js
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

router.get('/dashboard', verifyToken, isAdmin, automationController.getDashboardData);
router.patch('/settings', verifyToken, isAdmin, automationController.updateSettings);
```

### 2. تشفير API Keys

استخدم تشفير للـ API Keys المخزنة في MongoDB:

```javascript
const crypto = require('crypto');

function encrypt(text) {
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}
```

### 3. Rate Limiting

مفعّل بالفعل في `app.js`:
- General limiter: 100 requests per 15 minutes
- Auth limiter: 5 requests per 15 minutes
- Upload limiter: 3 requests per minute

### 4. CORS Configuration

مفعل في `app.js` مع whitelist للـ origins المسموح بها.

---

## ⚡ تحسين الأداء (Performance Optimization)

### 1. تقليل تكلفة AI

- استخدام GPT-4o-mini بدلاً من GPT-4
- تفعيل caching للردود المتكررة
- استخدام intent classification بسيط قبل AI

### 2. تقليل Latency

- استخدام MongoDB indexes للـ queries الشائعة
- تفعيل connection pooling
- استخدام Redis caching للبيانات المتكررة

### 3. تحسين Conversion Rate

- A/B testing للرسائل التلقائية
- تحليل البيانات لتحسين التوصيات
- تتبع customer journey بالكامل

---

## 📊 Data Rules

### 1. ممنوع اختلاق البيانات

- AI يجب أن يعتمد فقط على البيانات الحقيقية من MongoDB
- لا إنشاء منتجات وهمية
- كل عملية بيع يجب تسجيلها كـ event حقيقي

### 2. التحقق من البيانات

```javascript
// مثال للتحقق من وجود المنتج قبل التوصية به
const product = await Product.findById(productId);
if (!product || product.status !== 'approved') {
  throw new Error('Product not found or not approved');
}
```

### 3. تسجيل جميع الأحداث

كل event يتم تسجيله في `automationlogs` collection:
- impressions
- clicks
- comments
- purchases
- errors

---

## 🛠️ Troubleshooting

### المشكلة: Webhooks لا تعمل

**الحل:**
1. تحقق من أن n8n يعمل على https
2. تأكد من أن webhook URL صحيح
3. تحقق من logs في n8n

### المشكلة: AI responses بطيئة

**الحل:**
1. استخدم GPT-4o-mini بدلاً من GPT-4
2. فعّل caching للردود المتكررة
3. قلل max tokens في الـ prompt

### المشكلة: MongoDB connection timeout

**الحل:**
1. تحقق من connection string
2. تأكد من IP whitelist في MongoDB Atlas
3. زيادة connection timeout في Mongoose

---

## 📈 Monitoring & Analytics

### Key Metrics to Track

1. **Conversion Rate**: (Purchases / Visitors) * 100
2. **Engagement Rate**: (Likes + Comments) / Impressions
3. **AI Response Time**: Average time for AI replies
4. **Workflow Success Rate**: Successful executions / Total executions

### Dashboard Metrics

متاحة في صفحة الأدمن:
- عدد المنشورات التلقائية
- عدد الردود التلقائية
- معدل التفاعل
- الوقت الموفر

---

## 🔄 Future Enhancements

1. **Multi-language Support**: دعم لغات إضافية
2. **Advanced AI Models**: استخدام Claude Haiku للـ cost optimization
3. **Predictive Analytics**: التنبؤ بالمنتجات الأكثر مبيعاً
4. **A/B Testing Platform**: اختبار رسائل مختلفة
5. **WhatsApp Integration**: ربط كامل مع WhatsApp Business API

---

## 📞 Support

للدعم الفني:
- Email: support@knoozbook.com
- n8n Dashboard: https://n8n.knoozbook.com
- Backend API: https://knoozbook.com/api

---

**آخر تحديث:** يونيو 2026
**الإصدار:** 1.0.0
