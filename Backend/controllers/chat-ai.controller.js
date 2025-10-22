const axios = require('axios');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
require('dotenv').config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// تعديل المسار ليكون متوافقًا مع بيئة الإنتاج بعد البناء
// سيتم نسخ الملف إلى مجلد dist/server
const BOOKS_JSON_PATH = path.resolve(__dirname, 'output.json');

let cachedBooks = null;

// معلومات مكتبة كنوز
const KENOUZ_LIBRARY_INFO = `
مكتبة كنوز
العنوان: محافظة الدقهلية - مركز منية النصر - الرياض
رقم الهاتف: 01094612729
رابط الويب سايت: www.kenouz.org
أوقات العمل: من 9 صباحاً حتى 9 مساءً
وهي أفضل وأول مكتبة إلكترونية في مصر مختصة في تجارة الكتب وطباعة ملفات PDF.
`;

/**
 * تحميل وتحليل ملف output.json لاستخراج بيانات الكتب
 */
async function loadBooksData() {
  if (cachedBooks) {
    return cachedBooks;
  }
  try {
    const jsonData = fs.readFileSync(BOOKS_JSON_PATH, 'utf-8');
    const booksData = JSON.parse(jsonData);
    const books = booksData.map(book => ({
      title: book.product_name,
      description: book.product_description,
      // Construct the URL based on product ID and name for SEO-friendly URLs
      url: `https://kenouz.org/book/${book.products_id}/${encodeURIComponent(book.product_name.replace(/\s+/g, '-'))}`
    }));
    cachedBooks = books;
    return books;
  } catch (error) {
    console.error('خطأ في تحميل أو تحليل output.json:', error);
    return [];
  }
}

/**
 * تحقق إذا كان الاستعلام متعلق بمكتبة كنوز بدقة أكبر
 */
function isKenouzLibraryQuery(query) {
  const keywords = [
    'مكتبة كنوز',
    'معلومات مكتبة كنوز',
    'عنوان مكتبة كنوز',
    'رقم هاتف مكتبة كنوز',
    'أوقات عمل مكتبة كنوز',
    'مواعيد عمل مكتبة كنوز',
    'كنوز',
    'kenouz'
  ];
  const lowerQuery = query.toLowerCase();

  // تحقق من وجود أي من العبارات الكاملة في الاستعلام
  for (const keyword of keywords) {
    if (lowerQuery.includes(keyword)) {
      // تحقق من وجود كلمات أخرى ذات صلة لتقليل الردود الخاطئة
      const relatedWords = ['مكتبة', 'عنوان', 'هاتف', 'رقم', 'معلومات', 'أوقات', 'مواعيد', 'كنوز', 'المكتبة'];
      let count = 0;
      for (const word of relatedWords) {
        if (lowerQuery.includes(word)) {
          count++;
        }
      }
      if (count >= 2) {
        return true;
      }
    }
  }

  // تحقق من وجود كلمة "المكتبة" مع كلمة أخرى ذات صلة
  if (lowerQuery.includes('مكتبة'||'library'||'المكتبة'||'مكتبه'||'المكتبه')) {
    const relatedWordsForLibrary = ['معلومات', 'عنوان', 'رقم', 'كنوز', 'هاتف', 'أوقات', 'مواعيد'];
    let count = 0;
    for (const word of relatedWordsForLibrary) {
      if (lowerQuery.includes(word)) {
        count++;
      }
    }
    if (count >= 1) {
      return true;
    }
  }

  return false;
}

/**
 * تعديل خوارزمية البحث عن كتب مطابقة في بيانات sitemap بناءً على نص الاستعلام
 * لتقترح الكتب إذا وُجدت أي كلمة من استعلام المستخدم في عنوان الكتاب
 */
function findMatchingBooks(query, books) {
  const lowerQuery = query.toLowerCase();
  // تقسيم الاستعلام إلى كلمات منفصلة
  const queryWords = lowerQuery.split(/\s+/).filter(Boolean);

  return books.filter(book => {
    const lowerTitle = book.title.toLowerCase();
    // تحقق من وجود أي كلمة من كلمات الاستعلام في عنوان الكتاب
    return queryWords.some(word => lowerTitle.includes(word));
  });
}

/**
 * استبدال علامات **bold** في النص بوسم span مع خلفية صفراء ونص عريض ولون نص داكن
 */
function highlightBoldBookTitles(text) {
  // استبدال **text** بوسم span مع خلفية صفراء ونص عريض ولون نص داكن
  return text.replace(/\*\*(.+?)\*\*/g, '<span style="background-color: yellow; font-weight: bold; color: #222;">$1</span>');
}

