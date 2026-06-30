const AIOrchestrator = require('../ai/services/ai-orchestrator.service');
const BookSearchService = require('../services/book-search.service');
const IntentAnalysisService = require('../services/intent-analysis.service');
const ConversationManagementService = require('../services/conversation-management.service');
const ConversationMemoryService = require('../services/conversation-memory.service');
const SearchContextService = require('../services/search-context.service');
const promptManager = require('../ai/services/prompt-manager.service');
const FollowupIntentResolver = require('../services/followup-intent-resolver.service');
const BookExclusionTracker = require('../services/book-exclusion-tracker.service');
const ResponseSanitizer = require('../services/response-sanitizer.service');
const { parseBookTokens, removeBookTokens } = require('../utils/book-token-parser');
const { containsFabricatedServicePromise, removeEmptyBoldMarkers, SAFE_FALLBACK_RESPONSE } = require('../utils/safety-checks');

// معلومات knoozbook
const KENOUZ_LIBRARY_INFO = `
knoozbook
العنوان: محافظة الدقهلية - مركز منية النصر - الرياض
رقم الهاتف: 01094612729
رابط الويب سايت: www.knoozbook.com
أوقات العمل: من 9 صباحاً حتى 9 مساءً
وهي أفضل وأول مكتبة إلكترونية في مصر مختصة في تجارة الكتب وطباعة ملفات PDF.
`;

/**
 * تحقق إذا كان الاستعلام متعلق بknoozbook
 */
