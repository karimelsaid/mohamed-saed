const Conversation = require('../models/Conversation.model');
const ChatMessage = require('../models/ChatMessage.model');
const { v4: uuidv4 } = require('uuid');

/**
 * Conversation Management Service
 * خدمة إدارة المحادثات والرسائل
 */
class ConversationManagementService {
  /**
   * إنشاء محادثة جديدة
   * @param {Object} options - خيارات المحادثة
   * @returns {Promise<Object>} - المحادثة المنشأة
   */
  async createConversation(options = {}) {
    try {
      const conversationId = uuidv4();
      const conversation = new Conversation({
        conversationId,
        userId: options.userId || null,
        sessionId: options.sessionId || null,
        metadata: options.metadata || {}
      });

      await conversation.save();
      return conversation;
    } catch (error) {
      console.error('Error in createConversation:', error);
      throw error;
    }
  }

  /**
   * الحصول على محادثة بواسطة ID
   * @param {string} conversationId - معرف المحادثة
   * @returns {Promise<Object|null>} - المحادثة أو null
   */
  async getConversation(conversationId) {
    try {
      return await Conversation.findOne({ conversationId });
    } catch (error) {
      console.error('Error in getConversation:', error);
      return null;
    }
  }

  /**
   * تحديث المحادثة
   * @param {string} conversationId - معرف المحادثة
   * @param {Object} updates - التحديثات
   * @returns {Promise<Object|null>} - المحادثة المحدثة
   */
  async updateConversation(conversationId, updates) {
    try {
      const conversation = await Conversation.findOneAndUpdate(
        { conversationId },
        { 
          ...updates,
          lastMessageAt: new Date()
        },
        { new: true }
      );
      return conversation;
    } catch (error) {
      console.error('Error in updateConversation:', error);
      return null;
    }
  }

  /**
   * إضافة رسالة إلى المحادثة
   * @param {string} conversationId - معرف المحادثة
   * @param {string} role - دور الرسالة (user, assistant, system)
   * @param {string} content - محتوى الرسالة
   * @param {Object} metadata - بيانات إضافية
   * @returns {Promise<Object>} - الرسالة المضافة
   */
  async addMessage(conversationId, role, content, metadata = {}) {
    try {
      const message = new ChatMessage({
        conversationId,
        role,
        content,
        intentAnalysis: metadata.intentAnalysis || null,
        recommendedBooks: metadata.recommendedBooks || [],
        performance: metadata.performance || {},
        metadata: metadata.modelMetadata || {}
      });

      await message.save();

      // تحديث المحادثة
      await Conversation.updateOne(
        { conversationId },
        {
          $inc: { messageCount: 1 },
          $set: { lastMessageAt: new Date() }
        }
      );

      return message;
    } catch (error) {
      console.error('Error in addMessage:', error);
      throw error;
    }
  }

  /**
   * الحصول على رسائل المحادثة
   * @param {string} conversationId - معرف المحادثة
   * @param {number} limit - عدد الرسائل
   * @returns {Promise<Array>} - مصفوفة الرسائل
   */
  async getMessages(conversationId, limit = 50) {
    try {
      return await ChatMessage.find({ conversationId })
        .sort({ createdAt: 1 })
        .limit(limit);
    } catch (error) {
      console.error('Error in getMessages:', error);
      return [];
    }
  }

  /**
   * الحصول على آخر رسائل المحادثة للـ context
   * @param {string} conversationId - معرف المحادثة
   * @param {number} limit - عدد الرسائل
   * @returns {Promise<Array>} - مصفوفة الرسائل بصيغة AI
   */
  async getMessagesForAI(conversationId, limit = 10) {
    try {
      const messages = await ChatMessage.find({ conversationId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .sort({ createdAt: 1 });

      return messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    } catch (error) {
      console.error('Error in getMessagesForAI:', error);
      return [];
    }
  }

  /**
   * إغلاق المحادثة
   * @param {string} conversationId - معرف المحادثة
   * @returns {Promise<boolean>} - نجاح العملية
   */
  async closeConversation(conversationId) {
    try {
      await Conversation.updateOne(
        { conversationId },
        { status: 'closed' }
      );
      return true;
    } catch (error) {
      console.error('Error in closeConversation:', error);
      return false;
    }
  }

  /**
   * الحصول على إحصائيات المحادثة
   * @param {string} conversationId - معرف المحادثة
   * @returns {Promise<Object>} - الإحصائيات
   */
  async getConversationStats(conversationId) {
    try {
      const conversation = await Conversation.findOne({ conversationId });
      const messages = await ChatMessage.find({ conversationId });

      const userMessages = messages.filter(m => m.role === 'user').length;
      const assistantMessages = messages.filter(m => m.role === 'assistant').length;
      const totalTokens = messages.reduce((sum, m) => sum + (m.performance?.tokensUsed || 0), 0);
      const totalCost = messages.reduce((sum, m) => sum + (m.performance?.cost || 0), 0);

      return {
        messageCount: conversation?.messageCount || 0,
        userMessages,
        assistantMessages,
        totalTokens,
        totalCost,
        duration: conversation?.lastMessageAt 
          ? Math.floor((conversation.lastMessageAt - conversation.startedAt) / 1000 / 60) 
          : 0 // بالدقائق
      };
    } catch (error) {
      console.error('Error in getConversationStats:', error);
      return null;
    }
  }

  /**
   * تحديث ملف العميل
   * @param {string} conversationId - معرف المحادثة
   * @param {Object} profile - بيانات العميل
   * @returns {Promise<boolean>} - نجاح العملية
   */
  async updateCustomerProfile(conversationId, profile) {
    try {
      await Conversation.updateOne(
        { conversationId },
        {
          $set: {
            'customerProfile.interests': profile.interests || [],
            'customerProfile.preferredCategories': profile.preferredCategories || [],
            'customerProfile.priceRange': profile.priceRange || {},
            'customerProfile.lastSearchQuery': profile.lastSearchQuery || ''
          }
        }
      );
      return true;
    } catch (error) {
      console.error('Error in updateCustomerProfile:', error);
      return false;
    }
  }

  /**
   * الحصول على المحادثات النشطة
   * @param {number} limit - عدد المحادثات
   * @returns {Promise<Array>} - مصفوفة المحادثات
   */
  async getActiveConversations(limit = 20) {
    try {
      return await Conversation.find({ status: 'active' })
        .sort({ lastMessageAt: -1 })
        .limit(limit);
    } catch (error) {
      console.error('Error in getActiveConversations:', error);
      return [];
    }
  }
}

module.exports = new ConversationManagementService();
