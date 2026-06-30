# خريطة Event Tracking في Frontend - KnoozBook

## نظرة عامة
تم إضافة Event Tracking في جميع صفحات ومكونات المشروع لتتبع سلوك المستخدمين. جميع الأحداث ترسل إلى n8n webhook عبر `AnalyticsTrackingService`.

---

## الأحداث المدعومة

### 1. Impression (ظهور المنتج)
- **الوصف**: يتم تتبع عندما يظهر المنتج على الشاشة (visible in viewport)
- **الاستخدام**: Intersection Observer API
- **الأماكن**:
  - ✅ HomePage (`home-page.component.ts`)
  - ✅ BooksComponent (`books.component.ts`) - صفحة `/books` و `/category/:name`
  - ✅ Favorites (`favorites.component.ts`)
  - ✅ Bourse (`bourse.component.ts`)
  - ✅ Promotions (`promotions.component.ts`)
  - ✅ SearchResults (`search-results.component.ts`) - صفحة `/research`

### 2. Click (نقرة على المنتج)
- **الوصف**: يتم تتبع عندما ينقر المستخدم على منتج
- **الاستخدام**: `(click)` event handlers
- **الأماكن**:
  - ✅ HomePage (`home-page.component.ts`)
  - ✅ BooksComponent (`books.component.ts`)
  - ✅ Favorites (`favorites.component.ts`)
  - ✅ Bourse (`bourse.component.ts`)
  - ✅ Promotions (`promotions.component.ts`)
  - ✅ SearchResults (`search-results.component.ts`)

### 3. Purchase (شراء)
- **الوصف**: يتم تتبع عند إتمام عملية الشراء بنجاح
- **الاستخدام**: في Order Callback بعد التحقق من الدفع
- **الأماكن**:
  - ✅ OrderCallbackComponent (`order-callback.component.ts`)

### 4. Search (بحث)
- **الوصف**: يتم تتبع عندما يقوم المستخدم بالبحث
- **الاستخدام**: عند تنفيذ البحث
- **الأماكن**:
  - ✅ SearchResultsComponent (`search-results.component.ts`) - عند تحميل نتائج البحث
  - ✅ NavbarIconsComponent (`navbar-icons.component.ts`) - عند البحث من navbar
  - ✅ SearchBarComponent (`search-bar.component.ts`) - عند البحث من search bar

### 5. Comment (تعليق/تقييم)
- **الوصف**: يتم تتبع عندما يقوم المستخدم بإضافة تعليق أو تقييم
- **الاستخدام**: عند إرسال التقييم
- **الأماكن**:
  - ✅ UserOrdersComponent (`user-orders.component.ts`) - عند إرسال تقييم للمنتج
- **البيانات المرسلة**: `commentId`, `location`, `commentText`, `platform`

### 6. Purchase (شراء - Batch)
- **الوصف**: يتم تتبع عند إتمام عملية الشراء بنجاح (جميع المنتجات في request واحد)
- **الاستخدام**: في Order Callback بعد التحقق من الدفع
- **الأماكن**:
  - ✅ OrderCallbackComponent (`order-callback.component.ts`) - عند التحقق من نجاح الدفع
- **البيانات المرسلة**: `orderId`, `products[]`, `totalAmount`, `itemCount`

### 7. Cart (إضافة للسلة)
- **الوصف**: يتم تتبع عندما يضيف المستخدم منتج للسلة
- **الاستخدام**: عند إضافة منتج للسلة
- **الأماكن**: متاح للاستخدام في أي مكون
- **البيانات المرسلة**: `action: 'add_to_cart'`, `source: 'website'`

### 8. Other (أحداث مخصصة)
- **الوصف**: أحداث مخصصة يمكن استخدامها لأي غرض آخر
- **الاستخدام**: `trackCustom(eventType, productId, metadata)`
- **الأماكن**: متاح للاستخدام في أي مكون

---

## AnalyticsTrackingService

**الموقع**: `src/app/services/analytics-tracking.service.ts`

**الـ Methods**:
```typescript
trackImpression(productId: string)           // تتبع ظهور المنتج
trackClick(productId: string, clickType?)     // تتبع النقر على المنتج
trackPurchase(productId: string, orderId?, amount?) // تتبع الشراء (منتج واحد)
trackPurchaseBatch(products: any[], orderId)  // تتبع الشراء (عدة منتجات - batch)
trackSearch(searchTerm: string)               // تتبع البحث
trackComment(productId: string, commentText?, commentId?, location?) // تتبع التعليق
trackCartAdd(productId: string)              // تتبع إضافة للسلة
trackCustom(eventType: string, productId, metadata?) // تتبع مخصص
```

**الـ Webhook URL**: `https://n8n.knoozbook.com/webhook/track-event`

**الـ Payload Structure**:
```typescript
{
  eventType: string,      // 'impression', 'click', 'purchase', 'search', 'comment', 'other'
  productId: string,      // (اختياري) معرف المنتج
  userId: string,        // معرف المستخدم أو 'anonymous'
  sessionId: string,     // معرف الجلسة من sessionStorage
  metadata: object       // بيانات إضافية حسب نوع الحدث
}
```

---

## التفاصيل لكل مكون

### HomePage
**ملف**: `src/app/home-page/home-page.component.ts`
- **Impression**: `setupIntersectionObserver()` - يراقب ظهور المنتجات في viewport
- **Click**: `navigateToProduct(book)` - عند النقر على منتج

### BooksComponent
**ملف**: `src/app/book-list/books/books.component.ts`
- **Impression**: `setupIntersectionObserver()` - يراقب ظهور المنتجات
- **Click**: `navigateToProduct(book)` - عند النقر على منتج

