/**
 * Knowledge Map Service
 * خدمة خريطة المعرفة لربط اهتمامات العميل بالتصنيفات والمجالات
 */

const { containsArabic } = require('../utils/arabic-normalizer');

class KnowledgeMapService {
  constructor() {
    // خريطة المعرفة: ربط الاهتمامات بالتصنيفات والكلمات المفتاحية
    this.knowledgeMap = {
      // النجاح والتطوير
      'success': {
        categories: ['تطوير الذات', 'القيادة', 'الأعمال', 'الإدارة', 'علم النفس'],
        keywords: ['نجاح', 'تطوير', 'إنجاز', 'عادات', 'إنتاجية', 'إدارة وقت', 'ثقة بالنفس', 'تحفيز', 'أهداف', 'طموح', 'تفوق', 'قوة الإرادة', 'قيادة', 'إدارة', 'عقلية', 'نمو', 'تقدم', 'إنجازات', 'تميز'],
        relatedIntents: ['career', 'business', 'motivation', 'productivity', 'self_improvement']
      },
      
      // المسار المهني
      'career': {
        categories: ['تطوير الذات', 'القيادة', 'الأعمال', 'الإدارة', 'مهارات'],
        keywords: ['مهنة', 'وظيفة', 'عمل', 'كاريير', 'ترقية', 'مهارات', 'قيادة', 'إدارة', 'توظيف', 'مقابلة', 'سيرة ذاتية', 'تطوير مهني', 'نجاح مهني', 'تقدم وظيفي'],
        relatedIntents: ['success', 'business', 'leadership', 'management']
      },
      
      // الأعمال والتجارة
      'business': {
        categories: ['الأعمال', 'إدارة الأعمال', 'التسويق', 'الاستثمار', 'ريادة الأعمال', 'الاقتصاد', 'المال'],
        keywords: ['أعمال', 'تجارة', 'مشروع', 'شركة', 'ريادة', 'استثمار', 'مال', 'اقتصاد', 'تسويق', 'بيع', 'إدارة', 'مشاريع', 'شركات', 'تجارة', 'أرباح', 'أعمال'],
        relatedIntents: ['success', 'career', 'money', 'marketing', 'investment']
      },
      
      // المال والثروة
      'money': {
        categories: ['الاستثمار', 'الاقتصاد', 'المال', 'ريادة الأعمال', 'الأعمال'],
        keywords: ['مال', 'ثروة', 'غنى', 'استثمار', 'أرباح', 'دخل', 'كسب', 'اقتصاد', 'تمويل', 'ميزانية', 'ادخار', 'إدارة مالية', 'ثروة', 'أموال', 'دخل', 'ربح'],
        relatedIntents: ['business', 'investment', 'economics', 'entrepreneurship']
      },
      
      // التحفيز
      'motivation': {
        categories: ['تطوير الذات', 'القيادة', 'علم النفس', 'النجاح'],
        keywords: ['تحفيز', 'إلهام', 'تشجيع', 'حماس', 'قوة', 'إرادة', 'عزيمة', 'ثبات', 'صبر', 'مثابرة', 'تحفيز', 'إلهام', 'تشجيع', 'قوة إرادة'],
        relatedIntents: ['success', 'self_improvement', 'psychology']
      },
      
      // الإنتاجية
      'productivity': {
        categories: ['تطوير الذات', 'الإدارة', 'القيادة', 'مهارات'],
        keywords: ['إنتاجية', 'كفاءة', 'إدارة وقت', 'تنظيم', 'تخطيط', 'أداء', 'إنجاز', 'تركيز', 'إنتاجية', 'كفاءة', 'وقت', 'تنظيم', 'تخطيط'],
        relatedIntents: ['success', 'time_management', 'organization']
      },
      
      // التطوير الذاتي
      'self_improvement': {
        categories: ['تطوير الذات', 'علم النفس', 'القيادة', 'مهارات', 'النجاح'],
        keywords: ['تطوير ذات', 'تحسين', 'نمو', 'تقدم', 'تطوير', 'تحسين', 'نمو شخصي', 'تطوير مهارات', 'تحسين ذات', 'تقدم', 'نمو'],
        relatedIntents: ['success', 'motivation', 'psychology', 'skills']
      },
      
      // الرعب
      'horror': {
        categories: ['رعب', 'غموض', 'تشويق', 'جريمة', 'إثارة'],
        keywords: ['رعب', 'مرعب', 'خوف', 'غموض', 'تشويق', 'جريمة', 'قاتل', 'قتل', 'دم', 'لعنة', 'جن', 'أشباح', 'بيت مهجور', 'قوى خارقة', 'كوابيس', 'اختفاء', 'ألغاز', 'مجهول', 'ظلام', 'روح', 'موت', 'انتقام', 'رعب', 'خوف', 'مرعب'],
        relatedIntents: ['mystery', 'thriller', 'crime', 'suspense']
      },
      
      // الرومانسية
      'romance': {
        categories: ['رومانسية', 'دراما', 'حب', 'عاطفة'],
        keywords: ['حب', 'عشق', 'غرام', 'رومانسية', 'عاطفة', 'زواج', 'قصة حب', 'مشاعر', 'قلب', 'علاقة', 'شغف', 'رومانسية', 'حب', 'عشق', 'غرام'],
        relatedIntents: ['drama', 'emotion', 'love']
      },
      
      // التاريخ
      'history': {
        categories: ['تاريخ', 'حضارات', 'سير', 'تراجم'],
        keywords: ['تاريخ', 'ماضي', 'أحداث تاريخية', 'حضارات', 'تاريخ البشرية', 'تاريخ مصر', 'تاريخ العرب', 'تاريخ الإسلام', 'سيرة', 'ترجمة', 'سيرة ذاتية', 'تاريخ', 'ماضي', 'حضارة'],
        relatedIntents: ['civilization', 'biography', 'culture']
      },
      
      // الدين
      'religion': {
        categories: ['إسلاميات', 'تفسير', 'حديث', 'فقه', 'عقيدة', 'تزكية', 'أخلاق'],
        keywords: ['دين', 'إسلام', 'قرآن', 'سنة', 'فقه', 'عقيدة', 'تزكية', 'أخلاق', 'عبادات', 'أحكام', 'تفسير', 'حديث', 'إسلاميات', 'دين', 'قرآن', 'سنة'],
        relatedIntents: ['islam', 'quran', 'hadith', 'ethics']
      },
      
      // البرمجة
      'programming': {
        categories: ['برمجة', 'حاسوب', 'تقنية', 'تكنولوجيا'],
        keywords: ['برمجة', 'كود', 'برمجيات', 'تطوير', 'حاسوب', 'كمبيوتر', 'تقنية', 'تكنولوجيا', 'إنترنت', 'ويب', 'موبايل', 'تطبيقات', 'برمجة', 'كود', 'تطوير'],
        relatedIntents: ['technology', 'computer', 'software', 'web']
      },
      
      // التسويق
      'marketing': {
        categories: ['التسويق', 'الأعمال', 'إدارة الأعمال', 'البيع'],
        keywords: ['تسويق', 'إعلان', 'دعاية', 'بيع', 'مبيعات', 'ترويج', 'علامة تجارية', 'سوق', 'عملاء', 'تسويق', 'إعلان', 'بيع', 'مبيعات'],
        relatedIntents: ['business', 'sales', 'advertising', 'branding']
      },
      
      // الاستثمار
      'investment': {
        categories: ['الاستثمار', 'المال', 'الاقتصاد', 'الأعمال'],
        keywords: ['استثمار', 'أسهم', 'سندات', 'عقارات', 'تمويل', 'أرباح', 'عائد', 'محفظة', 'استثمار', 'أسهم', 'عقارات', 'تمويل'],
        relatedIntents: ['money', 'finance', 'economics', 'business']
      },
      
      // ريادة الأعمال
      'entrepreneurship': {
        categories: ['ريادة الأعمال', 'الأعمال', 'إدارة الأعمال', 'القيادة'],
        keywords: ['ريادة', 'مشروع', 'شركة ناشئة', 'ستارت أب', 'ابتكار', 'ريادة أعمال', 'مشروع', 'شركة', 'ابتكار'],
        relatedIntents: ['business', 'startup', 'innovation', 'leadership']
      },
      
      // القيادة
      'leadership': {
        categories: ['القيادة', 'الإدارة', 'تطوير الذات', 'الأعمال'],
        keywords: ['قيادة', 'زعامة', 'إدارة', 'توجيه', 'قيادة فريق', 'مدير', 'رئيس', 'قيادة', 'زعامة', 'إدارة'],
        relatedIntents: ['management', 'business', 'self_improvement', 'career']
      },
      
      // الإدارة
      'management': {
        categories: ['الإدارة', 'إدارة الأعمال', 'القيادة', 'الأعمال'],
        keywords: ['إدارة', 'تنظيم', 'تخطيط', 'رقابة', 'مدير', 'إدارة', 'تنظيم', 'تخطيط'],
        relatedIntents: ['leadership', 'business', 'organization', 'planning']
      },
      
      // علم النفس
      'psychology': {
        categories: ['علم النفس', 'تطوير الذات', 'النجاح', 'الصحة النفسية'],
        keywords: ['علم النفس', 'سلوك', 'عقل', 'ذهن', 'نفسية', 'صحة نفسية', 'علاقات', 'تواصل', 'علم نفس', 'سلوك', 'عقل'],
        relatedIntents: ['self_improvement', 'mental_health', 'behavior', 'relationships']
      },
      
      // الغموض
      'mystery': {
        categories: ['غموض', 'رعب', 'تشويق', 'جريمة', 'إثارة'],
        keywords: ['غموض', 'لغز', 'سر', 'خفي', 'مجهول', 'تحقيق', 'غموض', 'لغز', 'سر', 'خفي'],
        relatedIntents: ['horror', 'thriller', 'crime', 'suspense']
      },
      
      // التشويق
      'thriller': {
        categories: ['تشويق', 'رعب', 'غموض', 'جريمة', 'إثارة'],
        keywords: ['تشويق', 'إثارة', 'توتر', 'حركة', 'تشويق', 'إثارة', 'توتر'],
        relatedIntents: ['horror', 'mystery', 'crime', 'suspense']
      },
      
      // الجريمة
      'crime': {
        categories: ['جريمة', 'غموض', 'رعب', 'تشويق', 'إثارة'],
        keywords: ['جريمة', 'قتل', 'سرقة', 'تحقيق', 'جناية', 'جنايات', 'شرطة', 'جريمة', 'قتل', 'سرقة'],
        relatedIntents: ['mystery', 'horror', 'thriller', 'suspense']
      },
      
      // الدراما
      'drama': {
        categories: ['دراما', 'رومانسية', 'حزن', 'عاطفة'],
        keywords: ['دراما', 'مأساة', 'حزن', 'عاطفة', 'مشاعر', 'صراع', 'دراما', 'مأساة', 'حزن'],
        relatedIntents: ['romance', 'emotion', 'tragedy']
      },
      
      // الكوميديا
      'comedy': {
        categories: ['كوميديا', 'ضحك', 'مرح'],
        keywords: ['كوميديا', 'ضحك', 'فكاهة', 'مزاح', 'مرح', 'نكت', 'كوميديا', 'ضحك', 'فكاهة'],
        relatedIntents: ['humor', 'fun', 'entertainment']
      },
      
      // الخيال العلمي
      'scifi': {
        categories: ['خيال علمي', 'خيال', 'تكنولوجيا', 'علم'],
        keywords: ['خيال علمي', 'ساي فاي', 'مستقبل', 'فضاء', 'روبوت', 'ذكاء اصطناعي', 'خيال علمي', 'فضاء', 'روبوت'],
        relatedIntents: ['fantasy', 'technology', 'science', 'future']
      },
      
      // الفانتازيا
      'fantasy': {
        categories: ['فانتازيا', 'خيال', 'سحر', 'أساطير'],
        keywords: ['فانتازيا', 'خيال', 'سحر', 'أساطير', 'عوالم خيالية', 'فانتازيا', 'خيال', 'سحر'],
        relatedIntents: ['scifi', 'magic', 'mythology', 'imagination']
      },
      
      // المغامرة
      'adventure': {
        categories: ['مغامرة', 'سفر', 'استكشاف'],
        keywords: ['مغامرة', 'رحلة', 'استكشاف', 'خطر', 'تحدي', 'مغامرات', 'رحلة', 'استكشاف'],
        relatedIntents: ['travel', 'exploration', 'action']
      },
      
      // السفر
      'travel': {
        categories: ['سفر', 'رحلات', 'سياحة', 'ثقافات'],
        keywords: ['سفر', 'رحلات', 'سياحة', 'دول', 'ثقافات', 'استكشاف', 'سفر', 'رحلات', 'سياحة'],
        relatedIntents: ['adventure', 'exploration', 'culture', 'tourism']
      },
      
      // الطبخ
      'cooking': {
        categories: ['طبخ', 'وصفات', 'مطبخ', 'طعام'],
        keywords: ['طبخ', 'وصفات', 'أكل', 'مطبخ', 'طعام', 'حلويات', 'طبخ', 'وصفات', 'مطبخ'],
        relatedIntents: ['food', 'recipes', 'cuisine']
      },
      
      // الرياضة
      'sports': {
        categories: ['رياضة', 'لياقة', 'صحة'],
        keywords: ['رياضة', 'لياقة', 'تمارين', 'صحة', 'جسم', 'عضلات', 'حرق دهون', 'رياضة', 'لياقة', 'تمارين'],
        relatedIntents: ['fitness', 'health', 'exercise']
      },
      
      // الفن
      'art': {
        categories: ['فن', 'رسم', 'تصوير', 'موسيقى', 'سينما', 'مسرح'],
        keywords: ['فن', 'رسم', 'تصوير', 'موسيقى', 'سينما', 'مسرح', 'تصميم', 'فن', 'رسم', 'تصوير'],
        relatedIntents: ['painting', 'photography', 'music', 'cinema']
      },
      
      // الموسيقى
      'music': {
        categories: ['موسيقى', 'غناء', 'آلات موسيقية'],
        keywords: ['موسيقى', 'غناء', 'آلات موسيقية', 'تأليف', 'نوتات', 'أغاني', 'موسيقى', 'غناء', 'آلات'],
        relatedIntents: ['art', 'singing', 'instruments']
      },
      
      // السينما
      'cinema': {
        categories: ['سينما', 'أفلام', 'تمثيل', 'إخراج'],
        keywords: ['سينما', 'أفلام', 'تمثيل', 'إخراج', 'سينمائي', 'فيلم', 'سينما', 'أفلام'],
        relatedIntents: ['art', 'movies', 'acting', 'directing']
      },
      
      // المسرح
      'theater': {
        categories: ['مسرح', 'تمثيل', 'مسرحيات', 'دراما'],
        keywords: ['مسرح', 'تمثيل', 'مسرحيات', 'دراما', 'فنون مسرحية', 'مسرح', 'تمثيل'],
        relatedIntents: ['art', 'drama', 'acting']
      },
      
      // الشعر
      'poetry': {
        categories: ['شعر', 'أدب', 'قصائد'],
        keywords: ['شعر', 'قصائد', 'أبيات', 'شاعر', 'ديوان', 'نظم', 'شعر', 'قصائد'],
        relatedIntents: ['literature', 'poems', 'verses']
      },
      
      // الروحانيات
      'spirituality': {
        categories: ['روحانيات', 'تصوف', 'روح', 'تزكية'],
        keywords: ['روحانيات', 'تصوف', 'روح', 'تزكية', 'عبادة', 'قرب', 'مكاشفات', 'روحانيات', 'تصوف'],
        relatedIntents: ['religion', 'meditation', 'mysticism']
      },
      
      // الصحة
      'health': {
        categories: ['صحة', 'طب', 'علاج', 'وقاية'],
        keywords: ['صحة', 'طب', 'دواء', 'علاج', 'أمراض', 'وقاية', 'نصائح طبية', 'صحة', 'طب', 'علاج'],
        relatedIntents: ['medicine', 'wellness', 'fitness']
      },
      
      // التعليم
      'education': {
        categories: ['تعليم', 'تعلم', 'دراسة', 'مدارس', 'جامعات'],
        keywords: ['تعليم', 'تعلم', 'دراسة', 'مدارس', 'جامعات', 'مناهج', 'تربية', 'تعليم', 'تعلم'],
        relatedIntents: ['learning', 'study', 'schools', 'universities']
      },

      // اللغات
      'languages': {
        categories: ['لغات', 'تعلم لغات', 'إنجليزي', 'فرنسي', 'ألماني', 'إسباني'],
        keywords: ['لغة', 'لغات', 'انجليزي', 'انجليزية', 'انجليزيه', 'english', 'تعلم لغة', 'محادثة', 'ترجمة', 'فرنسي', 'ألماني', 'إسباني', 'لغة اجنبية', 'لغة عربية', 'نحو', 'قواعد', 'جمل', 'كلمات', 'مفردات'],
        relatedIntents: ['education', 'learning', 'study']
      },

      // الأسرة
      'family': {
        categories: ['أسرة', 'أطفال', 'تربية', 'زواج', 'عائلة'],
        keywords: ['أسرة', 'أطفال', 'تربية', 'زواج', 'عائلة', 'والدين', 'أخلاق', 'أسرة', 'أطفال'],
        relatedIntents: ['parenting', 'children', 'marriage', 'relationships']
      }
    };
  }

