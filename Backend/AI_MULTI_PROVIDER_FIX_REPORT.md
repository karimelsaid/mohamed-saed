# AI Multi-Provider Configuration Fix Report

## Root Cause

The AI Orchestrator was sending the same model name (e.g., `gemini-2.5-flash`) to all providers, causing failures when providers don't support that model.

## Architecture Before Fix

```
AI Config:
  sales_chat:
    provider: 'gemini'
    model: 'gemini-2.5-flash'  // Single model for all providers

AI Orchestrator:
  - Uses taskConfig.model for all providers
  - Sends 'gemini-2.5-flash' to Groq, Cerebras, etc.
  - Providers fail: "Model does not exist"
```

## Architecture After Fix

```
AI Config:
  sales_chat:
    provider: 'gemini'
    models:  // Provider-specific models
      gemini: 'gemini-2.5-flash'
      groq: 'llama-3.3-70b-versatile'
      cerebras: 'llama-3.3-70b'
      github_models: 'openai/gpt-4.1-mini'
      openrouter: 'deepseek/deepseek-chat-v3-0324:free'

AI Orchestrator:
  - Checks taskConfig.models[providerName] first
  - Falls back to taskConfig.model for backward compatibility
  - Falls back to provider's default model
  - Skips provider if model is null (not supported)
```

## Files Modified

### 1. `/Users/orabi/Downloads/kenouz/Backend/ai/config/ai.config.js`
- Added `models` object to all tasks with provider-specific models
- Each task now has models for: gemini, groq, cerebras, github_models, openrouter
- Embedding task has `null` for providers that don't support embeddings

### 2. `/Users/orabi/Downloads/kenouz/Backend/ai/services/ai-orchestrator.service.js`
- Updated `execute()` to use provider-specific models
- Added logic to select correct model based on provider
- Added check to skip providers with null models
- Updated `isNonRetryableError()` to skip 401, 403, 404, 429
- Enhanced logging in `executeWithFallback()` with:
  - Provider Name
  - Selected Model
  - Reason for failure
  - Time spent
  - Next provider

### 3. `/Users/orabi/Downloads/kenouz/Backend/ai/providers/gemini.provider.js`
- Enhanced `healthCheck()` to verify:
  - API key exists
  - API connectivity and authentication
  - Default model exists
  - Specific error messages for 401, 403, 429

### 4. `/Users/orabi/Downloads/kenouz/Backend/ai/providers/groq.provider.js`
- Enhanced `healthCheck()` with same improvements as Gemini

### 5. `/Users/orabi/Downloads/kenouz/Backend/ai/providers/cerebras.provider.js`
- Enhanced `healthCheck()` with same improvements as Gemini

### 6. `/Users/orabi/Downloads/kenouz/Backend/ai/providers/github-models.provider.js`
- Enhanced `healthCheck()` with same improvements as Gemini
- Added specific message for "Models permission required"

### 7. `/Users/orabi/Downloads/kenouz/Backend/ai/providers/openrouter.provider.js`
- Enhanced `healthCheck()` with same improvements as Gemini
- Validates free model exists

## Provider-Specific Models

### Gemini
- `gemini-2.5-flash` (default)
- `gemini-2.5-flash-lite`
- `gemini-2.5-pro` (optional)

### Groq
- `llama-3.3-70b-versatile` (default)
- `llama-3.1-8b-instant`
- `llama-3.1-70b-versatile`
- `mixtral-8x7b-32768`
- `gemma-7b-it`
- `gemma2-9b-it`

### Cerebras
- `llama3.1-70b` (default)
- `llama3.1-8b`
- `llama3-70b`
- `llama3-8b`
- `mixtral-8x7b`

### GitHub Models
- `openai/gpt-4.1-mini` (default)
- `phi-4`
- `mistral-small`
- `llama-3.3-70b`
- `llama-3.1-70b`

### OpenRouter (FREE only)
- `deepseek/deepseek-chat-v3-0324:free` (default)
- `meta-llama/llama-3.3-70b-instruct:free`
- `qwen/qwen3-32b:free`
- `google/gemma-3-27b-it:free`
- `google/gemma-3-12b-it:free`
- `mistralai/mistral-small-3.2-24b-instruct:free`

## Retry Policy Update

### Non-Retryable Errors (Skip immediately to next provider)
- **401** - Authentication failed
- **403** - Authorization failed
- **404** - Model not found
- **429** - Rate limit exceeded

### Retryable Errors (Retry with exponential backoff)
- **500** - Internal server error
- **502** - Bad gateway
- **503** - Service unavailable
- **504** - Gateway timeout
- Network timeout

## Health Monitoring Improvements

Each provider's `healthCheck()` now verifies:
1. **API Key Exists** - Returns false if missing
2. **API Connectivity** - Makes real API request
3. **Authentication** - Checks for 401/403 errors
4. **Model Exists** - Validates default model is available
5. **Specific Error Messages** - Clear logs for each failure type

### GitHub PAT Permissions Required
For GitHub Models to work, the PAT must have:
- **Models permission** - Required for AI model access
- If 401/403 occurs, provider is marked UNHEALTHY

## Logging Improvements

When switching providers, logs now show:
```
[AIOrchestrator] Trying provider: Groq
[AIOrchestrator] Model: llama-3.3-70b-versatile
[AIOrchestrator] Reason previous provider failed: 429
[AIOrchestrator] Switching...
[AIOrchestrator] Provider Groq failed: Model does not exist
[AIOrchestrator] Time spent: 123ms
```

## Expected Behavior

When Gemini quota is exhausted:
```
Gemini (429) → Skip immediately
    ↓
Groq (llama-3.3-70b-versatile)
    ↓
Cerebras (llama-3.3-70b)
    ↓
GitHub Models (openai/gpt-4.1-mini) - if authorized
    ↓
OpenRouter Free (deepseek/deepseek-chat-v3-0324:free)
```

No provider receives another provider's model name.

## Testing

To verify the fix:
1. Start the backend server
2. Send a chat message
3. Observe logs showing correct model for each provider
4. Verify automatic failover works
5. Check health status of each provider

## Summary

✅ Model mapping layer implemented
✅ Provider-specific models configured
✅ AI Orchestrator updated to use correct models
✅ Retry policy updated to skip 401, 403, 404, 429
✅ Logging enhanced with provider switch details
✅ Health monitoring improved with comprehensive checks
✅ GitHub PAT permissions documented
