# KnoozBook Automation Architecture Document

**Version:** 1.0  
**Last Updated:** June 26, 2026  
**Status:** Draft

---

## 1. System Architecture Map

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                          │
│  Angular Dashboard (Admin & User)                                │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST API
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Layer (Node.js)                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Product API  │  │  User API    │  │ Order API    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ AI Orchestrator│ │ Automation  │  │ Analytics    │          │
│  │ Service      │  │ API         │  │ API          │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP / Webhooks
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Automation Layer (n8n)                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Social Media Automation Workflow            │  │
│  │  Trigger: Product Created → Facebook/Instagram Post      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  AI Sales Agent Workflow                  │  │
│  │  Trigger: Comment/DM → AI Analysis → Reply               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Analytics Collection Workflow                 │  │
│  │  Trigger: Cron (Hourly) → Fetch Metrics → MongoDB        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Event Tracking Workflow                      │  │
│  │  Trigger: User Events → Classify → Track → Aggregate     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Notification Workflow                         │  │
│  │  Trigger: Various Events → Email/SMS/WhatsApp             │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer (MongoDB)                         │
│                                                                  │
│  Collections:                                                    │
│  - Products                                                      │
│  - Users                                                         │
│  - Orders                                                        │
│  - AutomationLogs                                                │
│  - AutomationSettings                                            │
│  - AnalyticsEvents                                               │
│  - SocialMediaMetrics                                            │
└─────────────────────────────────────────────────────────────────┘

External Services:
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Facebook    │  │  Instagram   │  │  OpenAI/Claude│
│  Graph API   │  │  Graph API   │  │  AI API      │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 2. Workflow Catalog

| Workflow | الهدف | Trigger | ينتهي بـ | Priority | Status |
|----------|-------|---------|----------|----------|--------|
| Social Media Automation | نشر المنتجات الجديدة على وسائل التواصل | Product Created Event | Facebook/Instagram Post | High | ✅ V3 Implemented |
| AI Sales Agent | الرد الذكي على الاستفسارات والتعليقات | Comment/DM Webhook | Reply to User | High | ⏳ V1 (Needs V2) |
| Analytics Collection | جمع الإحصائيات من المنصات الاجتماعية | Cron (Hourly) | MongoDB Update | Medium | ⏳ Pending |
| Event Tracking | تتبع أحداث المستخدمين (نقرات، مشاهدات، إلخ) | User Events | MongoDB Log | Medium | ✅ V1 Implemented |
| Book Recommendation | اقتراح كتب بناءً على سلوك المستخدم | User Event | AI Response | Medium | ⏳ Pending |
| WhatsApp Closing | متابعة العملاء المحتملين عبر واتساب | Hot Lead Trigger | WhatsApp Message | High | ⏳ Pending |
| SEO Monitor | متابعة ترتيب الموقع في محركات البحث | Cron (Daily) | Dashboard Alert | Low | ⏳ Pending |
| Inventory Alert | تنبيه عند انخفاض المخزون | Inventory Check | Admin Notification | Medium | ⏳ Pending |
| Price Optimization | تحسين الأسعار بناءً على الطلب | Cron (Weekly) | Price Update | Low | ⏳ Pending |
| Customer Retention | حملات الاحتفاظ بالعملاء | User Inactivity | Email/SMS Campaign | Medium | ⏳ Pending |

---

## 3. Event Map

### Product Lifecycle Events

