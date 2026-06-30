# AI Sales Agent - نظام المبيعات الذكي

## نظرة عامة

تم تحويل AI Sales Agent من مجرد محرك بحث إلى **موظف مبيعات محترف** يركز على زيادة معدل شراء الكتب من خلال فهم احتياجات العميل، تقديم توصيات ذكية، وتشجيع اتخاذ قرار الشراء.

---

## الميزات الرئيسية

### 1. **Follow-up Intent Resolver** - حل نية المتابعة
**الملف:** `Backend/services/followup-intent-resolver.service.js`

**الوظيفة:**
- التحقق من الرسائل القصيرة (غيرهم، كمان، أكثر، طيب، أوكي)
- اعتبارها امتداداً لآخر Intent بدلاً من بدء نية جديدة
- توسيع الرسالة بناءً على السياق السابق
- الحفاظ على سياق المحادثة

**الكلمات المدعومة:**
- متابعة: غيرهم، غيرها، غير، كمان، أكثر، طيب، تمام، أوكي، غير ذلك
- تأكيد: أيوة، نعم، صح، كده، تمام، زين، حلو
- نفي: لا، لأ، مش، أبداً

**أنواع المتابعة:**
- `alternatives`: طلب بدائل
- `more`: طلب المزيد
- `confirmation`: تأكيد
- `negation`: نفي

---

### 2. **Book Exclusion Tracker** - تتبع الكتب المستبعدة
**الملف:** `Backend/services/book-exclusion-tracker.service.js`

**الوظيفة:**
- تتبع الكتب المقترحة لكل محادثة
- استبعادها من البحث المستقبلي
- دعم حتى 50 كتاب مستبعد لكل محادثة
- منع تكرار اقتراح نفس الكتب

**الطرق الرئيسية:**
- `addExclusion(conversationId, bookId)`: إضافة كتاب لقائمة الاستبعاد
- `addExclusions(conversationId, bookIds)`: إضافة عدة كتب
- `getExclusions(conversationId)`: الحصول على الكتب المستبعدة
- `isExcluded(conversationId, bookId)`: التحقق من استبعاد كتاب
- `filterExcludedBooks(conversationId, books)`: تصفية مصفوفة كتب
- `clearExclusions(conversationId)`: مسح قائمة الاستبعاد

---

### 3. **Response Sanitizer** - تنظيف الردود
**الملف:** `Backend/services/response-sanitizer.service.js`

**الوظيفة:**
- إزالة Placeholders و Tokens الداخلية
- إزالة JSON fragments و Markdown غير المقصود
- إزالة كلمات بلغات غير عربية/إنجليزية
- إزالة جمل غير مكتملة
- تنظيف الفراغات الزائدة
- التحقق من جودة اللغة العربية
- إعادة التوليد تلقائياً إذا فشل التنظيف

**الأنماط المزالة:**
- `BOOK:xxx` (مكتمل أو مكسور)
- `PRODUCT:xxx`
- `ID:xxx`
- JSON fragments `{...}`
- Code blocks ```...```
- كلمات صينية، فيتنامية، كورية، يابانية

**التحقق من الجودة:**
- نسبة المحتوى العربي (>30%)
- طول الجمل (أقل من 3 حروف)
- تكرار الكلمات (أكثر من 3 مرات)

---

### 4. **Intent Expansion Service** - توسيع النية
**الملف:** `Backend/services/intent-expansion.service.js`

**الوظيفة:**
- توسيع نية المستخدم باستخدام Knowledge Map
- حساب درجة الصلة للكتب (Relevance Score)
- ترتيب الكتب حسب الصلة
- توليد أسباب التوصية
- توليد رسائل عند عدم وجود تطابق

**الطرق الرئيسية:**
- `expandIntent(intent)`: توسيع النية
- `detectAndExpand(message)`: اكتشاف وتوسيع النية
- `calculateRelevanceScore(book, expandedIntent)`: حساب درجة الصلة
- `rankBooksByRelevance(books, expandedIntent)`: ترتيب الكتب
- `getRecommendationReason(book, expandedIntent)`: سبب التوصية
- `getNoMatchMessage(intent, category)`: رسالة عدم التطابق

---

### 5. **Knowledge Map Service** - خريطة المعرفة
**الملف:** `Backend/services/knowledge-map.service.js`

**الوظيفة:**
- ربط اهتمامات العملاء بالتصنيفات والكلمات المفتاحية
- دعم التصنيفات والكلمات المفتاحية والنيات المرتبطة
- البحث عن التصنيفات والكلمات المفتاحية
- توسيع النية بناءً على المعرفة

**التصنيفات المدعومة:**
- تطوير الذات، النجاح، القيادة، الأعمال
- علم النفس، الصحة النفسية، الثقة بالنفس
- الرومانسية، الرعب، التاريخ، الدين
- البرمجة، التسويق، الاستثمار، الإنتاجية

---

### 6. **Recommendation Diversity** - تنويع التوصيات
**الملف:** `Backend/services/book-search.service.js`

**الوظيفة:** `applyRecommendationDiversity()`

