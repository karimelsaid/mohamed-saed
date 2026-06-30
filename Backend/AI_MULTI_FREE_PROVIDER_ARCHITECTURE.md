# AI Multi-Free-Provider Architecture

## نظرة عامة

تم تحديث AI Orchestrator ليعتمد 100% على مزودين مجانيين (Free AI Providers) مع الحفاظ على البنية production-ready وسهولة التبديل إلى مزودين مدفوعين لاحقاً.

## المزودون المدعومون

### 1. Google Gemini (Primary)
- **المزود**: `gemini`
- **الموديلات**:
  - `gemini-2.5-flash` (افتراضي)
  - `gemini-2.5-flash-lite`
  - `gemini-2.5-pro` (اختياري)
- **التكلفة**: مجاني حالياً
- **الأولوية**: 1

### 2. Groq
- **المزود**: `groq`
- **الموديلات**:
  - `llama-3.3-70b-versatile` (افتراضي)
  - `llama-3.1-8b-instant`
  - `llama-3.1-70b-versatile`
  - `mixtral-8x7b-32768`
  - `gemma-7b-it`
  - `gemma2-9b-it`
- **التكلفة**: مجاني حالياً
- **الأولوية**: 2

### 3. Cerebras
- **المزود**: `cerebras`
- **الموديلات**:
  - `llama3.1-70b` (افتراضي)
  - `llama3.1-8b`
  - `llama3-70b`
  - `llama3-8b`
  - `mixtral-8x7b`
- **التكلفة**: مجاني حالياً
- **الأولوية**: 3

### 4. GitHub Models
- **المزود**: `github_models`
- **الموديلات**:
  - `gpt-4.1-mini` (افتراضي)
  - `phi-4`
  - `mistral-small`
  - `llama-3.3-70b`
  - `llama-3.1-70b`
- **التكلفة**: مجاني مع GitHub
- **الأولوية**: 4

### 5. OpenRouter (Last Resort)
- **المزود**: `openrouter`
- **الموديلات (مجانية فقط)**:
  - `google/gemma-3-27b-it:free` (افتراضي)
  - `google/gemma-3-12b-it:free`
  - `mistralai/mistral-small-3.2-24b-instruct:free`
  - `meta-llama/llama-3.3-70b-instruct:free`
  - `deepseek/deepseek-chat-v3:free`
  - `google/gemma-2-9b-it:free`
  - `meta-llama/llama-3-8b-instruct:free`
- **التكلفة**: مجاني فقط
- **الأولوية**: 5

## نظام Automatic Failover

### ترتيب الفشل التلقائي

```
Gemini (Priority 1)
    ↓ (فشل)
Groq (Priority 2)
    ↓ (فشل)
Cerebras (Priority 3)
    ↓ (فشل)
GitHub Models (Priority 4)
    ↓ (فشل)
OpenRouter (Priority 5)
```

### شروط الفشل

يتم التبديل تلقائياً إلى المزود التالي في الحالات التالية:
- Rate Limit (HTTP 429)
- Timeout
- Network Error
- Provider Unavailable
- Temporary Error
- Health Check Failure

### Health Monitoring

- **فحص دوري**: كل 2 دقيقة
- **Cache TTL**: 5 دقائق
- **تخطي تلقائي**: المزودون غير الصحيين يتم تخطيهم تلقائياً

## الإعدادات

### Environment Variables

```bash
# Gemini (Required)
GEMINI_API_KEY=your_gemini_api_key

# Groq (Optional)
GROQ_API_KEY=your_groq_api_key

# Cerebras (Optional)
CEREBRAS_API_KEY=your_cerebras_api_key

# GitHub Models (Optional)
GITHUB_TOKEN=your_github_token
# أو
GITHUB_MODELS_API_KEY=your_github_models_api_key

# OpenRouter (Optional)
OPENROUTER_API_KEY=your_openrouter_api_key
```

### AI Config (ai.config.js)

```javascript
{
  defaultProvider: 'gemini',
  
  providers: {
    gemini: {
      enabled: true,
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      defaultModel: 'gemini-2.5-flash',
      timeout: 30000,
      priority: 1
    },
    groq: {
      enabled: true,
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b-versatile',
      timeout: 30000,
      priority: 2
    },
    cerebras: {
      enabled: true,
      apiKey: process.env.CEREBRAS_API_KEY,
      baseURL: 'https://api.cerebras.ai/v1',
      defaultModel: 'llama3.1-70b',
      timeout: 30000,
      priority: 3
    },
    github_models: {
      enabled: true,
      apiKey: process.env.GITHUB_TOKEN,
      baseURL: 'https://models.inference.ai.azure.com',
      defaultModel: 'gpt-4.1-mini',
      timeout: 30000,
      priority: 4
    },
    openrouter: {
      enabled: true,
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultModel: 'google/gemma-3-27b-it:free',
      timeout: 30000,
      priority: 5
    }
  },
  
  fallback: {
    enabled: true,
    fallbackProviders: ['gemini', 'groq', 'cerebras', 'github_models', 'openrouter'],
    fallbackThreshold: 1
  }
}
```

## الاستخدام

### الاستخدام الأساسي

