const AIOrchestrator = require('../ai/services/ai-orchestrator.service');
const IntentExpansionService = require('./intent-expansion.service');
const fs = require('fs');
const path = require('path');

/**
 * Intent Analysis Service
 * خدمة تحليل نية العميل لفهم طلباته
 */
class IntentAnalysisService {
  constructor() {
    this.specificTopics = this.loadSpecificTopics();
  }

  /**
   * تحميل قائمة المواضيع ذات الهوية المستقلة
   * @returns {Object} - المواضيع حسب التصنيف
   */
  loadSpecificTopics() {
    try {
      const filePath = path.join(__dirname, '../data/specific-topics-reference.json');
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
      console.warn('[IntentAnalysis] specific-topics-reference.json not found, using empty object');
      return {};
    } catch (error) {
      console.error('[IntentAnalysis] Error loading specific topics:', error);
      return {};
    }
  }

  /**
   * تحديد نوع الطلب (محدد أو استكشافي)
   * @param {string} message - رسالة العميل
   * @param {Object} intentAnalysis - نتيجة تحليل النية
   * @returns {string} - 'specific' أو 'exploratory'
   */
  determineRequestType(message, intentAnalysis) {
    const lowerMessage = message.toLowerCase();

    // 1. التحقق من اسم كتاب محدد بصيغة استفهام مباشرة
    const bookTitlePatterns = [
      /كتاب اسمه/i,
      /رواية عنوانها/i,
      /كتاب بعنوان/i,
      /رواية اسمها/i,
      /كتاب آزر/i,
      /كتاب يسمى/i,
      /رواية تدعى/i
    ];
    
    if (bookTitlePatterns.some(pattern => pattern.test(message))) {
      return 'specific';
    }

    // 2. التحقق من موضوع متخصص من القائمة المرجعية
    if (intentAnalysis.category && this.specificTopics[intentAnalysis.category]) {
      const categoryTopics = this.specificTopics[intentAnalysis.category];
      const messageWords = message.split(/\s+/);
      
      for (const word of messageWords) {
        if (categoryTopics.some(topic => topic.toLowerCase().includes(word.toLowerCase()))) {
          return 'specific';
        }
      }
    }

    // 3. التحقق من اسم مؤلف بعينه دون ذكر نوع عام آخر
    if (intentAnalysis.author && !this.hasGeneralKeywords(message)) {
      return 'specific';
    }

    // 4. الافتراضي: استكشافي
    return 'exploratory';
  }

