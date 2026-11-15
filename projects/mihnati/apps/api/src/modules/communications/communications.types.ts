export type ConversationContextType =
  | 'service_request'
  | 'service_order'
  | 'merchant_order';

export interface MessageAttachment {
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface ConversationDoc {
  _id: string;
  contextType: ConversationContextType;
  contextId: string;
  participants: string[]; // userIds
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  isClosed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDoc {
  _id: string;
  conversationId: string;
  senderId: string;
  text: string;
  attachments: MessageAttachment[];
  readBy: string[]; // userIds
  createdAt: Date;
}

export interface ConversationDto {
  id: string;
  contextType: ConversationContextType;
  contextId: string;
  participants: string[];
  lastMessageAt?: string;
  lastMessagePreview?: string;
  isClosed: boolean;
  unreadCount?: number;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  attachments: MessageAttachment[];
  isRead: boolean;
  createdAt: string;
}

export type NotificationType =
  | 'offer_received'
  | 'offer_accepted'
  | 'appointment_scheduled'
  | 'order_status_changed'
  | 'message_received'
  | 'system_notice';

export interface NotificationDoc {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface ConversationReportDoc {
  _id: string;
  conversationId: string;
  reportedBy: string;
  reason: string;
  messageId?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
}

