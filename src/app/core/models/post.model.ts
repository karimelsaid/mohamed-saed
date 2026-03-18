export type PostType = 'article' | 'review' | 'snippet' | 'thought';

export interface Comment {
    _id?: string;
    id?: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    userRole?: string;
    content: string;
    createdAt: string | Date;
    replies: CommentReply[];
    showReplyInput?: boolean;
    replyText?: string;
}

export interface CommentReply {
    _id?: string;
    id?: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    userRole?: string;
    content: string;
    createdAt: string | Date;
}

export interface ReaderPost {
    _id?: string;
    id?: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    type: PostType;
    content: string;
    title?: string;
    bookTitle?: string;
    bookAuthor?: string;
    bookCover?: string;
    rating?: number;
    likes: string[];
    comments: Comment[];
    commentsCount: number;
    createdAt: string | Date;
    isPinned?: boolean;
    pinType?: 'personal' | 'community';
    userRole?: string;

    // UI State (Optional)
    showComments?: boolean;
    newCommentText?: string;

    // Optional legacy fields
    author?: {
        name: string;
        avatar?: string;
    };
    book?: {
        title: string;
        author: string;
        cover: string;
    };
}
// Force Recompile - Timestamp: 2026-03-13 20:47:00
