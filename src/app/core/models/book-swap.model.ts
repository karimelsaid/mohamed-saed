export interface BookSwap {
    id: string;
    ownerId: string;
    ownerName: string;
    ownerAvatar?: string;
    bookTitle: string;
    author: string;
    condition: 'new' | 'used-good' | 'used-fair';
    description?: string;
    imageUrl?: string;
    bookCover?: string;
    location?: string;
    status: 'available' | 'swapped' | 'pending';
    createdAt: Date;
}
