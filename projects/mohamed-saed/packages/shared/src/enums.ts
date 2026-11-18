/**
 * الحالات التشغيلية المعتمدة لوحدة البدلة الفردية (Suit Unit Status)
 */
export enum UnitStatus {
  AVAILABLE = 'AVAILABLE',         // متاحة للحجز والتأجير
  BOOKED = 'BOOKED',               // مرتبطة بحجز مستقبلي مؤكد
  IN_USE = 'IN_USE',               // مع العميل حالياً (مستلمة)
  IN_MAINTENANCE = 'IN_MAINTENANCE', // تحت الصيانة / الخياط
  DAMAGED = 'DAMAGED',             // تالفة جزئياً
  RETIRED = 'RETIRED'              // تم إخراجها من الخدمة نهائياً
}

/**
 * حالات دورة حياة الحجز (Booking Status)
 */
export enum BookingStatus {
  PENDING = 'PENDING',             // حجز مبدئي غير مؤكد
  CONFIRMED = 'CONFIRMED',         // مؤكد بسداد مقدم
  DELIVERED = 'DELIVERED',         // استلمها العميل وسدد التأمين
  RETURNED = 'RETURNED',           // أعادها العميل وجاري الفحص
  COMPLETED = 'COMPLETED',         // تم الفحص ورد التأمين وإغلاق الحجز
  CANCELLED = 'CANCELLED'          // ملغي
}

/**
 * طرق الدفع المعتمدة (Payment Methods)
 */
export enum PaymentMethod {
  CASH = 'CASH',                   // نقدي بالدرج
  VISA_CARD = 'VISA_CARD',         // بطاقة دفع إلكتروني POS
  VODAFONE_CASH = 'VODAFONE_CASH', // محفظة إلكترونية (فودافون كاش، إنستاباي، إلخ)
  BANK_TRANSFER = 'BANK_TRANSFER'  // تحويل بنكي مباشر
}

/**
 * أنواع الحركات المالية بالخزينة (Cash Transaction Types)
 */
export enum CashTransactionType {
  RENTAL_ADVANCE = 'RENTAL_ADVANCE',     // دفعة مقدم حجز
  RENTAL_REMAINDER = 'RENTAL_REMAINDER', // سداد باقي الإيجار
  SECURITY_DEPOSIT = 'SECURITY_DEPOSIT', // مبلغ تأمين مسترد (أمانات)
  DEPOSIT_REFUND = 'DEPOSIT_REFUND',     // رد مبلغ التأمين للعميل
  SALE_INCOME = 'SALE_INCOME',           // إيراد بيع مباشر POS
  EXPENSE = 'EXPENSE',                   // مصروفات نثرية أو تشغيلية
  MANUAL_CASH_IN = 'MANUAL_CASH_IN',     // إيداع نقدي بالخزينة
  MANUAL_CASH_OUT = 'MANUAL_CASH_OUT',   // مسحوبات مالك
  CUSTOMER_DEBT = 'CUSTOMER_DEBT',       // دين على العميل (متبقي غير مدفوع)
  DEBT_COLLECTION = 'DEBT_COLLECTION'   // تحصيل دين من العميل
}

/**
 * أنواع المهام اليومية (Task Types)
 */
export enum TaskType {
  SUIT_PREPARATION = 'SUIT_PREPARATION', // تجهيز البدلة
  RETURN_REMINDER = 'RETURN_REMINDER',     // تذكير بموعد الإرجاع
  LATE_RETURN_ALERT = 'LATE_RETURN_ALERT'  // متابعة بدلة متأخرة
}

/**
 * أولويات المهام (Task Priorities)
 */
export enum TaskPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

/**
 * تصنيفات المنتجات (Product Categories)
 */
export enum ProductCategoryType {
  SUITS = 'SUITS',
  SHOES = 'SHOES',
  ACCESSORIES = 'ACCESSORIES',
  CUSTOM = 'CUSTOM'
}

