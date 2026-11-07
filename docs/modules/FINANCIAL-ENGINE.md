# وثيقة مواصفات المحرك: المحرك المالي والخزينة (Financial & Cash Engine)
**المسار في النظام:** `modules/FINANCIAL-ENGINE.md`  
**المرحلة:** Phase 1 (Documentation)  

---

## 1. المسؤولية والدور المعماري (Role & Architectural Responsibility)
المحرك المسؤول عن إدارة كافة المقبوضات والمدفوعات وجلسات الصندوق اليومية وتوليد القيود المالية والمحاسبية الدقيقة.

## 2. المكونات والخدمات المرتبطة (Components & Repositories)
- `FinancialService`
- `CashService`
- `PaymentRepository`
- `CashSessionRepository`
- `ExpenseRepository`

## 3. المعاملات والاتساق (Transactions & Concurrency)
أي حركة قبض أو صرف مرتبطة بفاتورة أو عقد أو مصروف تسجل مع تحديث رصيد جلسة الصندوق ورصيد الفاتورة في Transaction واحدة.

## 4. القواعد الحاكمة (Engine Rules)
لا عمليات مالية بدون جلسة صندوق مفتوحة؛ لا حذف نهائي لأي قيد مالي بل إجراء حركات عكسية (Reversal/Refund) مع توثيق السبب؛ فصل أموال التأمين عن الإيرادات.

## 5. الواجهات البرمجية الأساسية (Public API & Signatures)
```typescript
openCashSession(openingBalance): Promise<CashSession>
closeCashSession(sessionId, countedCash, notes): Promise<CashSessionSummary>
recordPayment(paymentDto): Promise<PaymentRecord>
recordExpense(expenseDto): Promise<ExpenseRecord>
processRefund(originalPaymentId, amount, reason): Promise<FinancialReversal>
getCashFlowSummary(startDate, endDate): Promise<FinancialReport>
```

## 6. استراتيجية التعافي من الأخطاء (Failure Recovery)
- استخدام Transactions لضمان إما النجاح الكامل أو التراجع التام (All-or-Nothing).
- تسجيل تفاصيل الأخطاء في `activity_logs` و `system_errors` دون كشف معلومات حساسة.
- الحفاظ على سلامة ملف SQLite وتفعيل WAL Mode لتفادي تلف البيانات عند انقطاع التيار المفاجئ.

## 7. متطلبات الاختبار والاعتماد (Testing & Quality Gates)
- [ ] اختبارات الوحدات لجميع الدوال الحسابية والمخزنية.
- [ ] اختبارات التكامل مع قاعدة بيانات SQLite تجريبية.
- [ ] محاكاة أخطاء الانقطاع والتحقق من التراجع التلقائي بنجاح.