function isKenouzLibraryQuery(query) {
  const keywords = [
    'knoozbook',
    'معلومات knoozbook',
    'عنوان knoozbook',
    'رقم هاتف knoozbook',
    'أوقات عمل knoozbook',
    'مواعيد عمل knoozbook',
    'كنوز',
    'kenouz'
  ];
  const lowerQuery = query.toLowerCase();

  for (const keyword of keywords) {
    if (lowerQuery.includes(keyword)) {
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

  const libraryWords = ['مكتبة', 'library', 'المكتبة', 'مكتبه', 'المكتبه'];
  if (libraryWords.some(word => lowerQuery.includes(word))) {
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
 * التحقق من طلب تغيير الكتب ("غيرهم"، "كتاب آخر"، إلخ)
 * @param {string} query - الاستعلام
 * @returns {boolean} - هل هو طلب تغيير
 */
function isChangeRequest(query) {
  const changeKeywords = [
    'غيرهم',
    'غيرهم',
    'كتاب آخر',
    'كتاب ثاني',
    'كتاب تاني',
    'رشح غيره',
    'رشح غيرها',
    'في غيره',
    'في غيرها',
    'بدل',
    'استبدل',
    'غير',
    'اخرى',
    'ثانية',
    'تانية',
    'جديد',
    'جديدة',
    'مختلف',
    'مختلفة'
  ];
  
  const lowerQuery = query.toLowerCase();
  return changeKeywords.some(keyword => lowerQuery.includes(keyword));
}

/**
 * استبدال علامات **bold** في النص بوسم span
 */
function highlightBoldBookTitles(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<span style="background-color: yellow; font-weight: bold; color: #222;">$1</span>');
}

/**
 * إرسال رسالة إلى خدمة الذكاء الاصطناعي - AI Sales Agent Version 1
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
exports.sendMessage = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      messages, 
      conversationId = null,
      userId = null,
      sessionId = null,
      model = 'gemini-2.5-flash',
      temperature = 0.7,
      max_tokens = 1000 
    } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'يجب توفير مصفوفة رسائل صالحة' });
    }

    // الحصول على آخر رسالة من المستخدم
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const lastUserContent = lastUserMessage ? lastUserMessage.content : '';

    // إدارة المحادثة
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      const conversation = await ConversationManagementService.createConversation({
        userId,
        sessionId,
        metadata: {
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip
        }
      });
      currentConversationId = conversation.conversationId;
    }

    // حفظ رسالة المستخدم
    await ConversationManagementService.addMessage(currentConversationId, 'user', lastUserContent);

    // التحقق من استعلام knoozbook
    if (isKenouzLibraryQuery(lastUserContent.toLowerCase())) {
      const response = `<div dir="rtl">${KENOUZ_LIBRARY_INFO}</div>`;
      await ConversationManagementService.addMessage(currentConversationId, 'assistant', response);
      
      return res.status(200).json({
        success: true,
        conversationId: currentConversationId,
        data: {
          choices: [{
            message: {
              content: response
            }
          }]
        }
      });
    }

    // الحصول على تاريخ المحادثة للتحقق من المتابعة
    const conversationHistory = await ConversationManagementService.getMessagesForAI(currentConversationId, 5);

    // تحليل نية العميل
    console.log('[ChatAI] Analyzing intent for message:', lastUserContent);

    // التحقق من نية شراء واضحة بدون نتيجة بحث (معالجة خاصة)
    const purchaseIntentPatterns = [
      /اطلبهالي/i,
      /موافق/i,
      /اشتريه/i,
      /حجزه/i,
      /ابعه لي/i,
      /أريده/i,
      /خذه لي/i,
      /ماشي/i,
      /تمام/i
    ];

    const hasPurchaseIntent = purchaseIntentPatterns.some(pattern => pattern.test(lastUserContent));

    // التحقق من آخر بحث فاشل
    const lastAssistantMessage = conversationHistory.find(m => m.role === 'assistant');
    const lastSearchFailed = lastAssistantMessage && (
      lastAssistantMessage.content.includes('غير متوفر حالياً') ||
      lastAssistantMessage.content.includes('لم أجد كتاباً')
    );

    // إذا كان هناك نية شراء واضحة وآخر بحث فشل، استجب مباشرة بدون AI
    if (hasPurchaseIntent && lastSearchFailed) {
      console.log('[ChatAI] Detected purchase intent after failed search, using direct response');
      const directResponse = `للأسف لا يوجد كتاب متاح لإتمام الطلب عليه حالياً.
تقدر تتواصل معنا مباشرة على 01094612729 للاستفسار عن إمكانية توفير الكتاب الذي تريده،
أو تصفح موقعنا www.knoozbook.com لمشاهدة الكتب المتاحة حالياً.`;

      await ConversationManagementService.addMessage(currentConversationId, 'assistant', directResponse, {
        performance: {
          processingTime: Date.now() - startTime,
          tokensUsed: 0,
          cost: 0
        }
      });

      return res.status(200).json({
        success: true,
        conversationId: currentConversationId,
        data: {
          choices: [{
            message: {
              content: `<div dir="rtl">${directResponse}</div>`
            }
          }],
          books: []
        },
        metadata: {
          processingTime: Date.now() - startTime,
          tokensUsed: 0,
          cost: 0,
          booksFound: 0,
          directResponseUsed: true
        }
      });
    }

    // التحقق من المتابعة
    const followupAnalysis = FollowupIntentResolver.analyzeWithFollowup(lastUserContent, conversationHistory);
    console.log('[ChatAI] Followup analysis:', JSON.stringify(followupAnalysis));
    
    // استخدام الرسالة الموسعة إذا كانت متابعة
    const messageToAnalyze = followupAnalysis.isFollowup ? followupAnalysis.expandedMessage : lastUserContent;
    
    const intentAnalysis = await IntentAnalysisService.analyzeIntent(messageToAnalyze);
    console.log('[ChatAI] Intent analysis result:', JSON.stringify(intentAnalysis));
    
    // البحث عن الكتب إذا لزم الأمر
    let availableBooks = [];
    let similarBooks = [];
    let recommendationMessage = null;
    let recommendationReason = null;
    let searchResult = null;
    
    // تحديد نوع الرسالة (continuation أو new topic)
    const messageType = SearchContextService.determineMessageType(messageToAnalyze, currentConversationId, intentAnalysis);
    console.log('[ChatAI] Message type:', messageType.type, '- Should reset context:', messageType.shouldReset);
    
    // تحديث سياق البحث
    SearchContextService.updateContext(currentConversationId, {
      currentIntent: intentAnalysis.intent,
      currentCategory: intentAnalysis.category,
      currentKeywords: intentAnalysis.keywords
    });
    
    if (IntentAnalysisService.requiresBookSearch(intentAnalysis)) {
      let searchQuery = IntentAnalysisService.buildSearchQuery(intentAnalysis);
      const searchOptions = IntentAnalysisService.buildSearchOptions(intentAnalysis);
      
      // إذا كان الـ intent هو search_book وفيه originalMessage أو اسم كتاب محدد،
      // استخدم الرسالة الأصلية مباشرة كـ search query بدل الـ keywords الموسعة
      // ده بيمنع إضافة categories مثل "موسيقى غناء آلات" على اسم كتاب زي "لأنك الله"
      if (intentAnalysis.intent === 'search_book' && lastUserContent) {
        const cleanOriginal = lastUserContent.replace(/^كتاب\s+/i, '').trim();
        // لو الرسالة الأصلية قصيرة (اسم كتاب) والـ searchQuery طويل جداً (> ضعفين)، استخدم الأصلي
        if (cleanOriginal.length > 0 && searchQuery.length > cleanOriginal.length * 2.5) {
          console.log('[ChatAI] Search query too expanded, using original:', cleanOriginal);
          searchQuery = cleanOriginal;
        }
      }
      
      // إذا كان موضوع جديد، لا نستخدم الكتب المستبعدة من المحادثة السابقة
      let excludedBookIds = [];
      if (messageType.type === 'continuation') {
        excludedBookIds = followupAnalysis.isFollowup ? followupAnalysis.excludedBooks : [];
      }
      
      console.log('[ChatAI] Excluded book IDs:', excludedBookIds);
      
      // التحقق من طلب "غيرهم" أو "كتاب آخر"
      const changeRequestDetected = isChangeRequest(messageToAnalyze);
      let searchOptionsToUse = { ...searchOptions, useRecommendationEngine: true };
      
      if (changeRequestDetected && messageType.type === 'continuation') {
        // استخدام Last Search Result واستبعاد الكتب السابقة
        const lastSearch = SearchContextService.getLastSearchResults(currentConversationId);
        if (lastSearch.results.length > 0) {
          const lastShownIds = lastSearch.results.map(b => b.id);
          excludedBookIds.push(...lastShownIds);
          console.log('[ChatAI] Change request detected, excluding last shown books:', lastShownIds);
          
          // استخدام نفس استعلام البحث الأخير
          if (lastSearch.query) {
            searchQuery = lastSearch.query;
          }
        }
      }
      
      // استخدام Sales Recommendation Engine مع Conversation Memory
      const searchResult = await BookSearchService.searchBooks(
        searchQuery || messageToAnalyze,
        searchOptionsToUse,
        excludedBookIds,
        currentConversationId,
        intentAnalysis
      );
      
      availableBooks = searchResult.books || [];
      recommendationMessage = searchResult.message || null;
      recommendationReason = searchResult.recommendationReason || null;
      
      // حفظ نتائج البحث في Search Context
      SearchContextService.saveSearchResults(currentConversationId, searchQuery || messageToAnalyze, availableBooks);
      
      // استخدام Recommendation Engine التقليدي إذا كانت النتائج قليلة
      if (availableBooks.length > 0 && availableBooks.length < 3) {
        availableBooks = await BookSearchService.getRecommendations(
          availableBooks,
          searchQuery || messageToAnalyze,
          5
        );
      }
      
      // الحصول على كتب مشابهة
      if (availableBooks.length > 0) {
        similarBooks = await BookSearchService.getSimilarBooks(availableBooks[0].id, 2);
      }
      
      // إضافة الكتب المقترحة لقائمة الاستبعاد
      if (availableBooks.length > 0) {
        BookExclusionTracker.addExclusions(currentConversationId, availableBooks.map(b => b.id));
      }
    }

    // بناء الـ prompt باستخدام Prompt Manager
    // إذا كانت النية general_inquiry ولا توجد كتب متاحة، لا نرسل تعليمات اقتراح كتب
    const shouldIncludeBooks = availableBooks.length > 0;
    const searchWasPerformed = IntentAnalysisService.requiresBookSearch(intentAnalysis);
    
    // تحديد نوع الطلب (محدد أو استكشافي)
    const requestType = intentAnalysis.requestType || 'exploratory';
    const request_type_is_specific = requestType === 'specific';
    const request_type_is_exploratory = requestType === 'exploratory';
    
    console.log('[ChatAI] Request Type:', requestType);
    
    // التحقق من عدم وجود الكتاب المطلوب
    const bookNotFound = searchResult?.bookNotFound || false;
    const requestedBook = searchResult?.requestedBook || null;
    
    const { system, user } = promptManager.getFullPrompt('sales', 'sales_chat', {
      message: lastUserContent,
      conversation_history: conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n'),
      available_books: shouldIncludeBooks ? BookSearchService.formatBooksForAI(availableBooks) : 'لا توجد كتب متاحة حالياً',
      similar_books: shouldIncludeBooks ? BookSearchService.formatBooksForAI(similarBooks) : '',
      recommendation_message: shouldIncludeBooks ? recommendationMessage : null,
      recommendation_reason: shouldIncludeBooks ? recommendationReason : null,
      search_was_performed: searchWasPerformed,
      request_type_is_specific: request_type_is_specific,
      request_type_is_exploratory: request_type_is_exploratory,
      book_not_found: bookNotFound,
      requested_book: requestedBook
    });

    // تنفيذ AI باستخدام AI Orchestrator مع fallback
    console.log('[ChatAI] Executing AI Orchestrator with fallback...');
    const aiResult = await AIOrchestrator.executeWithFallback('sales_chat', {
      message: lastUserContent,
      conversation_history: conversationHistory,
      available_books: availableBooks,
      similar_books: similarBooks
    }, {
      prompt: user,
      systemPrompt: system,
      provider: 'gemini',
      temperature: temperature,
      maxTokens: max_tokens,
      skipCache: false
    });
    console.log('[ChatAI] AI Orchestrator result:', JSON.stringify(aiResult));

    const processingTime = Date.now() - startTime;
    
    // عداد لعدد استدعاءات AI provider
    let aiCallCount = 1; // الاستدعاء الأول بالفعل تم

      if (aiResult.success) {
      let response = aiResult.text || '';

      // الحارس الأخير: فحص الرد لاكتشاف وعود بخدمات غير موجودة
      const safetyCheck = containsFabricatedServicePromise(response);
      if (safetyCheck.isSuspicious) {
        console.error('[ChatAI] SECURITY ALERT: AI response contains fabricated service promises!');
        console.error('[ChatAI] Detected patterns:', safetyCheck.detectedPatterns.join(', '));
        console.error('[ChatAI] Original rejected response:', response);

        // استبدال الرد برد آمن موحد
        response = SAFE_FALLBACK_RESPONSE;

        // تسجيل الحدث للمراجعة
        await ConversationManagementService.addMessage(currentConversationId, 'assistant', response, {
          intentAnalysis,
          securityAlert: {
            type: 'FABRICATED_SERVICE_PROMISE',
            detectedPatterns: safetyCheck.detectedPatterns,
            originalResponse: aiResult.text
          },
          performance: {
            processingTime: Date.now() - startTime,
            tokensUsed: aiResult.tokens?.total || 0,
            cost: aiResult.cost || 0
          }
        });

        return res.status(200).json({
          success: true,
          conversationId: currentConversationId,
          data: {
            choices: [{
              message: {
                content: `<div dir="rtl">${response}</div>`
              }
            }],
            books: []
          },
          metadata: {
            processingTime: Date.now() - startTime,
            tokensUsed: aiResult.tokens?.total || 0,
            cost: aiResult.cost || 0,
            booksFound: 0,
            intent: intentAnalysis.intent,
            securityAlert: true,
            securityAlertType: 'FABRICATED_SERVICE_PROMISE'
          }
        });
      }

      // التحقق من صحة تنسيق BOOK token - فقط إذا كانت هناك كتب متاحة
      if (availableBooks.length > 0) {
        console.log('[ChatAI] Validating BOOK token format...');
        const isValidFormat = validateBookTokenFormat(response);
        
        if (!isValidFormat) {
          console.warn('[ChatAI] BOOK token format invalid, retrying once...');
          aiCallCount++;
          // إعادة المحاولة مرة واحدة إذا كان التنسيق غير صحيح
          // استخدام provider مختلف لتوزيع الحمل
          const retryProvider = aiResult.provider === 'gemini' ? 'groq' : 'gemini';
          const retryResult = await AIOrchestrator.executeWithFallback('sales_chat', {
            message: lastUserContent,
            conversation_history: conversationHistory,
            available_books: availableBooks,
            similar_books: similarBooks
          }, {
            prompt: user,
            systemPrompt: system,
            provider: retryProvider,
            temperature: temperature,
            maxTokens: Math.floor(max_tokens * 0.8), // تقليل التوكنز في retry
            skipCache: true // تخطي الكاش عند إعادة المحاولة
          });
          
          if (retryResult.success) {
            response = retryResult.text || '';
            console.log('[ChatAI] Retry successful with provider:', retryResult.provider);
          } else {
            console.error('[ChatAI] Retry failed, using original response');
          }
        }
      }
      
      // استخراج الكتب من النص الخام **قبل** التنظيف
      // هذا مهم جداً: يجب أن يتم الاستخراج قبل أن يقوم Sanitizer باستبدال الـ tokens
      console.log('[ChatAI] Extracting books from raw response...');
      const books = extractBooksFromResponse(response, availableBooks);
      console.log('[ChatAI] Extracted books:', JSON.stringify(books));
      
      // تنظيف الرد باستخدام Response Sanitizer
      console.log('[ChatAI] Sanitizing response...');
      const sanitizedResult = await ResponseSanitizer.sanitizeWithRegeneration(
        response,
        availableBooks,
        async () => {
          // إعادة التوليد إذا فشل التنظيف
          aiCallCount++;
          // استخدام provider مختلف وتقليل maxTokens
          const regenProvider = aiResult.provider === 'gemini' ? 'groq' : 'gemini';
          const retryResult = await AIOrchestrator.executeWithFallback('sales_chat', {
            message: lastUserContent,
            conversation_history: conversationHistory,
            available_books: availableBooks,
            similar_books: similarBooks
          }, {
            prompt: user,
            systemPrompt: system,
            provider: regenProvider,
            temperature: temperature,
            maxTokens: Math.floor(max_tokens * 0.7), // تقليل أكبر في regeneration
            skipCache: true // تخطي الكاش عند إعادة التوليد
          });
          console.log('[ChatAI] Regeneration attempt with provider:', regenProvider);
          return retryResult.text || '';
        }
      );
      
      response = sanitizedResult.cleanedResponse;
      const chatButtons = sanitizedResult.buttons || [];
      console.log('[ChatAI] Sanitization result:', JSON.stringify(sanitizedResult));
      console.log('[ChatAI] Extracted buttons:', JSON.stringify(chatButtons));
      
      // إزالة تنسيق الكتب من النص النهائي (للتأكد من إزالة أي tokens متبقية)
      response = removeBookTags(response);

      // إزالة علامات ** الفاضية (بعد فشل استبدال كتاب غير موجود)
      response = removeEmptyBoldMarkers(response);

      // تنسيق الرد
      response = highlightBoldBookTitles(response);
      response = `<div dir="rtl">${response}</div>`;

      // حفظ رد المساعد
      await ConversationManagementService.addMessage(currentConversationId, 'assistant', response, {
        intentAnalysis,
        recommendedBooks: availableBooks.slice(0, 3).map(book => ({
          bookId: book.id,
          bookTitle: book.title,
          reason: 'مطابق لطلب البحث'
        })),
        performance: {
          processingTime,
          tokensUsed: aiResult.tokens?.total || 0,
          cost: aiResult.cost || 0
        },
        modelMetadata: {
          model: aiResult.model,
          provider: aiResult.provider
        }
      });

      // تسجيل عدد استدعاءات AI provider
      console.log(`[ChatAI] Total AI calls for this message: ${aiCallCount}`);

      // تحديث ملف العميل
      if (intentAnalysis.category) {
        await ConversationManagementService.updateCustomerProfile(currentConversationId, {
          preferredCategories: [intentAnalysis.category],
          lastSearchQuery: lastUserContent
        });
      }

      return res.status(200).json({
        success: true,
        conversationId: currentConversationId,
        data: {
          choices: [{
            message: {
              content: response
            }
          }],
          books: books, // إرجاع الكتب بشكل منفصل للواجهة الأمامية
          buttons: chatButtons // إرجاع الأزرار للواجهة الأمامية
        },
        metadata: {
          processingTime,
          tokensUsed: aiResult.tokens?.total || 0,
          cost: aiResult.cost || 0,
          booksFound: availableBooks.length,
          intent: intentAnalysis.intent
        }
      });
    } else {
      // AI providers failed - check if we have books from search to provide fallback
      if (availableBooks.length > 0) {
        // Generate fallback response using available books without AI call
        const fallbackBooks = availableBooks.slice(0, 3).map(b => ({
          id: b.id,
          title: b.title,
          author: b.author || 'غير محدد',
          price: b.price,
          buyUrl: b.buyUrl || b.url || '#'
        }));
        
        const fallbackText = `بناءً على بحثك، وجدت هذه الكتب التي قد تناسبك:\n\n${fallbackBooks.map((book, i) => 
          `${i + 1}. ${book.title} - ${book.price} ج.م`
        ).join('\n')}\n\nإذا كنت محتار، أنصحك بالبدء بكتاب "${fallbackBooks[0].title}".`;
        
        await ConversationManagementService.addMessage(currentConversationId, 'assistant', fallbackText, {
          intentAnalysis,
          recommendedBooks: fallbackBooks.map(book => ({
            bookId: book.id,
            bookTitle: book.title,
            reason: 'مطابق لطلب البحث (fallback response)'
          })),
          performance: {
            processingTime,
            tokensUsed: 0,
            cost: 0
          }
        });
        
        return res.status(200).json({
          success: true,
          conversationId: currentConversationId,
          data: {
            choices: [{
              message: {
                content: `<div dir="rtl">${fallbackText}</div>`
              }
            }],
            books: fallbackBooks
          },
          metadata: {
            processingTime,
            tokensUsed: 0,
            cost: 0,
            booksFound: availableBooks.length,
            intent: intentAnalysis.intent,
            fallbackUsed: true,
            aiProvidersFailed: true
          }
        });
      }
      
      // No books available - provide helpful contact info
      const fallbackMessage = 'كل الأنظمة مشغولة حالياً. يمكنك:\n• التواصل معنا مباشرة على 01094612729\n• زيارة موقعنا www.knoozbook.com\n• تصفح الكتب المتاحة في المكتبة';
      
      await ConversationManagementService.addMessage(currentConversationId, 'assistant', fallbackMessage, {
        performance: {
          processingTime,
          tokensUsed: 0,
          cost: 0
        }
      });
      
      return res.status(200).json({
        success: true,
        conversationId: currentConversationId,
        data: {
          choices: [{
            message: {
              content: `<div dir="rtl">${fallbackMessage}</div>`
            }
          }],
          books: []
        },
        metadata: {
          processingTime,
          tokensUsed: 0,
          cost: 0,
          booksFound: 0,
          intent: intentAnalysis.intent,
          fallbackUsed: true,
          aiProvidersFailed: true
        }
      });
    }
  } catch (error) {
    console.error('Error in sendMessage:', error);
    
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في معالجة طلبك',
      error: error.message
    });
  }
};

/**
 * التحقق من صحة تنسيق BOOK token
 * يدعم الصيغة الجديدة [BOOK:title] والصيغة القديمة [BOOK:id:title:author:price:url]
 * @param {string} response - رد AI
 * @returns {boolean} - true إذا كان التنسيق صحيح
 */
function validateBookTokenFormat(response) {
  // التحقق من الصيغة الجديدة [BOOK:title]
  const newFormatRegex = /\[BOOK:[^\]]+\]/g;
  const newMatches = response.match(newFormatRegex);
  
  // التحقق من الصيغة القديمة [BOOK:id:title:author:price:url]
  const oldFormatRegex = /\[BOOK:[^:]+:[^:]+:[^:]+:[^:]+:[^\]]+\]/g;
  const oldMatches = response.match(oldFormatRegex);
  
  // إذا كان هناك أي تنسيق صحيح (جديد أو قديم)، نعتبره صحيح
  return (newMatches && newMatches.length > 0) || (oldMatches && oldMatches.length > 0);
}

/**
 * استخراج الكتب من التنسيق الهيكلي [BOOK:id:title:author:price:url] أو [BOOK:title]
 * @param {string} response - رد AI
 * @param {Array} availableBooks - الكتب المتاحة للمطابقة
 * @returns {Array} - مصفوفة الكتب
 */
function extractBooksFromResponse(response, availableBooks = []) {
  let books = parseBookTokens(response, availableBooks);
  
  // De-duplication: إزالة الكتب المكررة (نفس ID)
  const uniqueBooks = Object.values(
    books.reduce((acc, book) => {
      if (!acc[book.id]) {
        acc[book.id] = book;
      }
      return acc;
    }, {})
  );
  
  // فلترة نهائية: استبعاد أي كارد فاضي أو بـ id غير صالح
  const filteredBooks = uniqueBooks.filter(book => {
    // استبعاد id غير صالح (undefined, null, فارغ)
    if (!book.id || book.id === 'undefined' || book.id === 'null' || book.id === '') {
      console.warn('[extractBooksFromResponse] Excluding book with invalid id:', book.id);
      return false;
    }
    
    // استبعاد title غير صالح
    if (!book.title || book.title === 'غير محدد' || book.title === 'undefined' || book.title === 'null') {
      console.warn('[extractBooksFromResponse] Excluding book with invalid title:', book.title);
      return false;
    }
    
    // استبعاد buyUrl غير صالح أو يحتوي على undefined
    if (!book.buyUrl || book.buyUrl === '#' || book.buyUrl.includes('/undefined/') || book.buyUrl.includes('/null/')) {
      console.warn('[extractBooksFromResponse] Excluding book with invalid buyUrl:', book.buyUrl);
      return false;
    }
    
    // استبعاد الروابط التجريبية (example.com)
    if (book.buyUrl.includes('example.com')) {
      console.warn('[extractBooksFromResponse] Excluding book with example.com URL:', book.buyUrl);
      return false;
    }
    
    return true;
  });
  
  return filteredBooks;
}

/**
 * إزالة تنسيق الكتب من النص
 * @param {string} response - رد AI
 * @returns {string} - النص بدون تنسيق الكتب
 */
function removeBookTags(response) {
  return removeBookTokens(response);
}

/**
 * تمييز عناوين الكتب بالـ bold
 * @param {string} text - النص
 * @returns {string} - النص مع عناوين الكتب مميزة
 */
function highlightBoldBookTitles(text) {
  // تمييز عناوين الكتب بين علامات **bold**
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/**
 * الحصول على قائمة النماذج المتاحة من AI Orchestrator
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
exports.getAvailableModels = async (req, res) => {
  try {
    const models = await AIOrchestrator.getAvailableModels('gemini');
    return res.status(200).json({
      success: true,
      data: models
    });
  } catch (error) {
    console.error('Error in getAvailableModels:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الحصول على النماذج المتاحة',
      error: error.message
    });
  }
};

/**
 * الحصول على محادثة بواسطة ID
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
exports.getConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    const conversation = await ConversationManagementService.getConversation(conversationId);
    const messages = await ConversationManagementService.getMessages(conversationId);
    const stats = await ConversationManagementService.getConversationStats(conversationId);

    return res.status(200).json({
      success: true,
      conversation,
      messages,
      stats
    });
  } catch (error) {
    console.error('Error in getConversation:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الحصول على المحادثة',
      error: error.message
    });
  }
};