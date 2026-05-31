// E-book interface
export interface Ebook {
    _id: string;
    title: string;
    author: string;
    description: string;
    coverImage: string;
    epubFilePath: string;
    fileSize: number;
    category: string;
    language: string;
    publisher?: string;
    publishYear?: number;
    isbn?: string;
    relatedProductId?: string;
    pages?: number;
    price: number;
    availableForSubscription: boolean;
    // Client-side handling fields
    accessType?: 'preview' | 'full' | 'owned'; // For offline rights management
    subscriptionExpiry?: Date;
    isOwned?: boolean;
    status: 'active' | 'inactive' | 'pending';
    downloadCount: number;
    viewCount: number;
    averageRating: number;
    ratingCount: number;
    createdAt: Date;
    updatedAt: Date;
}

// Subscription interface
export interface Subscription {
    _id: string;
    userId: string;
    plan: 'monthly' | 'yearly';
    status: 'active' | 'expired' | 'cancelled' | 'pending';
    startDate: Date;
    endDate: Date;
    price: number;
    autoRenew: boolean;
    paymentMethod: string;
    paymentStatus: 'pending' | 'completed' | 'failed';
    createdAt: Date;
    updatedAt: Date;
}

// User Library Entry interface
export interface UserLibraryEntry {
    _id: string;
    userId: string;
    ebookId: Ebook;
    acquiredVia: 'purchase' | 'bundle' | 'gift' | 'promotion';
    acquiredDate: Date;
    pricePaid: number;
    lastAccessedAt?: Date;
    accessCount: number;
}

// Bookmark interface
export interface Bookmark {
    _id: string;
    cfi: string;
    label: string;
    createdAt: Date;
}

// Highlight interface
export interface Highlight {
    _id: string;
    cfi: string;
    cfiRange?: string;
    text: string;
    color: string;
    note?: string;
    createdAt: Date;
}

// Reader Settings interface
export interface ReaderSettings {
    fontSize: number;
    fontFamily: string;
    theme: 'light' | 'dark' | 'sepia' | 'black';
    backgroundColor: string;
    textColor: string;
    lineHeight: number;
    autoScrollSpeed: number;
    // New Settings
    textAlign: 'left' | 'right' | 'justify' | 'center';
    margin: 'narrow' | 'normal' | 'wide';
    backgroundImage: string | null;
    layoutMode?: 'scroll' | 'pages';
}

// Reading Progress interface
export interface ReadingProgress {
    _id: string;
    userId: string;
    ebookId: string;
    currentCfi: string;
    currentPage: number;
    totalPages: number;
    progressPercent: number;
    lastReadAt: Date;
    bookmarks: Bookmark[];
    highlights: Highlight[];
    settings: ReaderSettings;
    readingTimeMinutes: number;
    createdAt?: Date;
    updatedAt?: Date;
}

// Access Check Response
export interface AccessCheckResponse {
    success: boolean;
    hasAccess: boolean;
    accessType?: 'subscription' | 'owned' | 'preview';
    subscription?: Subscription;
    acquiredVia?: string;
}
