export interface BookSwap {
    _id: string; // Use _id from MongoDB
    userId: string;
    bookTitle: string;
    author?: string;
    condition: 'new' | 'used-good' | 'used-fair';
    description?: string;
    notes?: string;
    images?: string[];
    lookingFor?: string;
    location?: string;
    status: 'available' | 'pending' | 'swapped';
    shippingStatus?: 'pending' | 'collecting_from_both' | 'received_by_admin' | 'delivering_to_both' | 'completed';
    ownerName?: string;
    ownerPhone?: string;
    ownerEmail?: string;
    ownerAddress?: string;
    ownerAvatar?: string;
    acceptedRequester?: {
        name: string;
        phone: string;
        email: string;
        address: string;
        offeredBook: string;
        offeredBookCondition: string;
        offeredBookNotes?: string;
        offeredBookImage?: string;
    };
    requests?: SwapRequest[];
    createdAt: string;
}

export interface SwapRequest {
    _id?: string;
    requesterId: string;
    requesterName?: string;
    requesterAvatar?: string;
    offeredBookTitle?: string;
    offeredBookCondition?: string;
    offeredBookNotes?: string;
    offeredBookImage?: string;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: string;
}
