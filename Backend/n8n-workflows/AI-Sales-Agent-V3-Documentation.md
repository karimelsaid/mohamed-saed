# AI Sales Agent V3 - نظام الرد الذكي على التعليقات والرسائل

## نظرة عامة

AI Sales Agent V3 هو نظام أتمتة ذكي يرد تلقائياً على التعليقات على منصات Facebook و Instagram باستخدام الذكاء الاصطناعي. النظام يحلل نية المستخدم ويولد ردوداً مفيدة ومخصصة لكل تعليق.

## المميزات الرئيسية

### 1. استقبال التعليقات التلقائي
- استقبال التعليقات من Facebook و Instagram عبر Webhook
- تسجيل جميع التعليقات في قاعدة البيانات
- دعم المنصات المتعددة في وقت واحد

### 2. تحليل النية بالذكاء الاصطناعي
- تحليل محتوى التعليق لفهم نية المستخدم
- تحديد نوع الاستفسار (سعر، توفر، شحن، عام)
- استخراج المنتجات المذكورة في التعليق

### 3. توليد الردود الذكية
- توليد ردود عربية مفيدة ومهذبة
- تخصيص الرد بناءً على نوع الاستفسار
- توفير معلومات دقيقة عن المنتجات

### 4. نشر الردود التلقائي
- نشر الردود مباشرة على Facebook و Instagram
- تسجيل جميع الردود المرسلة
- تتبع معدل التحويل والتفاعل

## كيفية العمل

### التدفق الرئيسي

```
1. Webhook Trigger
   ↓
2. استقبال التعليق من Facebook/Instagram
   ↓
3. تسجيل التعليق في قاعدة البيانات
   ↓
4. تحليل المنصة (Facebook أو Instagram)
   ↓
5. توليد الرد باستخدام AI
   ↓
6. نشر الرد على المنصة
   ↓
7. تسجيل الرد في قاعدة البيانات
   ↓
8. إرسال تأكيد
```

## Backend Endpoints

### 1. استقبال التعليق

**Endpoint:** `POST /api/automation/comment-webhook`

**Request Body:**
```json
{
  "platform": "facebook | instagram",
  "comment": "نص التعليق",
  "postId": "معرف المنشور",
  "commentId": "معرف التعليق",
  "userId": "معرف المستخدم",
  "userName": "اسم المستخدم"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Comment received"
}
```

### 2. توليد الرد

**Endpoint:** `POST /api/automation/generate-reply`

**Request Body:**
```json
{
  "comment": "نص التعليق",
  "platform": "facebook | instagram",
  "productId": "معرف المنتج (اختياري)"
}
```

**Response:**
```json
{
  "success": true,
  "reply": "الرد المولد بالذكاء الاصطناعي"
}
```

### 3. نشر الرد

**Endpoint:** `POST /api/automation/post-reply`

**Request Body:**
```json
{
  "platform": "facebook | instagram",
  "commentId": "معرف التعليق",
  "reply": "نص الرد",
  "postId": "معرف المنشور"
}
```

**Response:**
```json
{
  "success": true,
  "replyId": "معرف الرد المنشور"
}
```

## n8n Workflow

### المكونات

1. **Webhook Trigger**
   - يستقبل التعليقات من Facebook/Instagram
   - يمرر البيانات إلى الخطوة التالية

2. **Check Platform**
   - يحدد نوع المنصة (Facebook أو Instagram)
   - يوجه التدفق إلى المسار المناسب

3. **Generate Reply**
   - يستدعي endpoint `/api/automation/generate-reply`
   - يستخدم AI لتوليد رد مناسب

4. **Post Reply**
   - يستدعي endpoint `/api/automation/post-reply`
   - ينشر الرد على المنصة الأصلية

5. **Response**
   - يرسل تأكيد بنجاح العملية
   - يعالج الأخطاء إذا حدثت

### ملف الـ Workflow

الملف موجود في: `Backend/n8n-workflows/ai-sales-agent-v3.json`

## الإعداد والتكوين

### 1. Environment Variables

أضف المتغيرات التالية في ملف `.env`:

```env
FACEBOOK_PAGE_ID=763029760219671
FACEBOOK_PAGE_TOKEN=your_facebook_page_token
```