```javascript
const aiOrchestrator = require('./ai/services/ai-orchestrator.service');

// تنفيذ مهمة مع automatic failover
const result = await aiOrchestrator.executeWithFallback('sales_chat', {
  message: 'أبحث عن كتاب روايات',
  conversation_history: []
}, {
  temperature: 0.7,
  maxTokens: 1000
});

console.log('Provider used:', result.provider);
console.log('Fallback used:', result.fallbackUsed);
console.log('Text:', result.text);
```

### تحديد مزود محدد

```javascript
const result = await aiOrchestrator.execute('sales_chat', data, {
  provider: 'groq',
  model: 'llama-3.3-70b-versatile'
});
```

### الحصول على حالة الصحة

```javascript
// الحصول على حالة جميع المزودين
const healthStatus = await aiOrchestrator.getHealthStatus();
console.log(healthStatus);

// الحصول على إحصائيات الصحة
const healthStats = aiOrchestrator.getHealthStats();
console.log(healthStats);
```

## Provider Adapters

### إنشاء مزود جديد

1. إنشاء ملف جديد في `ai/providers/`:
   ```javascript
   const axios = require('axios');
   const AIProvider = require('../base/provider.interface');

   class NewProvider extends AIProvider {
     constructor(config) {
       super(config);
       this.apiKey = config.apiKey || process.env.NEW_PROVIDER_API_KEY;
       this.baseURL = config.baseURL || 'https://api.newprovider.com/v1';
       this.defaultModel = config.defaultModel || 'default-model';
       this.timeout = config.timeout || 30000;
       
       this.pricing = {
         'default-model': { input: 0, output: 0 }
       };
     }

     async generateText(params) {
       // تنفيذ generateText
     }

     async generateJSON(params) {
       // تنفيذ generateJSON
     }

     async generateEmbedding(params) {
       // تنفيذ generateEmbedding
     }

     async getAvailableModels() {
       // تنفيذ getAvailableModels
     }

     validateConfig() {
       // تنفيذ validateConfig
     }

     calculateCost(usage, model) {
       // تنفيذ calculateCost
     }

     async healthCheck() {
       // تنفيذ healthCheck
     }
   }

   module.exports = NewProvider;
   ```

2. إضافة المزود في `ai.config.js`:
   ```javascript
   new_provider: {
     enabled: true,
     apiKey: process.env.NEW_PROVIDER_API_KEY,
     baseURL: 'https://api.newprovider.com/v1',
     defaultModel: 'default-model',
     timeout: 30000,
     priority: 6
   }
   ```

3. إضافة المزود في `ai-orchestrator.service.js`:
   ```javascript
   const NewProvider = require('../providers/new-provider.provider');

   // في initializeProviders()
   const newProviderConfig = this.config.getProviderConfig('new_provider');
   if (newProviderConfig.enabled) {
     this.providers.set('new_provider', new NewProvider(newProviderConfig));
   }
   ```

## الميزات

### ✅ الميزات الحالية

- **Automatic Failover**: تبديل تلقائي بين المزودين
- **Health Monitoring**: فحص دوري لصحة المزودين
- **Config-Driven**: كل شيء قابل للتكوين من `ai.config.js`
- **Cost Tracking**: تتبع التكلفة والاستخدام
- **Retry Logic**: إعادة المحاولة مع exponential backoff
- **Caching**: تخزين مؤقت للنتائج
- **Rate Limiting**: تحديد المعدل

### 🔄 الميزات المحفوظة

- AI Orchestrator
- Prompt Manager
- AI Logger
- Conversation Management
- AI Sales Agent
- Book Search
- Intent Analysis
- Social Media Automation

## التبديل إلى Production

### تفعيل المزودين المدفوعين

1. تفعيل OpenAI:
   ```javascript
   openai: {
     enabled: true,
     apiKey: process.env.OPENAI_API_KEY,
     baseURL: 'https://api.openai.com/v1',
     defaultModel: 'gpt-4o-mini',
     timeout: 30000,
     priority: 0 // أعلى أولوية
   }
   ```

2. تحديث ترتيب الأولوية حسب الحاجة

3. إضافة المزودين المدفوعين إلى `fallbackProviders`

## Troubleshooting

### مشكلة: All providers failed

**الحل**:
1. تحقق من API Keys في `.env`
2. تحقق من حالة الصحة:
   ```javascript
   const healthStatus = await aiOrchestrator.getHealthStatus();
   console.log(healthStatus);
   ```
3. تحقق من logs في console

### مشكلة: Rate Limit

**الحل**:
- النظام سيتبديل تلقائياً إلى المزود التالي
- يمكن زيادة `fallbackThreshold` في config

### مشكلة: Provider Unhealthy

**الحل**:
- Health Monitor سيقوم بتخطي المزود تلقائياً
- يمكن force refresh:
  ```javascript
  await healthMonitor.forceRefresh();
  ```

## الأداء

### أوقات الاستجابة المتوقعة

- **Gemini**: ~1-2 ثانية
- **Groq**: ~0.5-1 ثانية (الأسرع)
- **Cerebras**: ~0.5-1 ثانية (الأسرع)
- **GitHub Models**: ~1-2 ثانية
- **OpenRouter**: ~1-3 ثانية

### التكلفة

جميع المزودين المذكورين مجانيون حالياً. عند التبديل إلى مزودين مدفوعين، سيتم تتبع التكلفة تلقائياً.

## التوثيق الإضافي

- [AI Sales Agent Migration](./AI_SALES_AGENT_V1_MIGRATION.md)
- [Debug Report](./AI_SALES_AGENT_DEBUG_REPORT.md)