```
Product Created
    │
    ├── Triggered By: Admin (Backend)
    ├── Logged By: Backend (AutomationLog)
    ├── Consumed By: Social Media Automation Workflow (n8n)
    │
    ├──→ Post Published (Facebook/Instagram)
    │       │
    │       ├── Logged By: Backend (AutomationLog)
    │       ├── Consumed By: Analytics Collection Workflow
    │       │
    │       └──→ User Click (UTM Tracked)
    │               │
    │               ├── Logged By: Backend (AnalyticsEvents)
    │               ├── Consumed By: Event Tracking Workflow
    │               │
    │               └──→ Product View
    │                       │
    │                       ├── Logged By: Backend (AnalyticsEvents)
    │                       ├── Consumed By: Book Recommendation Workflow
    │                       │
    │                       └──→ Add To Cart
    │                               │
    │                               ├── Logged By: Backend (AnalyticsEvents)
    │                               └──→ Checkout
    │                                       │
    │                                       ├── Logged By: Backend (Orders)
    │                                       └──→ Purchase
    │                                               │
    │                                               ├── Logged By: Backend (Orders)
    │                                               ├── Consumed By: Customer Retention Workflow
    │                                               └──→ WhatsApp Closing Workflow
```

### User Engagement Events

```
User Comment/DM
    │
    ├── Triggered By: Facebook/Instagram
    ├── Logged By: Backend (AutomationLog)
    ├── Consumed By: AI Sales Agent Workflow (n8n)
    │
    └──→ AI Analysis (Intent Detection)
            │
            └──→ AI Response Generation
                    │
                    └──→ Reply Posted
                            │
                            └──→ User Engagement Tracked
```

### System Events

```
Inventory Low
    │
    ├── Triggered By: Backend (Inventory Check)
    ├── Logged By: Backend (AutomationLog)
    ├── Consumed By: Inventory Alert Workflow (n8n)
    │
    └──→ Admin Notification (Email/SMS)
```

---

## 4. API Map

### Automation API Endpoints

| Method | Endpoint | الوصف | Request | Response |
|--------|----------|-------|---------|----------|
| POST | `/api/automation/product-created` | Trigger when product created | `{ productId, event }` | `{ success, message }` |
| GET | `/api/automation/product/:id` | Fetch product by ID | - | `{ success, product }` |
| GET | `/api/automation/random-product` | Fetch random approved product | - | `{ success, product }` |
| POST | `/api/automation/ai/generate-content` | Generate AI content (Backend Orchestrated) | `{ product, platform }` | `{ success, content }` |
| POST | `/api/automation/ai/execute` | AI Orchestrator (Unified AI Service) | `{ task, data }` | `{ success, result }` |
| POST | `/api/automation/log` | Log automation events | `{ type, platform, status, details }` | `{ success, logId }` |
| GET | `/api/automation/logs` | Fetch automation logs | `{ page, limit, type, status }` | `{ success, logs, total }` |
| GET | `/api/automation/dashboard` | Get dashboard stats | - | `{ success, settings, stats, recentLogs }` |
| PATCH | `/api/automation/settings` | Update automation settings | `{ updates }` | `{ success, settings }` |
| POST | `/api/automation/track` | Track user events | `{ eventType, productId, userId, metadata }` | `{ success, logId }` |
| POST | `/api/automation/aggregate` | Aggregate analytics metrics | `{ timeRange }` | `{ success, metrics }` |
| POST | `/api/automation/trigger-promotion` | Trigger auto promotion | `{ productId, reason, metrics }` | `{ success, message }` |
| POST | `/api/automation/ai-analyze` | AI intent analysis | `{ message, platform, userId }` | `{ success, intent, category }` |
| GET | `/api/automation/recommend-books` | Recommend books | `{ category, limit }` | `{ success, recommendations }` |

### AI Orchestrator API Endpoints

| Method | Endpoint | الوصف | Request | Response |
|--------|----------|-------|---------|----------|
| POST | `/api/ai/execute` | Execute AI task (Unified Service) | `{ task, data, options }` | `{ success, result, cost, model }` |

### Supported AI Tasks

| Task | الوصف | Model | Output |
|------|-------|-------|--------|
| `generate_caption` | Generate social media caption | GPT-4o-mini | `{ caption, hashtags, cta, tone }` |
| `sales_reply` | Generate sales reply | GPT-4o-mini | `{ response, intent, followUp }` |
| `recommend_books` | Recommend books | GPT-4o-mini | `{ recommendations, reasoning }` |
| `analyze_sentiment` | Analyze text sentiment | GPT-4o-mini | `{ sentiment, confidence, emotions }` |
| `summarize_content` | Summarize long content | GPT-4o-mini | `{ summary, keyPoints }` |
| `generate_seo` | Generate SEO content | GPT-4o-mini | `{ title, description, keywords }` |