### Favorites
**ملف**: `src/app/favorites/favorites.component.ts`
- **Impression**: `setupIntersectionObserver()` - يراقب ظهور المنتجات
- **Click**: `navigateToProduct(book)` - عند النقر على منتج

### Bourse
**ملف**: `src/app/bourse/bourse.component.ts`
- **Impression**: `setupIntersectionObserver()` - يراقب ظهور المنتجات
- **Click**: `navigateToProduct(book)` - عند النقر على منتج

### Promotions
**ملف**: `src/app/features/promotions/promotions.component.ts`
- **Impression**: `setupIntersectionObserver()` - يراقب ظهور المنتجات
- **Click**: `navigateToProduct(book)` - عند النقر على منتج

### SearchResults
**ملف**: `src/app/search-results/search-results.component.ts`
- **Impression**: `setupIntersectionObserver()` - يراقب ظهور المنتجات
- **Click**: `navigateToProduct(book)` - عند النقر على منتج
- **Search**: `executeNormalSearch()` - عند تنفيذ البحث

### OrderCallback
**ملف**: `src/app/checkout-modal/order-callback/order-callback.component.ts`
- **Purchase**: عند التحقق من نجاح الدفع - يرسل لكل منتج في الطلب

### UserOrders
**ملف**: `src/app/user-orders/user-orders.component.ts`
- **Comment**: `submitRating(bookId, rating)` - عند إرسال التقييم

### NavbarIcons
**ملف**: `src/app/navbar-icons/navbar-icons.component.ts`
- **Search**: `onSearch()` و `onSearchExecuted()` - عند البحث من navbar

### SearchBar
**ملف**: `src/app/search-bar/search-bar.component.ts`
- **Search**: `onSearch()` - عند البحث من search bar

---

## البيانات المرسلة لكل حدث

### Impression
```typescript
{
  eventType: 'impression',
  productId: '...',
  userId: '...',
  sessionId: '...',
  metadata: { source: 'impression' }
}
```

### Click
```typescript
{
  eventType: 'click',
  productId: '...',
  userId: '...',
  sessionId: '...',
  metadata: { clickType: 'product_link' }
}
```

### Purchase (Batch)
```typescript
{
  eventType: 'purchase_batch',
  orderId: '...',
  userId: '...',
  sessionId: '...',
  products: [
    { productId: '...', amount: ... },
    { productId: '...', amount: ... }
  ],
  metadata: {
    totalAmount: ...,
    itemCount: ...,
    timestamp: '...'
  }
}
```

### Cart
```typescript
{
  eventType: 'other',
  productId: '...',
  userId: '...',
  sessionId: '...',
  metadata: {
    action: 'add_to_cart',
    source: 'website'
  }
}
```

### Search
```typescript
{
  eventType: 'search',
  productId: '',
  userId: '...',
  sessionId: '...',
  metadata: { searchTerm: '...' }
}
```

### Comment
```typescript
{
  eventType: 'comment',
  productId: '...',
  userId: '...',
  sessionId: '...',
  metadata: {
    commentText: '...',
    commentId: '...',
    location: '...',
    platform: 'website'
  }
}
```

---

## ملاحظات مهمة

1. **Session ID**: يتم إنشاء معرف جلسة فريد لكل جلسة ويتم تخزينه في `sessionStorage`
2. **User ID**: يتم جلب معرف المستخدم من `localStorage` أو يستخدم 'anonymous'
3. **Fire and Forget**: جميع الأحداث ترسل بشكل غير متزامن ولا تؤثر على أداء الـ UI
4. **Error Handling**: الأخطاء تُعالج بصمت ولا تؤثر على تجربة المستخدم
5. **Intersection Observer**: يستخدم لـ impression tracking لتجنب تتبع المنتجات غير المرئية

---

## التغييرات الأخيرة (Jun 28, 2026)

### تم إضافة:
- ✅ `trackSearch` method في `AnalyticsTrackingService`
- ✅ Search tracking في `SearchResultsComponent`
- ✅ Search tracking في `NavbarIconsComponent`
- ✅ Search tracking في `SearchBarComponent`
- ✅ Comment tracking في `UserOrdersComponent` (تقييمات)
- ✅ `trackCartAdd` method في `AnalyticsTrackingService`
- ✅ `trackPurchaseBatch` method في `AnalyticsTrackingService`
- ✅ جعل `productId` اختياري في `trackEvent` لدعم أحداث search

### تم تعديل:
- ✅ `AnalyticsTrackingService.trackEvent` - `productId` أصبح اختياري
- ✅ `trackComment` method - أضيف `commentId` و `location` parameters
- ✅ Backend `verifyOrderPayment` endpoint - يرجع الآن `products`, `orderId`, `totalAmount`
- ✅ `OrderCallbackComponent` - يستخدم `trackPurchaseBatch` بدلاً من loop
- ✅ Backend `trackEvent` endpoint - `productId` أصبح اختياري (يدعم search و purchase_batch)
- ✅ n8n V7 - إصلاح Search metadata mismatch (`$json.body.metadata.searchTerm`)
- ✅ n8n V7 - إضافة `purchase_batch` event type handling
- ✅ n8n V7 - إضافة `Track Purchase Batch` HTTP Request node
- ✅ n8n V7 - إضافة `Response - Purchase Batch` node
- ✅ n8n V7 - إضافة connections للـ purchase_batch flow
- ✅ n8n V7 - تحسين positions (منفصلة بـ 200px)
- ✅ n8n V7 - تحديث "other" condition لتستثني purchase_batch

### تم تحسين:
- ✅ Batch tracking للـ purchase بدلاً من multiple requests (أكثر موثوقية)
- ✅ Search tracking يستخدم debounce موجود بالفعل في SearchBarComponent (220ms)
- ✅ Comment tracking يرسل بيانات أكثر شمولية (commentId, location)