**معايير التنويع:**
- مؤلفين مختلفين
- دور نشر مختلفة
- نطاقات أسعار مختلفة (منخفض/متوسط/عالي)

**النطاقات السعرية:**
- منخفض: < 50 جنيه
- متوسط: 50-100 جنيه
- عالي: > 100 جنيه

---

### 7. **General Questions Inference** - استنتاج النية من الأسئلة العامة
**الملف:** `Backend/services/intent-analysis.service.js`

**الوظيفة:** `inferIntentFromGeneralQuestions()`

**الأنماط المدعومة:**

| السؤال | النية المستنتجة | التصنيفات |
|--------|------------------|------------|
| "عايز كتاب يغير حياتي" | success | تطوير الذات، النجاح، القيادة |
| "أريد تحسين حالتي النفسية" | psychology | علم النفس، الصحة النفسية |
| "أتعلم التجارة" | business | الأعمال، ريادة الأعمال |
| "أكون غني" | money | الاستثمار، المال، الاقتصاد |
| "أتعلم التسويق" | marketing | التسويق، الأعمال |
| "قيادة فريق" | leadership | القيادة، الإدارة |
| "إدارة وقت" | productivity | الإنتاجية، إدارة الوقت |
| "ثقة بالنفس" | psychology | علم النفس، تطوير الذات |
| "رومانسية" | romance | رومانسية، دراما |
| "رعب" | horror | رعب، غموض، تشويق |
| "تاريخ" | history | تاريخ، حضارات |
| "برمجة" | programming | برمجة، حاسوب، تقنية |

---

### 8. **Relevance Score** - درجة الصلة
**الملف:** `Backend/services/book-search.service.js`

**الحد الأدنى:** 70%

**الوظيفة:**
- تصفية الكتب بدرجة صلة أقل من 70%
- عرض تحذير إذا كانت النتائج منخفضة الصلة
- استخدام الكتب القريبة كبدائل

**الحساب:**
- تطابق التصنيف: 40%
- تطابق الكلمات المفتاحية: 30%
- تطابق العنوان: 20%
- تطابق المؤلف: 10%

---

### 9. **Sales Closing Statements** - عبارات إنهاء البيع
**الملف:** `Backend/ai/services/prompt-manager.service.js`

**أمثلة العبارات:**
- "إذا كنت محتار فأنا أنصحك أن تبدأ بهذا الكتاب لأنه الأقرب لما تبحث عنه"
- "إذا أخبرتني ما الذي تحب قراءته أكثر، سأرشح لك كتاباً يناسبك بنسبة أكبر"
- "هذا الكتاب من أفضل الكتب في هذا التصنيف"

---

### 10. **Concise & Direct Responses** - ردود مختصرة ومباشرة
**الملف:** `Backend/ai/services/prompt-manager.service.js`

**القواعد:**
- لا مقدمات طويلة (لا تقل "مرحباً" أو "يسعدني مساعدتك")
- ابدأ مباشرة بالتوصيات
- كن مختصراً ومفيداً
- استخدم اللهجة المصرية المهذبة والطبيعية

---

### 11. **Arabic Language Quality** - جودة اللغة العربية
**الملف:** `Backend/ai/services/prompt-manager.service.js`

**القواعد:**
- اللهجة المصرية المهذبة والطبيعية
- بدون ترجمة حرفية
- بدون خلط عربي مع لغات أخرى
- بدون تكرار الجمل
- بدون كلمات غريبة أو غير مفهومة

---

## سير العمل (Workflow)

### 1. استلام الرسالة
```
العميل: "رشح لي كتاب يغير حياتي"
```

### 2. التحقق من المتابعة
```
FollowupIntentResolver.analyzeWithFollowup()
- هل الرسالة قصيرة؟
- هل تحتوي على كلمات متابعة؟
- هل هناك نية سابقة؟
```

### 3. تحليل النية
```
IntentAnalysisService.analyzeIntent()
- استنتاج النية من السؤال العام
- توسيع النية باستخدام Intent Expansion
- تحديد التصنيفات والكلمات المفتاحية
```

### 4. البحث عن الكتب
```
BookSearchService.searchBooks()
- استبعاد الكتب السابقة (BookExclusionTracker)
- البحث باستخدام Intent Expansion
- حساب Relevance Score
- تصفية الكتب < 70%
- تطبيق Recommendation Diversity
```

### 5. توليد الرد
```
PromptManager.getFullPrompt()
- بناء prompt مع الكتب المتاحة
- إضافة سبب التوصية
- إضافة رسالة عدم التطابق (إذا لزم)
```

### 6. تنظيف الرد
```
ResponseSanitizer.sanitizeWithRegeneration()
- إزالة Placeholders و Tokens
- إزالة كلمات أجنبية
- التحقق من جودة اللغة العربية
- إعادة التوليد إذا فشل التنظيف
```

### 7. إرسال الرد
```
- استخراج الكتب من تنسيق BOOK:
- إزالة تنسيق BOOK: من النص
- إرسال الرد النظيف للعميل
- إضافة الكتب لقائمة الاستبعاد
```

---

## الملفات المعدلة/المضافة