---

## 5. AI Services

### AI Agents Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Orchestrator Service                        │
│  (Backend Service - Single Entry Point for All AI Operations)    │
│                                                                  │
│  Responsibilities:                                               │
│  - Task Routing                                                  │
│  - Model Selection                                                │
│  - Cost Tracking                                                  │
│  - Response Caching                                              │
│  - Performance Monitoring                                         │
│  - A/B Testing Support                                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┬───────────────┐
         ▼               ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Marketing AI │ │  Sales AI    │ │  SEO AI      │ │ Support AI   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
   Caption/Hashtags  Sales Replies   SEO Content    Customer Support
   CTA Generation   Intent Analysis  Keywords       FAQ Answers
   Tone Adjustment  Lead Scoring    Meta Tags      Sentiment Analysis
```

### Marketing AI

**Purpose:** Generate marketing content for social media and campaigns

**Capabilities:**
- Caption generation with brand voice
- Hashtag optimization (3-5 relevant hashtags)
- CTA generation
- Tone adjustment based on category
- A/B testing support

**Model:** GPT-4o-mini (cost-effective, fast)

**Prompt Strategy:**
- Brand personality: "Official Marketing Manager of KnoozBook"
- Tone: Friendly, professional, motivating
- Language: Egyptian Arabic (simple, warm)
- Constraints: Max 150 words, 2-3 emojis max, no spoilers for novels

### Sales AI

**Purpose:** Handle customer inquiries and convert leads

**Capabilities:**
- Intent detection (purchase, inquiry, complaint)
- Lead scoring
- Personalized responses
- Follow-up generation
- WhatsApp closing

**Model:** GPT-4o-mini

**Prompt Strategy:**
- Brand personality: "Sales Representative of KnoozBook"
- Tone: Helpful, persuasive, not pushy
- Language: Egyptian Arabic
- Context-aware responses based on product category

### SEO AI

**Purpose:** Optimize content for search engines

**Capabilities:**
- Title generation
- Meta description
- Keyword extraction
- Content optimization
- SERP analysis

**Model:** GPT-4o-mini

**Prompt Strategy:**
- Focus on Arabic SEO
- Local SEO for Egypt
- Book-related keywords
- Long-tail keyword optimization

### Customer Support AI

**Purpose:** Handle customer support queries

**Capabilities:**
- FAQ generation
- Sentiment analysis
- Ticket classification
- Auto-responses
- Escalation triggers

**Model:** GPT-4o-mini

**Prompt Strategy:**
- Brand personality: "Customer Support of KnoozBook"
- Tone: Empathetic, solution-oriented
- Language: Egyptian Arabic
- Escalation for complex issues

### Analytics AI

**Purpose:** Analyze data and provide insights

**Capabilities:**
- Trend analysis
- Anomaly detection
- Prediction models
- Recommendation engine

**Model:** GPT-4o-mini (for insights) + Statistical models

---

## 6. n8n Standards

### Workflow Naming Convention

**Format:** `[Domain] - [Action] - [Version]`

**Examples:**
- `Social Media - Auto Post - V3`
- `Sales - AI Agent - V2`
- `Analytics - Collection - V1`
- `Events - Tracking - V1`

### Workflow Structure Standards

Every workflow MUST follow this structure:

```
1. Trigger Node
   ├── Webhook / Cron / Manual
   └── Version ID

2. Validation Node
   ├── Input validation
   ├── Data integrity check
   └── Error handling

3. Data Fetching (if needed)
   ├── Backend API calls
   ├── External API calls
   └── Database queries

4. AI Processing (if needed)
   ├── Call Backend AI Orchestrator
   ├── NOT direct AI API calls
   └── Parse structured response

