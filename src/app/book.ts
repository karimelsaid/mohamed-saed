export interface Book {
  products_id: string;
  product_name: string;
  product_price: number;
  price_cost: number;
  product_quantity: number;
  product_category: string;
  product_image: string;
  product_images?: string[]; // Array of image paths for multiple images
  image_path: string; // مسار الصورة الكامل من الخلفية
  product_price_before_discount: number;
  rival?: boolean; // خاصية اختيارية لتحديد حالة العرض
  promotionEndDate?: string; // خاصية اختيارية لتاريخ نهاية العرض
  price_ratio:number;
  remainingTime?: string; // خاصية اختيارية لعرض الوقت المتبقي للعرض
  product_discount_percent?: number; // خاصية اختيارية لنسبة الخصم
  product_description?: string; // إضافة وصف المنتج كخاصية اختيارية
  merchantId?: string; // معرف التاجر
  merchantName?: string; // اسم التاجر
  merchantLogo?: string; // شعار التاجر
  averageRating?: number; // متوسط التقييم
  ratingCount?: number; // عدد التقييمات
}
