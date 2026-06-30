/**
 * Search Context Service
 * خدمة إدارة سياق البحث للمحادثات
 */

class SearchContextService {
  constructor() {
    this.contexts = new Map();
    this.continuationKeywords = ['غيرهم', 'كتاب آخر', 'أرخص', 'أغلى', 'بنفس الفكرة', 'مشابه', 'للمبتدئين'];
    this.newTopicKeywords = ['رشح لي', 'هل عندكم', 'أبحث عن', 'رواية', 'كتاب', 'أريد'];
  }
  
  getContext(conversationId) {
    if (!this.contexts.has(conversationId)) {
      this.contexts.set(conversationId, {
        currentIntent: null,
        currentCategory: null,
        lastSearchQuery: null,
        lastSearchResults: [],
        messageCount: 0,
        createdAt: new Date()
      });
    }
    return this.contexts.get(conversationId);
  }
  
  updateContext(conversationId, newContext) {
    const context = this.getContext(conversationId);
    Object.assign(context, newContext);
  }
  
  resetContext(conversationId) {
    this.contexts.set(conversationId, {
      currentIntent: null,
      currentCategory: null,
      lastSearchQuery: null,
      lastSearchResults: [],
      messageCount: 0,
      createdAt: new Date()
    });
  }
  
  isContinuation(message, conversationId) {
    const lowerMessage = message.toLowerCase();
    
    if (this.continuationKeywords.some(k => lowerMessage.includes(k))) return true;
    if (this.newTopicKeywords.some(k => lowerMessage.includes(k))) return false;
    
    const context = this.getContext(conversationId);
    if (!context.currentIntent) return false;
    
    const similarity = this.calculateSimilarity(message, context.currentIntent, context.currentKeywords);
    return similarity > 0.3;
  }
  
  calculateSimilarity(message, currentIntent, currentKeywords) {
    if (!currentIntent) return 0;
    
    const lowerMessage = message.toLowerCase();
    let score = 0;
    
    if (lowerMessage.includes(currentIntent.toLowerCase())) score += 0.5;
    
    if (currentKeywords?.length) {
      const matches = currentKeywords.filter(k => lowerMessage.includes(k.toLowerCase()));
      score += (matches.length / currentKeywords.length) * 0.5;
    }
    
    return Math.min(score, 1);
  }
  
  determineMessageType(message, conversationId, intentAnalysis) {
    const isCont = this.isContinuation(message, conversationId);
    
    if (isCont) {
      const context = this.getContext(conversationId);
      context.messageCount++;
      return { type: 'continuation', context, shouldReset: false };
    } else {
      this.resetContext(conversationId);
      return { type: 'new_topic', context: this.getContext(conversationId), shouldReset: true };
    }
  }
  
  saveSearchResults(conversationId, searchQuery, results) {
    const context = this.getContext(conversationId);
    context.lastSearchQuery = searchQuery;
    context.lastSearchResults = results;
  }
  
  getLastSearchResults(conversationId) {
    const context = this.getContext(conversationId);
    return { query: context.lastSearchQuery, results: context.lastSearchResults };
  }
}

module.exports = new SearchContextService();