### الخدمات الجديدة:
1. `Backend/services/followup-intent-resolver.service.js`
2. `Backend/services/book-exclusion-tracker.service.js`
3. `Backend/services/response-sanitizer.service.js`
4. `Backend/services/knowledge-map.service.js`
5. `Backend/services/intent-expansion.service.js`

### الخدمات المحدثة:
1. `Backend/services/book-search.service.js`
   - إضافة `applyRecommendationDiversity()`
   - دعم `excludedBookIds`
   - رفع Relevance Score إلى 70%
   - تحديث `searchWithIntentExpansion()`

2. `Backend/services/intent-analysis.service.js`
   - إضافة `inferIntentFromGeneralQuestions()`
   - دعم expandedCategories
   - تحديث `fallbackAnalysis()`

3. `Backend/ai/services/prompt-manager.service.js`
   - تحديث `sales_chat` prompt
   - إضافة Sales Closing Statements
   - تحسين جودة اللغة العربية
   - إضافة مثال صحيح لتنسيق BOOK:

4. `Backend/controllers/chat-ai.controller.js`
   - استخدام Follow-up Intent Resolver
   - استخدام Book Exclusion Tracker
   - استخدام Response Sanitizer
   - تحديث `extractBooksFromResponse()` للتعامل مع التنسيق المكسور

---

## أمثلة الاستخدام

### مثال 1: متابعة المحادثة
```
العميل: "رشح لي رواية رعب"
AI: يعرض روايات رعب

العميل: "غيرهم"
النظام:
1. يكتشف أن هذا متابعة
2. يستخدم نفس النية (رعب)
3. يستبعد الكتب السابقة
4. يعرض روايات رعب مختلفة
```

### مثال 2: سؤال عام
```
العميل: "عايز كتاب يغير حياتي"
النظام:
1. يستنتج النية: تطوير الذات + النجاح
2. يبحث في هذه التصنيفات
3. يعرض كتب بدرجة صلة ≥ 70%
4. يشرح سبب التوصية لكل كتاب
5. ينهي بجملة تشجع على الشراء
```

### مثال 3: تنظيف الرد
```
قبل: "أرشح لك لأن... BOOK:123:... cải thiện"
بعد: "أرشح لك هذه الروايات مناسبة إذا كنت تحب الرعب النفسي"
```

---

## الأداء والمقاييس

### المقاييس المتاحة:
- `processingTime`: وقت المعالجة
- `tokensUsed`: عدد الـ Tokens المستخدمة
- `cost`: تكلفة الاستدعاء
- `booksFound`: عدد الكتب الموجودة
- `intent`: النية المحللة
- `relevanceWarning`: تحذير إذا كانت النتائج منخفضة الصلة

---

## التكامل مع نظام البيع

### نقاط التكامل:
1. **عرض الكتب:** يتم عرض الكتب بتنسيق منظم للواجهة الأمامية
2. **الروابط:** يتم إرسال `buyUrl` لكل كتاب
3. **التتبع:** يتم تتبع الكتب المقترحة لكل محادثة
4. **التحليل:** يتم تحليل النية لتوجيه العميل للكتب المناسبة

### البيانات المرسلة للواجهة الأمامية:
```json
{
  "success": true,
  "conversationId": "xxx",
  "data": {
    "choices": [{
      "message": {
        "content": "الرد المنظف"
      }
    }],
    "books": [
      {
        "id": "123",
        "title": "اسم الكتاب",
        "author": "المؤلف",
        "price": "50",
        "buyUrl": "https://..."
      }
    ]
  },
  "metadata": {
    "processingTime": 1500,
    "tokensUsed": 250,
    "cost": 0.05,
    "booksFound": 5,
    "intent": "search_book",
    "relevanceWarning": false
  }
}
```

---

## الصيانة والتطوير المستقبلي

### التحسينات المحتملة:
1. إضافة A/B Testing للردود
2. تحليل سلوك العميل وتحسين التوصيات
3. إضافة توصيات تعاونية (Collaborative Filtering)
4. تحسين دعم اللغات الأخرى
5. إضافة تحليل المشاعر (Sentiment Analysis)

### المراقبة:
- مراقبة معدل الشراء بعد التوصيات
- مراقبة رضا العملاء عن الردود
- مراقبة دقة استنتاج النية
- مراقبة جودة اللغة العربية

---

## الخلاصة

تم تحويل AI Sales Agent من مجرد محرك بحث إلى **موظف مبيعات محترف** من خلال:

1. **فهم احتياجات العميل:** استنتاج النية من الأسئلة العامة
2. **توصيات ذكية:** Intent Expansion + Relevance Score + Recommendation Diversity
3. **ذاكرة المحادثة:** Follow-up Intent Resolver + Book Exclusion Tracker
4. **ردود احترافية:** مختصرة + مباشرة + جودة لغة عربية عالية
5. **تنظيف الردود:** Response Sanitizer لضمان جودة الإخراج
6. **تركيز على البيع:** Sales Closing Statements + شرح سبب التوصية

**الهدف النهائي:** زيادة معدل شراء الكتب من خلال تجربة مستخدم محسنة وتوصيات دقيقة.