  /**
   * الحصول على التصنيفات المرتبطة بنية معينة
   * @param {string} intent - النية
   * @returns {Array} - مصفوفة التصنيفات
   */
  getCategoriesForIntent(intent) {
    const intentData = this.knowledgeMap[intent];
    if (!intentData) {
      return [];
    }
    return intentData.categories || [];
  }

  /**
   * الحصول على الكلمات المفتاحية المرتبطة بنية معينة
   * @param {string} intent - النية
   * @returns {Array} - مصفوفة الكلمات المفتاحية
   */
  getKeywordsForIntent(intent) {
    const intentData = this.knowledgeMap[intent];
    if (!intentData) {
      return [];
    }
    return intentData.keywords || [];
  }

  /**
   * الحصول على النيات المرتبطة بنية معينة
   * @param {string} intent - النية
   * @returns {Array} - مصفوفة النيات المرتبطة
   */
  getRelatedIntents(intent) {
    const intentData = this.knowledgeMap[intent];
    if (!intentData) {
      return [];
    }
    return intentData.relatedIntents || [];
  }

  /**
   * توسيع البحث باستخدام النيات المرتبطة
   * @param {string} intent - النية الأساسية
   * @returns {Object} - التصنيفات والكلمات الموسعة
   */
  expandSearch(intent) {
    const categories = new Set(this.getCategoriesForIntent(intent));
    const keywords = new Set(this.getKeywordsForIntent(intent));

    // إضافة التصنيفات والكلمات من النيات المرتبطة
    const relatedIntents = this.getRelatedIntents(intent);
    relatedIntents.forEach(relatedIntent => {
      const relatedCategories = this.getCategoriesForIntent(relatedIntent);
      const relatedKeywords = this.getKeywordsForIntent(relatedIntent);

      relatedCategories.forEach(cat => categories.add(cat));
      relatedKeywords.forEach(kw => keywords.add(kw));
    });

    return {
      categories: Array.from(categories),
      keywords: Array.from(keywords)
    };
  }

