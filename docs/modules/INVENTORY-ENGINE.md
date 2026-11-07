# وثيقة مواصفات المحرك: محرك المخزون المزدوج (Inventory Engine)
**المسار في النظام:** `modules/INVENTORY-ENGINE.md`  
**المرحلة:** Phase 1 (Documentation)  

---

## 1. المسؤولية والدور المعماري (Role & Architectural Responsibility)
إدارة وتتبع المخزون بنوعيه: الفردي المرقم بالباركود (البدل ووحداتها) والكمي المقاس (الأحذية والإكسسوارات)، مع تسجيل حركات المخزن وتفادي العجز.

## 2. المكونات والخدمات المرتبطة (Components & Repositories)
- `InventoryService`
- `SuitUnitService`
- `WarehouseRepository`
- `StockMovementRepository`

## 3. المعاملات والاتساق (Transactions & Concurrency)
كل حركة وارد أو صادر أو نقل بين المخازن أو تخصيص لحجز تتم داخل SQLite Transaction لضمان عدم حدوث أي اختلال في الأرصدة.

## 4. القواعد الحاكمة (Engine Rules)
يمنع البيع أو الصرف بالسالب؛ كل حركة لها مرجع (فاتورة، عقد، إذن تحويل، جرد).

## 5. الواجهات البرمجية الأساسية (Public API & Signatures)
```typescript
createSuitModel(dto): Promise<SuitModel>
createSuitUnit(dto): Promise<SuitUnit>
updateUnitStatus(unitId, newStatus, reason): Promise<void>
getAvailableUnitsForBooking(modelId, startDate, endDate): Promise<SuitUnit[]>
adjustQuantityStock(variantId, warehouseId, delta, reason): Promise<void>
transferStock(sourceWarehouseId, targetWarehouseId, items): Promise<void>
```

## 6. استراتيجية التعافي من الأخطاء (Failure Recovery)
- استخدام Transactions لضمان إما النجاح الكامل أو التراجع التام (All-or-Nothing).
- تسجيل تفاصيل الأخطاء في `activity_logs` و `system_errors` دون كشف معلومات حساسة.
- الحفاظ على سلامة ملف SQLite وتفعيل WAL Mode لتفادي تلف البيانات عند انقطاع التيار المفاجئ.

## 7. متطلبات الاختبار والاعتماد (Testing & Quality Gates)
- [ ] اختبارات الوحدات لجميع الدوال الحسابية والمخزنية.
- [ ] اختبارات التكامل مع قاعدة بيانات SQLite تجريبية.
- [ ] محاكاة أخطاء الانقطاع والتحقق من التراجع التلقائي بنجاح.
