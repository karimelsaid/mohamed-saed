# خطوات دمج Google Sign-In لتطبيق Android باستخدام Capacitor

## الخطوات المطلوبة من الصفر:

### 1. إعداد Google Cloud Console
- إنشاء مشروع جديد أو استخدام موجود في Google Cloud Console
- تفعيل Google+ API أو Google Sign-In API
- إنشاء OAuth 2.0 Client ID للأندرويد:
  - Application type: Android
  - Package name: com.kenouz.bookstore2
  - SHA-1 certificate fingerprint: DE:4C:B4:2D:4C:9D:31:0F:F5:75:AD:83:7B:09:C7:70:DC:8C:ED:F1
  - احفظ Client ID (سيكون شكله مثل: 123456789-abcdef.apps.googleusercontent.com)

### 2. تثبيت الـ Plugin
- npm install @codetrix-studio/capacitor-google-auth

### 3. تحديث capacitor.config.json
- إضافة إعدادات الـ plugin

### 4. تحديث environment.ts
- إضافة client_id الجديد للأندرويد

### 5. تحديث login.component.ts
- استيراد الـ plugin
- كشف المنصة (Capacitor أو web)
- استخدام الـ plugin على الأندرويد، والطريقة الحالية على الويب

### 6. اختبار التطبيق
- بناء التطبيق: npm run build:prod
- مزامنة مع Capacitor: npm run capacitor:sync
- فتح في Android Studio: npx cap open android
- اختبار تسجيل الدخول بـ Google

## المهام المكتملة:
- [x] مراجعة الكود الحالي
- [x] الحصول على SHA-1 fingerprint
- [x] إعداد Google Cloud Console (يدوي من المستخدم)
- [x] تثبيت الـ plugin
- [x] تحديث capacitor.config.json
- [x] تحديث environment.ts
- [x] تحديث login.component.ts
- [x] تحديث register.component.ts
- [x] تحديث app.component.ts
- [x] اختبار على الأندرويد
