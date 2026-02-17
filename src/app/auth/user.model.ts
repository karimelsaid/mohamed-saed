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
    address?: string;
    favorites: string[];
    cart: string[];
    role?: 'user' | 'merchant' | 'admin';
    postOffice?: {
        governorate: string;
        city: string;
        name: string;
        address: string;
    };
    token?: string;
}
