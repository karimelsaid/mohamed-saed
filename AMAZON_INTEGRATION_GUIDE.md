# دليل تكامل Amazon Egypt - خطوات الاختبار والتشغيل

## نظرة عامة
هذا الدليل يشرح كيفية اختبار وتفعيل تكامل Amazon Egypt مع موقعك باستخدام n8n كطبقة تنسيق.

---

## المتطلبات المسبقة

### 1. حساب SP-API
- [ ] سجّل كـ Developer في Seller Central: `Apps & Services → Develop Apps`
- [ ] اعمل App جديد، خد منه: `Client ID`, `Client Secret`
- [ ] اربط الـ App بحساب البائع بتاعك (Authorize)، خد `Refresh Token`
- [ ] حدد الـ Marketplace ID بتاع مصر
- [ ] جرّب الأول على **SP-API Sandbox** قبل الحساب الحقيقي

### 2. GTIN Exemption (لو منتجاتك من غير براند/باركود)
- [ ] قدّم طلب الإعفاء يدوي من Seller Central لكل (براند + كاتيجوري)
- [ ] استنى الموافقة (48-72 ساعة)
- [ ] سجّل اسم البراند المعتمد بالظبط في مكان تقدر تستخدمه في n8n

### 3. n8n Self-hosted
- [ ] تأكد إن سيرفر n8n عندك URL عام (public)
- [ ] اعمل Credentials جديدة لـ Amazon SP-API
- [ ] اعمل Credential لموقعك (Bearer Token)

---

## إعداد البيئة

### 1. إضافة المتغيرات البيئية
أضف إلى ملف `.env` في الـ backend:

```bash
# n8n Integration
N8N_PRODUCT_WEBHOOK_URL=https://your-n8n-instance.com/webhook/product-new
N8N_SECRET=your-secret-key-here
```

### 2. التحقق من التغييرات في الموديلات
تأكد أن الموديلات التالية تم تعديلها:
- `Product.model.js`: حقول Amazon Integration
- `Order.model.js`: حقول source و amazonOrderId
- `User.model.js`: حقول Amazon Integration في orders subdocument

---

## خطوات الاختبار

### المرحلة 1: اختبار Endpoints الداخلية

#### اختبار endpoint المنتجات المعلقة
```bash
curl -X GET http://localhost:3000/api/products/pending-amazon \
  -H "X-N8N-Secret: your-secret-key-here"
```

**المتوقع:** JSON يحتوي على قائمة المنتجات بـ `amazonListingStatus: pending`

#### اختبار endpoint تحديث الكمية
```bash
curl -X PATCH http://localhost:3000/api/products/:id/quantity \
  -H "Content-Type: application/json" \
  -H "X-N8N-Secret: your-secret-key-here" \
  -d '{"quantity": 10}'
```

**المتوقع:** تحديث `product_quantity` و `lastStockUpdate`

#### اختبار endpoint تحديث حالة Amazon
```bash
curl -X PATCH http://localhost:3000/api/products/:id/amazon-status \
  -H "Content-Type: application/json" \
  -H "X-N8N-Secret: your-secret-key-here" \
  -d '{"amazonListingStatus": "active", "amazonAsin": "B0XXXXX"}'
```

**المتوقع:** تحديث `amazonListingStatus`, `amazonAsin`, `lastSyncedToAmazon`

#### اختبار endpoint استقبال الأوردرات
```bash
curl -X POST http://localhost:3000/api/orders/from-amazon \
  -H "Content-Type: application/json" \
  -H "X-N8N-Secret: your-secret-key-here" \
  -d '{
    "amazonOrderId": "112-1234567-1234567",
    "customerName": "Test Customer",
    "email": "test@example.com",
    "phone": "01234567890",
    "address": "Test Address",
    "products": [
      {
        "product_name": "Test Book",
        "product_quantity": 1
      }
    ],
    "totalAmount": 100,
    "status": "pending",
    "orderDate": "2026-07-11T00:00:00.000Z"
  }'
```

**المتوقع:** إنشاء أوردر جديد في Order collection مع `source: 'amazon'`

---

### المرحلة 2: اختبار Webhook للمنتجات الجديدة

1. **إنشاء منتج جديد في لوحة التحكم**
   - اذهب إلى صفحة إضافة منتج
   - املأ البيانات المطلوبة
   - اضغط "حفظ"

2. **التحقق من logs الـ backend**
   ```bash
   tail -f logs/your-log-file
   ```

**المتوقع:**
- لو `status === 'approved'` و `amazonListingStatus === 'pending'`: 
  - `✅ [Product Webhook] Sent product xxx to n8n successfully`
- لو `N8N_PRODUCT_WEBHOOK_URL` غير معرف:
  - `⚠️ [Product Webhook] N8N_PRODUCT_WEBHOOK_URL not set, skipping webhook`