  /**
   * التحقق من وجود كلمات عامة في الرسالة
   * @param {string} message - الرسالة
   * @returns {boolean} - هل تحتوي على كلمات عامة
   */
  hasGeneralKeywords(message) {
    const generalKeywords = [
      'كتاب', 'كتب', 'رواية', 'قصة', 'رشح', 'ترشح', 'اقترح', 'نصح',
      'توصية', 'توصيات', 'افضل', 'أفضل', 'يناسب', 'مناسب', 'أحب',
      'محتاج', 'أريد', 'ابغى', 'عايز', 'مثيرة', 'جيدة', 'جيد'
    ];
    
    const lowerMessage = message.toLowerCase();
    return generalKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * تحليل نية العميل من رسالته
   * @param {string} message - رسالة العميل
   * @returns {Promise<Object>} - نتيجة التحليل
   */
  async analyzeIntent(message) {
    try {
      const prompt = `أنت محلل نية خبير في مكتبة كتب عربية. 
حلل الرسالة التالية وحدد:
1. النية الرئيسية (search_book, get_price, check_availability, get_recommendation, general_inquiry, library_info)
2. الكلمات المفتاحية للبحث
3. التصنيف المفضل (إن وجد)
4. نطاق السعر (إن وجد)
5. المؤلف المطلوب (إن وجد)

الرسالة: "${message}"

أجب بصيغة JSON فقط:
{
  "intent": "search_book",
  "keywords": ["كلمة1", "كلمة2"],
  "category": null,
  "minPrice": null,
  "maxPrice": null,
  "author": null,
  "confidence": 0.9
}`;

      const result = await AIOrchestrator.execute('intent_analysis', {
        message
      }, {
        prompt,
        returnJSON: true
      });

      if (result.success && result.json) {
        return this.parseIntentResult(result.json, message);
      }

      // Fallback: تحليل بسيط بدون AI
      return this.fallbackAnalysis(message);
    } catch (error) {
      console.error('Error in analyzeIntent:', error);
      return this.fallbackAnalysis(message);
    }
  }

  /**
   * تحليل نتيجة AI - مع Intent Expansion
   * @param {Object} jsonResult - نتيجة JSON من AI
   * @param {string} message - الرسالة الأصلية
   * @returns {Object} - النية المحللة
   */
  parseIntentResult(jsonResult, message) {
    // استخدام Intent Expansion لتعزيز النتيجة
    const expandedIntent = IntentExpansionService.detectAndExpand(jsonResult.keywords?.join(' ') || '');
    
    const intentAnalysis = {
      intent: jsonResult.intent || 'general_inquiry',
      keywords: [...new Set([...(jsonResult.keywords || []), ...expandedIntent.keywords])],
      category: jsonResult.category || (expandedIntent.categories.length > 0 ? expandedIntent.categories[0] : null),
      minPrice: jsonResult.minPrice || null,
      maxPrice: jsonResult.maxPrice || null,
      author: jsonResult.author || null,
      originalIntent: expandedIntent.originalIntent,
      expandedCategories: expandedIntent.categories,
      confidence: jsonResult.confidence || 0.5
    };

    // إضافة نوع الطلب
    intentAnalysis.requestType = this.determineRequestType(message, intentAnalysis);

    return intentAnalysis;
  }

  /**
   * تحليل احتياطي بدون AI - مع Intent Expansion
   * @param {string} message - رسالة العميل
   * @returns {Object} - النية المحللة
   */
  fallbackAnalysis(message) {
    const lowerMessage = message.toLowerCase();
    
    // استنتاج النية من الأسئلة العامة قبل Intent Expansion
    const inferredIntent = this.inferIntentFromGeneralQuestions(message);
    
    // استخدام Intent Expansion للحصول على نية محسنة
    const expandedIntent = IntentExpansionService.detectAndExpand(message);
    
    console.log('[IntentAnalysis] Fallback - Expanded Intent:', JSON.stringify(expandedIntent));
    
    // كلمات مفتاحية للبحث عن كتاب
    const bookKeywords = ['كتاب', 'كتب', 'رواية', 'قصة', 'book', 'novel', 'story'];
    const isBookSearch = bookKeywords.some(keyword => lowerMessage.includes(keyword));

    // كلمات مفتاحية للسعر
    const priceKeywords = ['سعر', 'كم', 'تكلفة', 'price', 'cost', 'how much'];
    const isPriceQuery = priceKeywords.some(keyword => lowerMessage.includes(keyword));

    // كلمات مفتاحية للتوفر
    const availabilityKeywords = ['متوفر', 'موجود', 'available', 'in stock', '库存'];
    const isAvailabilityQuery = availabilityKeywords.some(keyword => lowerMessage.includes(keyword));

    // كلمات مفتاحية للتوصية
    const recommendationKeywords = ['رشح', 'ترشح', 'اقترح', 'نصح', 'recommend', 'suggest', 'توصية', 'توصيات', 'افضل', 'أفضل', 'يناسب', 'مناسب', 'أحب', 'أريد'];
    const isRecommendationQuery = recommendationKeywords.some(keyword => lowerMessage.includes(keyword));

    // كلمات مفتاحية لمعلومات المكتبة
    const libraryKeywords = ['مكتبة', 'عنوان', 'هاتف', 'موقع', 'library', 'address', 'phone', 'location'];
    const isLibraryQuery = libraryKeywords.some(keyword => lowerMessage.includes(keyword));

    // تحديد النية
    let intent = 'general_inquiry';
    if (isLibraryQuery) {
      intent = 'library_info';
    } else if (isRecommendationQuery) {
      intent = 'get_recommendation';
    } else if (isAvailabilityQuery) {
      intent = 'check_availability';
    } else if (isPriceQuery) {
      intent = 'get_price';
    } else if (isBookSearch) {
      intent = 'search_book';
    } else if (inferredIntent || expandedIntent.originalIntent) {
      // استخدام النية المستنتجة أو المكتشفة من Intent Expansion
      intent = 'search_book';
    }

    // استخراج الكلمات المفتاحية
    const keywords = message.split(/\s+/).filter(word => word.length > 2);

    // دمج الكلمات من Intent Expansion
    const allKeywords = [...new Set([...keywords, ...expandedIntent.keywords])];

    // استخدام التصنيفات المستنتجة إذا كانت موجودة
    const categories = inferredIntent ? inferredIntent.categories : expandedIntent.categories;

    const intentAnalysis = {
      intent,
      keywords: allKeywords,
      category: categories.length > 0 ? categories[0] : null,
      minPrice: null,
      maxPrice: null,
      author: null,
      originalIntent: inferredIntent ? inferredIntent.intent : expandedIntent.originalIntent,
      expandedCategories: categories,
      confidence: 0.7
    };

    // إضافة نوع الطلب
    intentAnalysis.requestType = this.determineRequestType(message, intentAnalysis);

    return intentAnalysis;
  }

  /**
   * استنتاج النية من الأسئلة العامة
   * @param {string} message - الرسالة
   * @returns {Object|null} - النية المستنتجة
   */
  inferIntentFromGeneralQuestions(message) {
    const lowerMessage = message.toLowerCase();
    
    // أنماط الاستنتاج
    const patterns = [
      // تغيير الحياة / النجاح
      {
        keywords: ['يغير حياتي', 'غير حياتي', 'أغير حياتي', 'تغيير حياتي', 'أبدا حياتي', 'أبدأ حياتي', 'حياتي'],
        intent: 'success',
        categories: ['تطوير الذات', 'النجاح', 'القيادة', 'الأعمال', 'الإدارة']
      },
      // النجاح
      {
        keywords: ['أنجح', 'أريد أنجح', 'عايز أنجح', 'النجاح', 'كيف أنجح', 'طريق النجاح'],
        intent: 'success',
        categories: ['تطوير الذات', 'النجاح', 'القيادة', 'العادات', 'الإنتاجية']
      },
      // التطوير الذاتي
      {
        keywords: ['أطور نفسي', 'تطوير نفسي', 'أطور ذاتي', 'تطوير ذاتي', 'تحسين نفسي', 'تحسين حالتي'],
        intent: 'self_improvement',
        categories: ['تطوير الذات', 'النجاح', 'القيادة', 'علم النفس']
      },
      // الحالة النفسية
      {
        keywords: ['حالتي النفسية', 'نفسي', 'حالة نفسية', 'تحسين حالتي النفسية', 'أحسن حالتي النفسية', 'مزاجي', 'اكتئاب', 'قلق', 'توتر'],
        intent: 'psychology',
        categories: ['علم النفس', 'الصحة النفسية', 'الثقة بالنفس', 'إدارة المشاعر']
      },
      // التجارة / الأعمال
      {
        keywords: ['أتعلم التجارة', 'تعلم التجارة', 'التجارة', 'أبدأ مشروعي', 'مشروعي', 'مشروع', 'ريادة أعمال'],
        intent: 'business',
        categories: ['الأعمال', 'إدارة الأعمال', 'التسويق', 'الاستثمار', 'ريادة الأعمال']
      },
      // المال / الثروة
      {
        keywords: ['أكون غني', 'أصير غني', 'كسب المال', 'جمع المال', 'الثراء', 'أغني', 'مال', 'ثروة'],
        intent: 'money',
        categories: ['الاستثمار', 'المال', 'الاقتصاد', 'ريادة الأعمال', 'الأعمال']
      },
      // التسويق
      {
        keywords: ['أتعلم التسويق', 'تعلم التسويق', 'التسويق', 'تسويق', 'بيع', 'مبيعات'],
        intent: 'marketing',
        categories: ['التسويق', 'الأعمال', 'إدارة الأعمال', 'البيع']
      },
      // الاستثمار
      {
        keywords: ['استثمار', 'أستثمر', 'كيف أستثمر', 'الاستثمار', 'أسهم', 'سندات'],
        intent: 'investment',
        categories: ['الاستثمار', 'المال', 'الاقتصاد', 'الأعمال']
      },
      // القيادة
      {
        keywords: ['قيادة', 'أصير قائد', 'أكون قائد', 'قيادة فريق', 'إدارة فريق'],
        intent: 'leadership',
        categories: ['القيادة', 'الإدارة', 'تطوير الذات', 'الأعمال']
      },
      // الإنتاجية
      {
        keywords: ['إنتاجية', 'أزيد إنتاجيتي', 'إدارة وقت', 'تنظيم وقت', 'أكثر إنتاجية'],
        intent: 'productivity',
        categories: ['الإنتاجية', 'إدارة الوقت', 'تطوير الذات', 'التنظيم']
      },
      // العادات
      {
        keywords: ['عادات', 'عادات جيدة', 'تغيير عاداتي', 'عاداتي', 'بناء عادات'],
        intent: 'self_improvement',
        categories: ['تطوير الذات', 'النجاح', 'الإنتاجية', 'علم النفس']
      },
      // الثقة بالنفس
      {
        keywords: ['ثقة بالنفس', 'أزيد ثقتي', 'ثقة', 'جرأة', 'شجاعة'],
        intent: 'psychology',
        categories: ['علم النفس', 'تطوير الذات', 'النجاح', 'الصحة النفسية']
      },
      // الرومانسية
      {
        keywords: ['رومانسية', 'حب', 'عشق', 'غرام', 'قصة حب'],
        intent: 'romance',
        categories: ['رومانسية', 'دراما', 'حب']
      },
      // الرعب
      {
        keywords: ['رعب', 'مرعب', 'خوف', 'رواية رعب', 'قصة رعب'],
        intent: 'horror',
        categories: ['رعب', 'غموض', 'تشويق', 'جريمة']
      },
      // التاريخ
      {
        keywords: ['تاريخ', 'تاريخي', 'أحداث تاريخية', 'ماضي', 'حضارات'],
        intent: 'history',
        categories: ['تاريخ', 'حضارات', 'سير']
      },
      // الدين
      {
        keywords: ['دين', 'إسلام', 'قرآن', 'سنة', 'فقه', 'عقيدة', 'إسلاميات'],
        intent: 'religion',
        categories: ['إسلاميات', 'تفسير', 'حديث', 'فقه', 'عقيدة']
      },
      // البرمجة
      {
        keywords: ['برمجة', 'كود', 'برمجيات', 'تطوير', 'حاسوب', 'كمبيوتر'],
        intent: 'programming',
        categories: ['برمجة', 'حاسوب', 'تقنية', 'تكنولوجيا']
      }
    ];

    // البحث عن نمط مطابق
    for (const pattern of patterns) {
      const matches = pattern.keywords.some(keyword => lowerMessage.includes(keyword));
      if (matches) {
        return {
          intent: pattern.intent,
          categories: pattern.categories
        };
      }
    }

    return null;
  }

  /**
   * تحديد ما إذا كان الاستعلام يتطلب بحث عن كتب
   * @param {Object} intentAnalysis - نتيجة تحليل النية
   * @returns {boolean} - هل يتطلب بحث
   */
  requiresBookSearch(intentAnalysis) {
    const searchIntents = ['search_book', 'get_recommendation', 'check_availability', 'get_price'];
    
    // إذا كانت النية general_inquiry ولا توجد كلمات مفتاحية للبحث، لا نحتاج بحثاً
    if (intentAnalysis.intent === 'general_inquiry' && 
        (!intentAnalysis.keywords || intentAnalysis.keywords.length === 0)) {
      return false;
    }
    
    // التحقق من كلمات التحيات الشائعة - لا تحتاج بحثاً
    const greetingKeywords = ['السلام', 'مرحبا', 'أهلا', 'صباح', 'مساء', 'إزيك', 'هلا', 'تحية'];
    if (intentAnalysis.intent === 'general_inquiry' && intentAnalysis.keywords) {
      const hasGreetingOnly = intentAnalysis.keywords.every(keyword => 
        greetingKeywords.some(greeting => keyword.toLowerCase().includes(greeting))
      );
      if (hasGreetingOnly) {
        return false;
      }
    }
    
    return searchIntents.includes(intentAnalysis.intent);
  }

  /**
   * بناء استعلام البحث من الكلمات المفتاحية
   * @param {Object} intentAnalysis - نتيجة تحليل النية
   * @returns {string} - استعلام البحث
   */
  buildSearchQuery(intentAnalysis) {
    if (intentAnalysis.author) {
      return intentAnalysis.author;
    }
    
    // استبعاد الكلمات العامة والتركيز على الكلمات المحددة
    const generalKeywords = [
      'محتاج', 'كتاب', 'كتب', 'رواية', 'قصة', 'اريد', 'ابغى', 'عندي', 'عندك', 'هل', 'ممكن',
      'رشح', 'ترشح', 'اقترح', 'نصح', 'توصية', 'توصيات', 'افضل', 'أفضل', 'يناسب', 'مناسب', 'أحب',
      'سعر', 'كم', 'تكلفة', 'متوفر', 'موجود', 'مكتبة', 'عنوان', 'هاتف', 'موقع',
      'لي', 'بس', 'عايز', 'عايزة', 'اللي', 'دي', 'دا', 'ده', 'ان', 'عن'
    ];
    
    const specificKeywords = intentAnalysis.keywords.filter(keyword => 
      !generalKeywords.includes(keyword.toLowerCase()) && keyword.length > 2
    );
    
    // إذا لم توجد كلمات محددة، استخدم كل الكلمات
    if (specificKeywords.length === 0) {
      return intentAnalysis.keywords.join(' ');
    }
    
    return specificKeywords.join(' ');
  }

  /**
   * بناء خيارات البحث من تحليل النية - مع دعم expandedCategories
   * @param {Object} intentAnalysis - نتيجة تحليل النية
   * @returns {Object} - خيارات البحث
   */
  buildSearchOptions(intentAnalysis) {
    const options = {
      limit: 10,
      inStockOnly: true
    };

    // استخدام expandedCategories إذا كانت موجودة
    if (intentAnalysis.expandedCategories && intentAnalysis.expandedCategories.length > 0) {
      options.categories = intentAnalysis.expandedCategories;
    } else if (intentAnalysis.category) {
      options.category = intentAnalysis.category;
    }

    if (intentAnalysis.minPrice !== null) {
      options.minPrice = intentAnalysis.minPrice;
    }

    if (intentAnalysis.maxPrice !== null) {
      options.maxPrice = intentAnalysis.maxPrice;
    }

    return options;
  }
}

module.exports = new IntentAnalysisService();