  /**
   * تحديد النية من النص
   * @param {string} text - النص
   * @returns {string} - النية الأساسية
   */
  detectIntent(text) {
    let bestMatch = null;
    let maxMatches = 0;

    for (const [intent, data] of Object.entries(this.knowledgeMap)) {
      const matches = data.keywords.filter(keyword => 
        containsArabic(text, keyword)
      ).length;

      if (matches > maxMatches) {
        maxMatches = matches;
        bestMatch = intent;
      }
    }

    return bestMatch;
  }

  /**
   * الحصول على جميع التصنيفات المتاحة
   * @returns {Array} - مصفوفة جميع التصنيفات
   */
  getAllCategories() {
    const categories = new Set();
    Object.values(this.knowledgeMap).forEach(data => {
      data.categories.forEach(cat => categories.add(cat));
    });
    return Array.from(categories);
  }

  /**
   * الحصول على جميع الكلمات المفتاحية المتاحة
   * @returns {Array} - مصفوفة جميع الكلمات المفتاحية
   */
  getAllKeywords() {
    const keywords = new Set();
    Object.values(this.knowledgeMap).forEach(data => {
      data.keywords.forEach(kw => keywords.add(kw));
    });
    return Array.from(keywords);
  }
}

module.exports = new KnowledgeMapService();
