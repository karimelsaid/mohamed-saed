export interface Auction {
    _id: string;
    userId: string;
    bookTitle: string;
    author?: string;
    description?: string;
    condition?: string;
    images?: string[];
    startingPrice: number;
    currentPrice: number;
    highestBidder?: any;
    endTime: string | Date;
    status: 'active' | 'ended' | 'cancelled';
    paymentStatus?: 'pending' | 'requested' | 'paid';
    shippingStatus?: 'pending' | 'collecting_from_owner' | 'received_by_admin' | 'delivering_to_winner' | 'completed';
    userName?: string;
    userPhone?: string;
    userEmail?: string;
    userAddress?: string;
    userAvatar?: string;
    bids?: AuctionBid[];
    _forceUpdate?: boolean; // Dummy to force compiler re-read
}

export interface AuctionBid {
    userId: string;
    userName?: string;
    userAvatar?: string;
    amount: number;
    timestamp: string | Date;
}
