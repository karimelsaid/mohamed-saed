import { randomUUID } from 'node:crypto';
import { getDb } from '../../platform/database/connection.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../../platform/http/errors.js';
import { AuditService } from '../admin/audit.service.js';
import {
  ConversationDoc,
  ConversationDto,
  MessageDoc,
  MessageDto,
  NotificationDoc,
  NotificationDto,
  ConversationReportDoc,
  ConversationContextType,
  MessageAttachment,
  NotificationType,
} from './communications.types.js';

export interface SendMessageInput {
  text: string;
  attachments?: MessageAttachment[];
}

export interface ReportConversationInput {
  reason: string;
  messageId?: string;
}

export class CommunicationsService {
  constructor(private auditService: AuditService) {}

  private getConversationsCollection() {
    return getDb().collection<ConversationDoc>('conversations');
  }

  private getMessagesCollection() {
    return getDb().collection<MessageDoc>('messages');
  }

  private getNotificationsCollection() {
    return getDb().collection<NotificationDoc>('notifications');
  }

  private getReportsCollection() {
    return getDb().collection<ConversationReportDoc>('conversation_reports');
  }

  // ── Conversation & Messaging (AC-E09.1) ──

  async getOrCreateConversation(
    userId: string,
    contextType: ConversationContextType,
    contextId: string,
    counterpartUserId: string
  ): Promise<ConversationDto> {
    if (userId === counterpartUserId) {
      throw new ValidationError('Cannot create conversation with yourself');
    }

    const col = this.getConversationsCollection();
    const participants = [userId, counterpartUserId].sort();

    // Look for existing conversation for this context and participants
    const existing = await col.findOne({
      contextType,
      contextId,
      participants: { $all: participants },
    });

    if (existing) {
      return this.toConversationDto(existing, userId);
    }

    const now = new Date();
    const doc: ConversationDoc = {
      _id: randomUUID(),
      contextType,
      contextId,
      participants,
      isClosed: false,
      createdAt: now,
      updatedAt: now,
    };

    await col.insertOne(doc);
    return this.toConversationDto(doc, userId);
  }

  async listMyConversations(userId: string): Promise<ConversationDto[]> {
    const list = await this.getConversationsCollection()
      .find({ participants: userId })
      .sort({ updatedAt: -1 })
      .toArray();

    return list.map((c) => this.toConversationDto(c, userId));
  }

  async getConversation(userId: string, conversationId: string): Promise<ConversationDoc> {
    const conv = await this.getConversationsCollection().findOne({ _id: conversationId });
    if (!conv) throw new NotFoundError('Conversation not found');

    if (!conv.participants.includes(userId)) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    return conv;
  }

