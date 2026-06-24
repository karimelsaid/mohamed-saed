# 🚀 Quick Start Guide - KnoozBook AI Revenue Engine

## خطوات البدء السريع

### 1️⃣ إعداد Environment Variables

```bash
cd Backend
cp .env.example .env
# قم بتحديث .env بالقيم الصحيحة
```

**المتغيرات المطلوبة:**
- `N8N_API_KEY`: احصل عليه من n8n.knoozbook.com → Settings → API
- `META_ACCESS_TOKEN`: من Facebook Developer Console
- `OPENAI_API_KEY`: من platform.openai.com
- `WHATSAPP_NUMBER`: رقم واتساب الأعمال

### 2️⃣ استيراد Workflows إلى n8n

**الطريقة الأولى: باستخدام Script (موصى به)**

```bash
cd Backend
N8N_API_KEY=your_key_here node scripts/import-n8n-workflows.js
```

**الطريقة الثانية: يدوياً من n8n UI**

1. افتح https://n8n.knoozbook.com
2. اذهب إلى Workflows
3. انقر "Import from File"
4. اختر الملفات من `Backend/n8n-workflows/`:
   - `social-media-automation.json`
   - `ai-sales-agent.json`
   - `event-tracking-system.json`
5. قم بتفعيل (Activate) كل workflow

### 3️⃣ إعداد Credentials في n8n

من n8n UI → Credentials:

**Facebook API:**
- Name: Facebook API
- Type: Facebook Graph API
- Access Token: من Meta Developer Console

**Instagram API:**
- Name: Instagram API
- Type: Instagram Graph API
- Business Account ID: من Meta Business Suite

**OpenAI API:**
- Name: OpenAI API
- Type: OpenAI
- API Key: من platform.openai.com

**HTTP Header Auth:**
- Name: Backend API
- Type: HTTP Header Auth
- Header Name: Authorization
- Header Value: Bearer your_backend_token

### 4️⃣ تشغيل Backend

```bash
cd Backend
npm install
npm start
```

### 5️⃣ تكوين الإعدادات من لوحة الأدمن

1. افتح https://knoozbook.com/admin/automation
2. أدخل n8n API Key
3. فعّل النشر التلقائي (Auto Post)
4. حدد نموذج AI (GPT-4o-mini موصى به)
5. احفظ الإعدادات

### 6️⃣ اختبار النظام

**اختبار Social Media Automation:**
```bash
curl -X POST https://n8n.knoozbook.com/webhook/auto-post \
  -H "Content-Type: application/json" \
  -d '{
    "action": "product_added",
    "products_id": "12345",
    "name": "كتاب تجريبي",
    "category": "روايات",
    "price": 150,
    "image": "https://example.com/image.jpg",
    "description": "وصف الكتاب",
    "link": "https://knoozbook.com/book/12345"
  }'
```

**اختبار AI Sales Agent:**
```bash
curl -X POST https://knoozbook.com/api/automation/ai-analyze \
  -H "Content-Type: application/json" \
  -d '{
    "message": "عايز اشتري كتاب روايات",
    "platform": "facebook",
    "userId": "user123"
  }'
```

**اختبار Event Tracking:**
```bash
curl -X POST https://n8n.knoozbook.com/webhook/track-event \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "impression",
    "productId": "507f1f77bcf86cd799439011",
    "userId": "user123",
    "sessionId": "session456",
    "metadata": {
      "source": "facebook",
      "device": "mobile"
    }
  }'
```

## 📊 مراقبة النظام

### من لوحة الأدمن
- إحصائيات المنشورات التلقائية
- سجلات التنفيذ (Execution Logs)
- حالة الـ Workflows
- معدل التفاعل

### من n8n Dashboard
- Executions: عرض جميع التنفيذات
- Workflows: إدارة الـ workflows
- Credentials: إدارة المفاتيح

## ⚠️ استكشاف الأخطاء

### Webhook لا يعمل
```bash
# تحقق من أن n8n يعمل
curl -k https://n8n.knoozbook.com/healthz

# تحقق من webhook URL
# يجب أن يكون: https://n8n.knoozbook.com/webhook/xxx
```

### AI responses بطيئة
- استخدم GPT-4o-mini بدلاً من GPT-4
- فعّل caching في n8n
- قلل max tokens

### MongoDB connection timeout
- تحقق من IP whitelist في MongoDB Atlas
- تأكد من connection string صحيح
- زيادة timeout في Mongoose config

## 📞 الدعم

- **الوثائق الكاملة:** `Backend/n8n-workflows/README.md`
- **n8n Dashboard:** https://n8n.knoozbook.com
- **Backend API:** https://knoozbook.com/api
- **Admin Panel:** https://knoozbook.com/admin/automation

---

**ملاحظة هامة:** قبل تشغيل النظام في Production، تأكد من:
1. ✅ إضافة authentication لجميع API endpoints
2. ✅ تشفير API Keys في MongoDB
3. ✅ تفعيل HTTPS
4. ✅ إعداد rate limiting
5. ✅ اختبار جميع workflows