3. **اختبار حماية التكرار**
   - عدّل المنتج (غيّر السعر أو الوصف)
   - احفظ مرة أخرى

**المتوقع:** لا يظهر log للـ webhook (بسبب `isModified` check)

---

### المرحلة 3: اختبار getAllOrders

1. **جلب الأوردرات من لوحة التحكم**
   - اذهب إلى صفحة إدارة الطلبات
   - راقب عمود "المصدر"

**المتوقع:**
- أوردرات الموقع: تظهر "الموقع" باللون الأزرق
- أوردرات أمازون: تظهر "أمازون" باللون الأخضر
- أوردرات بمشاكل مخزون: تظهر "⚠️ مشكلة مخزون"

2. **اختبار Pagination**
   - راقب console logs للتحذيرات
   - لو الأوردرات > 4500: `⚠️ [getAllOrders] Website orders approaching 5000 limit`

---

### المرحلة 4: اختبار n8n Workflows

#### Workflow 1: رفع المنتجات الجديدة التلقائي
1. **إنشاء Webhook Trigger في n8n**
   - URL: نفس `N8N_PRODUCT_WEBHOOK_URL`
   - Method: POST
   - Authentication: تحقق من `X-N8N-Secret` header

2. **إضافة خطوات الـ workflow**
   - استقبال بيانات المنتج
   - تحويلها لشكل Amazon API
   - إرسال لـ SP-API
   - تحديث حالة المنتج على موقعك

3. **الاختبار**
   - أنشئ منتج جديد في الموقع
   - راقب n8n workflow execution
   - تأكد من تحديث `amazonListingStatus` على الموقع

#### Workflow 2: مزامنة الأوردرات
1. **إنشاء Schedule Trigger أو Webhook**
   - Polling كل 5-10 دقايق
   - أو استقبال من Amazon Notifications

2. **إضافة خطوات الـ workflow**
   - جلب الأوردرات الجديدة من Amazon
   - إرسالها لـ `/api/orders/from-amazon`
   - تحديث كميات المنتجات

3. **الاختبار**
   - أنشئ أوردر تجريبي على Amazon
   - راقب ظهوره في لوحة تحكم الموقع
   - تأكد من تحديث الكميات

---

## قائمة التحقق النهائية (Final Checklist)

### Backend
- [ ] جميع الموديلات محدثة
- [ ] Endpoints الداخلية محمية بـ verifyN8nToken
- [ ] Webhook middleware محمي بـ isModified و amazonSyncInProgress
- [ ] getAllOrders يجمع أوردرات Amazon والموقع
- [ ] Pagination يعمل بشكل صحيح
- [ ] تحذيرات logs تظهر عند الاقتراب من الحدود

### Frontend
- [ ] عمود "المصدر" يظهر في جدول الأوردرات
- [ ] ألوان المصدر صحيحة (أمازون = أخضر، الموقع = أزرق)
- [ ] إشارة مشكلة المخزون تظهر عند الحاجة
- [ ] TypeScript compilation بدون أخطاء

### n8n
- [ ] Workflow رفع المنتجات يعمل
- [ ] Workflow مزامنة الأوردرات يعمل
- [ ] Error triggers مضبطة
- [ ] Rate limits محترمة

### Production
- [ ] المتغيرات البيئية مضبوطة
- [ ] SSL/TLS مفعل على n8n
- [ ] Backup plan موجود
- [ ] Monitoring مضبوط

---

## استكشاف الأخطاء

### Webhook لا يعمل
- تحقق من `N8N_PRODUCT_WEBHOOK_URL` في `.env`
- تحقق من `N8N_SECRET` يتطابق مع n8n
- راقب logs الـ backend لأي أخطاء

### الأوردرات لا تظهر
- تحقق من `source: 'amazon'` في Order collection
- تحقق من أن الأدمن/Staff فقط يرى أوردرات Amazon
- راقب getAllOrders logs

### Pagination لا يعمل
- تحقق من أن `hasPagination` معرف مرة واحدة
- تحقق من أن `$skip` و `$limit` في pipeline تم إزالتها
- راقب logs للتحذيرات

---

## ملاحظات مهمة

1. **الترتيب المنطقي:** ابدأ باختبار Endpoints الداخلية قبل n8n
2. **الاختبار التدريجي:** جرّب على 5-10 منتجات قبل الكتالوج الكامل
3. **المراقبة:** راقب logs باستمرار في الأيام الأولى
4. **الاحتياط:** احتفظ بـ backup قبل التفعيل الكامل

---

## الدعم

لو واجهت أي مشاكل:
1. راقب logs الـ backend و n8n
2. تحقق من المتغيرات البيئية
3. راقب هذا الدليل للخطوات المفقودة