5. Business Logic
   ├── Data transformation
   ├── Conditional routing
   └── Platform-specific preparation

6. External Actions
   ├── Social media posts
   ├── Email sends
   └── Third-party integrations

7. Logging
   ├── Success log to Backend
   ├── Error log to Backend
   └── Performance metrics

8. Response
   ├── Success response
   ├── Error response
   └── Webhook acknowledgment

9. Error Handling
   ├── Retry mechanism (max 3)
   ├── Fallback actions
   └── Admin notifications
```

### Error Handling Standards

Every workflow MUST include:

1. **Validation Error Branch**
   - Log to Backend
   - Return error response
   - Notify admin (if critical)

2. **API Error Branch**
   - Retry mechanism (max 3 attempts)
   - Exponential backoff (2s, 4s, 8s)
   - Fallback to alternative service

3. **Timeout Handling**
   - Set reasonable timeouts (30s default)
   - Circuit breaker pattern
   - Graceful degradation

4. **Logging Standards**
   - All errors logged to Backend
   - Include context (workflow, node, timestamp)
   - Include input data (sanitized)
   - Include error message and stack trace

### Retry Standards

| Operation | Max Retries | Backoff Strategy | Timeout |
|-----------|-------------|------------------|---------|
| Backend API | 3 | 2s, 4s, 8s | 30s |
| Social Media API | 3 | 2s, 4s, 8s | 60s |
| AI API | 2 | 1s, 2s | 30s |
| External API | 3 | 2s, 4s, 8s | 30s |

### Version Control Standards

- Every workflow MUST have a version number
- Version format: `V1`, `V2`, `V3`
- Breaking changes = Major version increment
- Bug fixes = Minor version increment
- Maintain version history in JSON

### Performance Standards

- Maximum execution time: 5 minutes
- Maximum memory usage: 512MB
- Maximum concurrent executions: 10
- Rate limiting: 100 requests/minute per workflow

---

## 7. AI Orchestrator Service

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Orchestrator Service                        │
│  POST /api/ai/execute                                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Task Router  │ │ Model Select │ │ Cache Manager │
└──────────────┘ └──────────────┘ └──────────────┘
         │               │               │
         ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Prompt Mgr   │ │ Cost Tracker │ │ Perf Monitor │
└──────────────┘ └──────────────┘ └──────────────┘
         │               │               │
         └───────────────┼───────────────┘
                         ▼
                ┌──────────────┐
                │ AI Providers │
                │  OpenAI      │
                │  Claude      │
                │  Local LLM   │
                └──────────────┘
```

### Request Format

```json
{
  "task": "generate_caption",
  "data": {
    "product": {
      "name": "Book Name",
      "description": "...",
      "category": "روايات",
      "price": 150
    },
    "platform": "facebook"
  },
  "options": {
    "model": "gpt-4o-mini",
    "temperature": 0.8,
    "maxTokens": 500,
    "cache": true
  }
}
```

### Response Format

```json
{
  "success": true,
  "result": {
    "caption": "...",
    "hashtags": ["#كتب", "#روايات"],
    "cta": "اطلبه الآن"
  },
  "metadata": {
    "model": "gpt-4o-mini",
    "cost": 0.0001,
    "tokens": {
      "input": 150,
      "output": 200
    },
    "cached": false,
    "executionTime": 1.2
  }
}
```

### Benefits

1. **Single Entry Point** - All AI operations go through one service
2. **Model Agnostic** - Easy to switch between OpenAI, Claude, Local LLMs
3. **Cost Tracking** - Centralized cost monitoring
4. **Caching** - Reduce API calls and costs
5. **A/B Testing** - Test different models for same task
6. **Performance Monitoring** - Track execution time and success rates
7. **Rate Limiting** - Prevent API abuse
8. **Fallback** - Automatic fallback to alternative models

### Implementation Plan

**Phase 1:** Basic Orchestrator
- Task routing
- Model selection
- Basic cost tracking

