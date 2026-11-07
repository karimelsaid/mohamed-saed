# وثيقة مواصفات المحرك: محرك الحجوزات والتأجير (Booking & Rental Engine)
**المسار في النظام:** `modules/BOOKING-ENGINE.md`  
**المرحلة:** Phase 1 (Documentation)  

---

## 1. المسؤولية والدور المعماري (Role & Architectural Responsibility)
المحرك الأساسي لعمليات التأجير ومنع التعارض الزمني لحجوزات البدل وإدارة دورة حياة الحجز من الطلب وحتى الاستلام والتسليم والتسوية.

## 2. المكونات والخدمات المرتبطة (Components & Repositories)
- `BookingService`
- `RentalService`
- `BookingRepository`
- `AvailabilityChecker`

## 3. المعاملات والاتساق (Transactions & Concurrency)
فحص التوفر وحجز القطعة يتمان في معاملة ذرية غير قابلة للتجزئة (Atomic Transaction) تمنع التداخل حتى عند محاولات الحجز المتزامنة.

## 4. القواعد الحاكمة (Engine Rules)
حساب فترة أمان (Buffer Period) بعد كل حجز لعمليات الغسيل والصيانة؛ تسجيل مبالغ التأمين كأمانات معزولة؛ احتساب غرامات التأخير آلياً عند تجاوز موعد الإرجاع.

## 5. الواجهات البرمجية الأساسية (Public API & Signatures)
```typescript
checkAvailability(unitId, startDate, endDate): Promise<boolean>
createBooking(bookingDto): Promise<BookingResult>
confirmFitting(bookingId, fittingDetails): Promise<void>
handoverSuit(bookingId, depositPaymentId): Promise<void>
returnSuit(bookingId, returnInspectionDto): Promise<RentalSettlement>
calculateLateFees(bookingId, actualReturnDate): Promise<number>
```

## 6. استراتيجية التعافي من الأخطاء (Failure Recovery)
- استخدام Transactions لضمان إما النجاح الكامل أو التراجع التام (All-or-Nothing).
- تسجيل تفاصيل الأخطاء في `activity_logs` و `system_errors` دون كشف معلومات حساسة.
- الحفاظ على سلامة ملف SQLite وتفعيل WAL Mode لتفادي تلف البيانات عند انقطاع التيار المفاجئ.

## 7. متطلبات الاختبار والاعتماد (Testing & Quality Gates)
- [ ] اختبارات الوحدات لجميع الدوال الحسابية والمخزنية.
- [ ] اختبارات التكامل مع قاعدة بيانات SQLite تجريبية.
- [ ] محاكاة أخطاء الانقطاع والتحقق من التراجع التلقائي بنجاح.
