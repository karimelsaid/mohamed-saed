export interface User {
    id: string;
    username: string;
    email: string;
    phone: string;
    governorate: string;
    city: string;
    village: string;
    referralCode?: string;
    address?: string;
    favorites: string[];
    cart: string[];
    role: string;
    postOffice?: {
        governorate: string;
        city: string;
        name: string;
        address: string;
    };
}
