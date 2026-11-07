# وثيقة مواصفات المحرك: محرك التنبيهات والتواصل (Notification & WhatsApp Engine)
**المسار في النظام:** `modules/NOTIFICATION-ENGINE.md`  
**المرحلة:** Phase 1 (Documentation)  

---

## 1. المسؤولية والدور المعماري (Role & Architectural Responsibility)
مراقبة المواعيد الحرجة وتوليد التنبيهات التشغيلية والتذكيرات لصاحب المحل، وتجهيز رسائل واتساب للعملاء وفق قوالب ذكية.

## 2. المكونات والخدمات المرتبطة (Components & Repositories)
- `TaskService`
- `NotificationService`
- `WhatsAppHelper`
- `AlertScheduler`

## 3. المعاملات والاتساق (Transactions & Concurrency)
توليد المهام المجدولة آلياً والتأكد من عدم تكرار التنبيه لنفس الحادثة.

## 4. القواعد الحاكمة (Engine Rules)
تنبيه صاحب المحل قبل موعد التسليم بيوم، وقبل موعد المناسبة، وفور حدوث تأخير في إرجاع البدلة؛ تنسيق أرقام الهواتف وتجهيز روابط Click-to-Chat المباشرة.

## 5. الواجهات البرمجية الأساسية (Public API & Signatures)
```typescript
generateDailyTasks(): Promise<Task[]>
checkOverdueBookings(): Promise<BookingAlert[]>
buildWhatsAppMessage(templateType, bookingData): string
getClickToChatUrl(phone, text): string
markTaskCompleted(taskId): Promise<void>
```

## 6. استراتيجية التعافي من الأخطاء (Failure Recovery)
- استخدام Transactions لضمان إما النجاح الكامل أو التراجع التام (All-or-Nothing).
- تسجيل تفاصيل الأخطاء في `activity_logs` و `system_errors` دون كشف معلومات حساسة.
- الحفاظ على سلامة ملف SQLite وتفعيل WAL Mode لتفادي تلف البيانات عند انقطاع التيار المفاجئ.

## 7. متطلبات الاختبار والاعتماد (Testing & Quality Gates)
- [ ] اختبارات الوحدات لجميع الدوال الحسابية والمخزنية.
- [ ] اختبارات التكامل مع قاعدة بيانات SQLite تجريبية.
- [ ] محاكاة أخطاء الانقطاع والتحقق من التراجع التلقائي بنجاح.
