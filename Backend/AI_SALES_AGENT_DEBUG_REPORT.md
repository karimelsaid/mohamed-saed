# AI Sales Agent - تقرير التصحيح والإعدادات

## 📋 ملخص ما تم إنجازه

### ✅ المكونات التي تم إنشاؤها:

1. **BookSearchService** - خدمة البحث عن الكتب من MongoDB
   - البحث في العنوان، الوصف، المؤلف، الناشر
   - دعم الفلترة حسب التصنيف والسعر
   - دعم البحث العربي (توحيد الألف، الهاء، إزالة التشكيل)

2. **IntentAnalysisService** - خدمة تحليل نية العميل
   - استخراج الكلمات المفتاحية
   - تحديد نوع الطلب (بحث كتاب، استفسار عام، توفر، إلخ)
   - استخراج المعايير (التصنيف، السعر، المؤلف)

3. **MongoDB Schemas**
   - Conversation Schema (للمحادثات)
   - ChatMessage Schema (للرسائل)

4. **ConversationManagementService** - خدمة إدارة المحادثات
   - إنشاء محادثات جديدة
   - إضافة رسائل
   - استرجاع المحادثات

5. **Sales Prompts في PromptManager**
   - sales_chat (للمحادثات المبيعات)
   - book_recommendation (للتوصيات)
   - sales_follow_up (للمتابعة)

6. **تحديث chat-ai.controller.js**
   - استخدام AI Orchestrator بدلاً من OpenRouter المباشر
   - دعم Conversation ID
   - Intent Analysis
   - Book Search

7. **تحديث Angular Frontend**
   - ChatAiService: دعم Conversation ID
   - chat-window.component: إرسال واستقبال Conversation ID

8. **AI Config Updates**
   - إعداد fallback system بين Gemini و OpenRouter
   - إصلاح pricing في OpenAI provider
   - إضافة sales_chat task

---

## 🐛 المشكلة الحالية

### الخطأ:
```
[OpenAIProvider] generateText Error: Request failed with status code 402
Error: This request requires more credits, or fewer max_tokens. 
You requested up to 1000 tokens, but can only afford 951.
```

### التحليل:

1. **الموديل الحالي**: `openrouter/free`
2. **maxTokens**: 1000
3. **الخطأ**: OpenRouter يرفض الطلب بسبب عدم كفاية الرصيد

### لماذا يحدث هذا؟

حتى الموديلات المجانية في OpenRouter تتطلب رصيداً في الحساب. حسابك الحالي يحتوي على رصيد يسمح فقط بـ 951 tokens، بينما الطلب يحتاج 1000 tokens.

### المحاولات السابقة:

1. ✅ `openai/gpt-4o-mini` - فشل (402 - credits)
2. ✅ `nvidia/nemotron-3-ultra-550b-a55b:free` - فشل (402 - credits)
3. ✅ `openrouter/free` - فشل (402 - credits)
4. ✅ تقليل maxTokens إلى 500 - فشل (402 - credits)
5. ✅ تقليل maxTokens إلى 400 - فشل (402 - credits)

### المشكلة الجذرية:

حساب OpenRouter الحالي لا يملك رصيداً كافياً لأي موديل، حتى المجانية.

---

## 💡 الحلول المقترحة

### الحل 1: إضافة رصيد إلى OpenRouter
- زيادة الرصيد في حساب OpenRouter
- الترقية إلى حساب مدفوع

### الحل 2: استخدام Gemini فقط (مجاني)
- تعطيل OpenRouter في fallback
- استخدام Gemini فقط (مجاني من Google)
- المشكلة: Gemini قد يصل لـ rate limit

### الحل 3: استخدام موديل مجاني آخر
- البحث عن موديلات مجانية أخرى في OpenRouter
- التأكد من أنها لا تتطلب رصيداً

### الحل 4: تقليل maxTokens بشكل كبير
- تقليل maxTokens إلى 200 أو أقل
- المشكلة: الردود ستكون قصيرة جداً

---

## 🔧 الإعدادات الحالية

### AI Config (ai.config.js):
```javascript
sales_chat: {
  provider: 'openai',
  model: 'openrouter/free',
  temperature: 0.7,
  maxTokens: 1000,
  timeout: 30000
}
```

### Fallback Config:
```javascript
fallback: {
  enabled: true,
  fallbackProviders: ['openai', 'gemini'],
  fallbackThreshold: 1
}
```

### OpenAI Provider Config:
```javascript
openai: {
  enabled: true,
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  defaultModel: 'openai/gpt-4o-mini',
  timeout: 30000,
  priority: 2
}
```

---

## 📊 حالة الاختبار

### النتائج:
- ✅ Intent Analysis يعمل بشكل صحيح
- ✅ Book Search يعمل (تم العثور على "أمة الدوبامين" في MongoDB)
- ✅ البحث العربي مُصلح (يدعم توحيد الألف)
- ❌ AI Orchestrator يفشل بسبب مشكلة OpenRouter credits
- ❌ Fallback system يفشل لأن Gemini أيضاً يصل لـ rate limit

### مثال على Intent Analysis:
```json
{
  "intent": "search_book",
  "keywords": ["محتاج", "كتاب", "امة", "الدوبامين"],
  "category": null,
  "minPrice": null,
  "maxPrice": null,
  "author": null,
  "confidence": 0.6
}
```

### مثال على Book Search:
```
✅ Book found in MongoDB:
- Name: امة الدوبامين
- Status: approved
- Quantity: 2
- Category: تطوير الذات وعلم النفس
```

---

## 🎯 التوصية

**الأنسب حالياً**: استخدام Gemini فقط كمزود أساسي وتعطيل OpenRouter مؤقتاً حتى يتم حل مشكلة الرصيد.

### الخطوات:
1. تغيير provider في sales_chat إلى 'gemini'
2. تعطيل openai provider في config
3. إزالة OpenRouter من fallbackProviders

### البديل:
إضافة رصيد إلى حساب OpenRouter واستخدام الموديلات المجانية.