/**
 * إرسال رسالة إلى خدمة الذكاء الاصطناعي مع دمج بيانات الكتب من sitemap وتحسين دقة الوصف وتمييز أسماء الكتب
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
exports.sendMessage = async (req, res) => {
  try {
    const { messages, model, temperature = 0.7, max_tokens = 1000 } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'يجب توفير مصفوفة رسائل صالحة' });
    }

    // الحصول على آخر رسالة من المستخدم فقط
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const lastUserContent = lastUserMessage ? lastUserMessage.content.toLowerCase() : '';

    // تحقق إذا كان الاستعلام متعلق بمكتبة كنوز بناءً على آخر رسالة فقط
    if (isKenouzLibraryQuery(lastUserContent)) {
      // الرد مباشرة بمعلومات مكتبة كنوز دون استدعاء الذكاء الاصطناعي
      return res.status(200).json({
        success: true,
        data: {
          choices: [{
            message: {
              content: `<div dir="rtl">${KENOUZ_LIBRARY_INFO}</div>`
            }
          }]
        }
      });
    }

    // تحميل بيانات الكتب من sitemap
    const books = await loadBooksData();

    // تحقق إذا كان الاستعلام يحتوي على كلمات مفتاحية لتوصية الكتب
    const bookKeywords = ['كتاب', 'كتب', 'recommend', 'book', 'suggest', 'ترشح', 'قراءة', 'قرأت'];
    const isBookQuery = bookKeywords.some(keyword => lastUserContent.includes(keyword));

    let matchedBooks = [];
    if (isBookQuery) {
      matchedBooks = findMatchingBooks(lastUserContent, books);
    }

    // إذا تم العثور على كتب مطابقة، أضف عناوين الكتب إلى الرسائل كرسالة نظام لتحسين الوصف
    let enhancedMessages = [...messages];
    if (matchedBooks.length > 0) {
      const bookTitles = matchedBooks.map(book => book.title).join(', ');
      enhancedMessages.push({
        role: 'system',
        content: `هذه قائمة بعناوين الكتب التي قد تكون ذات صلة: ${bookTitles}. يرجى تضمين وصف دقيق ومفصل لهذه الكتب في الرد. كما يرجى تمييز أسماء الكتب في النص باستخدام علامات **bold** (أي بين علامتي نجمة مزدوجة).`
      });
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': req.headers.origin || 'https://yourwebsite.com',
      'X-Title': 'Your Website Chat'
    };
    const requestBody = {
      model: model || 'deepseek/deepseek-chat',
      messages: enhancedMessages,
      temperature,
      max_tokens,
    };
    const response = await axios.post(OPENROUTER_API_URL, requestBody, { headers });

    let combinedResponse = response.data;

    // لف محتوى رد المساعد بعنصر div مع اتجاه النص من اليمين إلى اليسار
    if (combinedResponse.choices && combinedResponse.choices.length > 0) {
      let content = combinedResponse.choices[0].message.content;
      // استبدال علامات **bold** بوسم span مع خلفية صفراء ونص عريض ولون نص داكن
      content = highlightBoldBookTitles(content);
      combinedResponse.choices[0].message.content = `<div dir="rtl">${content}</div>`;
    }

    // إذا تم العثور على كتب مطابقة، أضفها إلى الاستجابة مع تنسيق جدول HTML مع زر "اضغط هنا"
    // if (matchedBooks.length > 0) {
    //   const booksInfo = `<table style="width: 100%; border-collapse: collapse; direction: rtl;">
    //     <thead>
    //       <tr style="background-color: #3b82f6; color: white;">
    //         <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">عنوان الكتاب</th>
    //         <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">رابط</th>
    //       </tr>
    //     </thead>
    //     <tbody>
    //       ${matchedBooks.map(book => `
    //         <tr style="border-bottom: 1px solid #ddd;">
    //           <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${book.title}</td>
    //           <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">
    //             <a href="${book.url}" target="_blank" rel="noopener noreferrer" style="background-color: #3b82f6; color: white; padding: 4px 12px; border-radius: 4px; text-decoration: none; font-weight: bold;">اضغط هنا</a>
    //           </td>
    //         </tr>
    //       `).join('')}
    //     </tbody>
    //   </table>`;
    //   const additionalMessage = {
    //     role: 'system',
    //     content: `بناءً على طلبك، هذه بعض الكتب التي قد تهمك:<br>${booksInfo}`
    //   };
    //   // أضف الرسالة الإضافية إلى الرد
    //   if (!combinedResponse.choices || combinedResponse.choices.length === 0) {
    //     combinedResponse.choices = [{ message: additionalMessage }];
    //   } else {
    //     combinedResponse.choices[0].message.content += `<br><br>${additionalMessage.content}`;
    //   }
    // }

    return res.status(200).json({
      success: true,
      data: combinedResponse,
    });
  } catch (error) {
    console.error('خطأ في إرسال الرسالة إلى API الذكاء الاصطناعي:', error.response?.data || error.message);

    return res.status(error.response?.status || 500).json({
      success: false,
      message: 'حدث خطأ أثناء معالجة طلبك',
      error: error.response?.data || error.message,
    });
  }
};

/**
 * الحصول على قائمة النماذج المتاحة (اختياري)
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
exports.getAvailableModels = async (req, res) => {
  try {
    const headers = {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`
    };
    const response = await axios.get('https://openrouter.ai/api/v1/models', { headers });
    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error('خطأ في الحصول على النماذج المتاحة:', error.response?.data || error.message);

    return res.status(error.response?.status || 500).json({
      success: false,
      message: 'حدث خطأ أثناء الحصول على النماذج المتاحة',
      error: error.response?.data || error.message,
    });
  }
};
