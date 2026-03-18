export interface User {
    id: string;
    username: string;
    email: string;
    phone: string;
    governorate: string;
    city: string;
    village: string;
    gender?: 'male' | 'female';
    country?: string;
    isSheikh?: boolean;
    referralCode?: string;
    referralBalance?: number;
    profileImage?: string;
    coverPhoto?: string;
    bio?: string;
    address?: string;
    favorites: string[];
    favoriteAuthors?: string[];
    favoriteCategories?: string[];
    likesReceived?: number;
    cart: string[];
    role?: 'user' | 'merchant' | 'admin';
    merchantName?: string;
    approved?: boolean;

    quranProgress?: {
        totalPoints: number;
        [key: string]: any;
    };
    gamification?: {
        xp: number;
        coins: number;
        level: number;
        [key: string]: any;
    };
    earnedCoupons?: any[];
    postOffice?: {
        governorate: string;
        city: string;
        name: string;
        address: string;
    };
    token?: string;
    followers?: string[];
    createdAt?: string | Date;
}