**Phase 2:** Advanced Features
- Response caching
- A/B testing framework
- Performance monitoring

**Phase 3:** Optimization
- Model auto-selection based on cost/performance
- Predictive caching
- Advanced analytics

---

## 8. Security Considerations

### API Security

- All automation endpoints should be protected with API keys
- Rate limiting on all public endpoints
- Input validation and sanitization
- SQL injection prevention
- XSS prevention

### Data Privacy

- Encrypt sensitive data at rest
- Use HTTPS for all communications
- Anonymize user data in logs
- GDPR compliance for EU users

### AI Security

- Validate AI responses before use
- Sanitize AI-generated content
- Monitor for prompt injection attacks
- Limit AI access to sensitive data

### n8n Security

- Secure webhook URLs with authentication
- Encrypt credentials in n8n
- Regular security updates
- Access control for n8n UI

---

## 9. Monitoring & Observability

### Metrics to Track

**Workflow Metrics:**
- Execution count
- Success rate
- Average execution time
- Error rate by type
- Cost per execution

**AI Metrics:**
- Token usage
- Cost per task
- Cache hit rate
- Model performance
- Response quality scores

**Business Metrics:**
- Posts published
- Engagement rate
- Conversion rate
- Customer satisfaction
- Revenue attributed

### Logging Strategy

**Log Levels:**
- ERROR: Critical failures
- WARN: Recoverable issues
- INFO: Normal operations
- DEBUG: Detailed debugging

**Log Destinations:**
- Backend MongoDB (AutomationLog collection)
- n8n execution logs
- External monitoring service (optional)

### Alerting

**Critical Alerts:**
- Workflow failure rate > 10%
- AI API cost spike
- Backend API downtime
- Database connection issues

**Warning Alerts:**
- High execution time
- Low cache hit rate
- Unusual traffic patterns

---

## 10. Deployment Strategy

### Environment Setup

**Development:**
- Local n8n instance
- Local MongoDB
- Test AI API keys

**Staging:**
- Staging server (162.35.163.242)
- Production-like MongoDB Atlas
- Test social media accounts

**Production:**
- Production server
- Production MongoDB Atlas
- Real social media accounts
- Real AI API keys

### Deployment Checklist

- [ ] Update environment variables
- [ ] Deploy backend code
- [ ] Import workflows to n8n
- [ ] Configure credentials
- [ ] Test workflows
- [ ] Monitor initial executions
- [ ] Set up alerts
- [ ] Document any issues

---

## 11. Future Enhancements

### Short Term (1-3 months)

- [ ] Implement AI Orchestrator Service
- [ ] Create Analytics Collection Workflow
- [ ] Add WhatsApp Closing Workflow
- [ ] Implement Inventory Alert Workflow

### Medium Term (3-6 months)

- [ ] Add Book Recommendation Workflow
- [ ] Implement SEO Monitor Workflow
- [ ] Add Price Optimization Workflow
- [ ] Create Customer Retention Workflow

### Long Term (6-12 months)

- [ ] Implement multi-platform support (TikTok, Twitter)
- [ ] Add advanced analytics dashboard
- [ ] Implement predictive AI models
- [ ] Create self-optimizing workflows

---

## 12. Conclusion

This architecture document provides a comprehensive blueprint for the KnoozBook automation system. The key principles are:

1. **Backend-First Approach** - Business logic in Backend, automation in n8n
2. **AI Orchestrator** - Single entry point for all AI operations
3. **Standardization** - Consistent patterns across all workflows
4. **Observability** - Comprehensive monitoring and logging
5. **Scalability** - Designed for growth and evolution

By following this architecture, the system will be:
- Maintainable and easy to debug
- Cost-effective with optimized AI usage
- Reliable with proper error handling
- Scalable to handle growth
- Flexible to adapt to new requirements

---

**Document Owner:** Development Team  
**Review Date:** July 2026  
**Next Review:** December 2026