### 2. استيراد Workflow في n8n

1. افتح n8n dashboard: `https://n8n.knoozbook.com`
2. انقر على "Import from File"
3. اختر ملف `ai-sales-agent-v3.json`
4. احفظ الـ workflow

### 3. إعداد Facebook Webhook

1. افتح Meta Developer Portal
2. انتقل إلى تطبيق Facebook الخاص بك
3. أضف Webhook Product: `Comments`
4. اضبط Webhook URL على: `https://n8n.knoozbook.com/webhook/ai-sales-agent-v3-webhook`
5. تحقق من الـ webhook

### 4. إعداد Instagram Webhook

1. في Meta Developer Portal
2. أضف Instagram Graph API
3. أضف Webhook Product: `Comments`
4. استخدم نفس Webhook URL

## أنواع الردود المدعومة

### 1. الاستفسار عن السعر
```json
{
  "intent": "price",
  "response": "سعر هذا الكتاب هو 50 ريال. يمكنك شراؤه من موقعنا: knoozbook.com"
}
```

### 2. الاستفسار عن التوفر
```json
{
  "intent": "availability",
  "response": "هذا الكتاب متوفر حالياً. يمكننا شحنه إليك خلال 2-3 أيام عمل"
}
```

### 3. الاستفسار عن الشحن
```json
{
  "intent": "shipping",
  "response": "نقدم خدمة الشحن لجميع مناطق المملكة. التوصيل مجاني للطلبات فوق 100 ريال"
}
```

### 4. الاستفسار العام
```json
{
  "intent": "general",
  "response": "شكراً لتواصلك معنا! كيف يمكننا مساعدتك؟"
}
```

## التسجيل والتتبع

### سجلات التعليقات

جميع التعليقات يتم تسجيلها في `AutomationLog` collection:

```javascript
{
  type: 'comment',
  platform: 'facebook | instagram',
  status: 'received',
  message: 'نص التعليق',
  metadata: {
    postId: 'معرف المنشور',
    commentId: 'معرف التعليق',
    userId: 'معرف المستخدم',
    userName: 'اسم المستخدم'
  }
}
```

### سجلات الردود

جميع الردود يتم تسجيلها في `AutomationLog` collection:

```javascript
{
  type: 'comment_reply',
  platform: 'facebook | instagram',
  status: 'success',
  message: 'نص الرد',
  metadata: {
    commentId: 'معرف التعليق',
    postId: 'معرف المنشور',
    replyId: 'معرف الرد'
  }
}
```

## المراقبة والإحصائيات

### لوحة تحكم الأدمن

يمكنك مراقبة أداء النظام من لوحة تحكم الأتمتة:

- عدد التعليقات المستلمة
- عدد الردود المرسلة
- معدل التفاعل
- معدل التحويل
- آخر السجلات

### PM2 Logs

لعرض السجلات الحية:

```bash
pm2 logs kenouz-backend --lines 100
```

## استكشاف الأخطاء

### المشكلة: Webhook لا يستقبل التعليقات

**الحل:**
1. تحقق من أن Webhook URL صحيح
2. تأكد من أن Webhook مفعل في Meta Developer Portal
3. تحقق من سجلات n8n

### المشكلة: AI لا يولد ردود

**الحل:**
1. تحقق من أن AI Orchestrator يعمل
2. تأكد من أن endpoint `/api/automation/generate-reply` يعمل
3. تحقق من سجلات الباكند

### المشكلة: الرد لا يتم نشره

**الحل:**
1. تحقق من Facebook Page Token
2. تأكد من أن الصلاحيات صحيحة
3. تحقق من سجلات Facebook API

## التطوير المستقبلي

### الميزات المخطط لها

1. دعم رسائل Facebook Messenger
2. دعم رسائل Instagram Direct
3. تحليل المشاعر (Sentiment Analysis)
4. ردود مخصصة لكل مستخدم
5. تتبع المحادثات الطويلة
6. تكامل مع نظام CRM

## الدعم

للدعم الفني، تواصل مع فريق التطوير أو راجع:
- وثائق n8n: https://docs.n8n.io
- وثائق Facebook Graph API: https://developers.facebook.com/docs/graph-api