  async sendMessage(
    senderId: string,
    conversationId: string,
    input: SendMessageInput
  ): Promise<MessageDto> {
    const conv = await this.getConversation(senderId, conversationId);

    if (conv.isClosed) {
      throw new ConflictError('Cannot send message to a closed conversation');
    }

    const text = input.text.trim();
    if (text.length === 0 && (!input.attachments || input.attachments.length === 0)) {
      throw new ValidationError('Message must contain text or attachments');
    }

    const now = new Date();
    const messageDoc: MessageDoc = {
      _id: randomUUID(),
      conversationId,
      senderId,
      text,
      attachments: input.attachments ?? [],
      readBy: [senderId],
      createdAt: now,
    };

    await this.getMessagesCollection().insertOne(messageDoc);

    // Update conversation metadata
    const preview = text.length > 50 ? `${text.slice(0, 47)}...` : text;
    await this.getConversationsCollection().updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessageAt: now,
          lastMessagePreview: preview || 'مرفق',
          updatedAt: now,
        },
      }
    );

    // Send in-app notification to counterpart participant
    const counterpartId = conv.participants.find((p) => p !== senderId);
    if (counterpartId) {
      await this.createNotification({
        userId: counterpartId,
        type: 'message_received',
        title: 'رسالة جديدة',
        body: preview || 'وصلتك رسالة جديدة',
        data: { conversationId, messageId: messageDoc._id },
      });
    }

    return {
      id: messageDoc._id,
      conversationId: messageDoc.conversationId,
      senderId: messageDoc.senderId,
      text: messageDoc.text,
      attachments: messageDoc.attachments,
      isRead: false,
      createdAt: messageDoc.createdAt.toISOString(),
    };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    limit = 50,
    skip = 0
  ): Promise<MessageDto[]> {
    await this.getConversation(userId, conversationId);

    // Mark unread messages as read by this user
    await this.getMessagesCollection().updateMany(
      {
        conversationId,
        readBy: { $ne: userId },
      },
      {
        $addToSet: { readBy: userId },
      }
    );

    const docs = await this.getMessagesCollection()
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(Math.min(limit, 100))
      .toArray();

    return docs.map((d) => ({
      id: d._id,
      conversationId: d.conversationId,
      senderId: d.senderId,
      text: d.text,
      attachments: d.attachments,
      isRead: d.readBy.includes(userId),
      createdAt: d.createdAt.toISOString(),
    }));
  }

  async reportConversation(
    userId: string,
    conversationId: string,
    input: ReportConversationInput,
    requestId?: string
  ): Promise<ConversationReportDoc> {
    await this.getConversation(userId, conversationId);

    const now = new Date();
    const doc: ConversationReportDoc = {
      _id: randomUUID(),
      conversationId,
      reportedBy: userId,
      reason: input.reason.trim(),
      messageId: input.messageId,
      status: 'pending',
      createdAt: now,
    };

    await this.getReportsCollection().insertOne(doc);

    // Audit log
    await this.auditService.log({
      actorId: userId,
      action: 'conversation:reported',
      targetType: 'conversation',
      targetId: conversationId,
      reason: input.reason,
      requestId,
    });

    return doc;
  }

  // ── In-App Notifications Center (AC-E09.2) ──

  async createNotification(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<NotificationDoc> {
    const now = new Date();
    const doc: NotificationDoc = {
      _id: randomUUID(),
      userId: params.userId,
      type: params.type,
      title: params.title.trim(),
      body: params.body.trim(),
      data: params.data,
      isRead: false,
      createdAt: now,
    };

    await this.getNotificationsCollection().insertOne(doc);
    return doc;
  }

  async listNotifications(
    userId: string,
    unreadOnly = false,
    limit = 20,
    skip = 0
  ): Promise<{ items: NotificationDto[]; unreadCount: number }> {
    const col = this.getNotificationsCollection();
    const query: Record<string, unknown> = { userId };
    if (unreadOnly) query['isRead'] = false;

    const [docs, unreadCount] = await Promise.all([
      col
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(limit, 50))
        .toArray(),
      col.countDocuments({ userId, isRead: false }),
    ]);

    const items = docs.map((d) => ({
      id: d._id,
      type: d.type,
      title: d.title,
      body: d.body,
      data: d.data,
      isRead: d.isRead,
      readAt: d.readAt?.toISOString(),
      createdAt: d.createdAt.toISOString(),
    }));

    return { items, unreadCount };
  }

  async markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
    const col = this.getNotificationsCollection();
    const notif = await col.findOne({ _id: notificationId });
    if (!notif) throw new NotFoundError('Notification not found');
    if (notif.userId !== userId) {
      throw new ForbiddenError('You do not own this notification');
    }

    await col.updateOne(
      { _id: notificationId },
      { $set: { isRead: true, readAt: new Date() } }
    );
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await this.getNotificationsCollection().updateMany(
      { userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.getNotificationsCollection().countDocuments({
      userId,
      isRead: false,
    });
  }

  // ── Private DTO helpers ──

  private toConversationDto(doc: ConversationDoc, _forUserId: string): ConversationDto {
    return {
      id: doc._id,
      contextType: doc.contextType,
      contextId: doc.contextId,
      participants: doc.participants,
      lastMessageAt: doc.lastMessageAt?.toISOString(),
      lastMessagePreview: doc.lastMessagePreview,
      isClosed: doc.isClosed,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
