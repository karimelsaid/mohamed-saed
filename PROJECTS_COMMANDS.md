# PROJECTS COMMANDS

> This file contains all commands for running, building, and deploying projects.
> **هذا الملف يحتوي على جميع الأوامر لتشغيل وبناء ونشر المشاريع**
> **IMPORTANT**: When adding a new project, add its commands here following the same format.
> **مهم**: عند إضافة مشروع جديد، أضف أوامره هنا بنفس التنسيق

---

## 📋 Table of Contents / جدول المحتويات

- [Project Structure](#project-structure) - هيكل المشروع
- [Port Configuration](#port-configuration) - تكوين البورتات
- [Running Projects](#running-projects) - تشغيل المشاريع
- [Docker Commands](#docker-commands) - أوامر Docker
- [Project-Specific Commands](#project-specific-commands) - أوامر خاصة بكل مشروع
  - [Kenouz (Main)](#kenouz-main) - مشروع كنوز الرئيسي
  - [Mushaf](#mushaf) - مشروع المصحف
  - [Watin](#watin) - مشروع واتن
  - [Kemi](#kemi) - مشروع كيمي
  - [Mihnati](#mihnati) - مشروع مهناتي
  - [Mohamed Saed](#mohamed-saed) - مشروع محمد سعيد
  - [Backend](#backend) - الخادم الخلفي
- [Building for Production](#building-for-production) - البناء للإنتاج

---

## Project Structure / هيكل المشروع

```
Kenouz/
├── node_modules/              # Shared dependencies / المكتبات المشتركة
├── projects/
│   ├── watin/                # Watin project / مشروع واتن
│   ├── mushaf/               # Mushaf project / مشروع المصحف
│   ├── mihnati/              # Mihnati Platform (API + Web) / منصة مهناتي
│   ├── kemi/                 # Kemi project / مشروع كيمي
│   └── mohamed-saed/         # Mohamed Saed project / مشروع محمد سعيد
├── Backend/                  # Main backend / الخادم الخلفي الرئيسي
├── src/                      # Main frontend (Kenouz) / الواجهة الأمامية الرئيسية
├── docker-compose.yml        # Docker orchestration / إدارة Docker
└── PROJECTS_COMMANDS.md      # This file - Add new project commands here / هذا الملف - أضف أوامر المشاريع الجديدة هنا
```

---

## Port Configuration / تكوين البورتات

| Project | Port | Type | Proxy |
|---------|------|------|-------|
| Kenouz (Main) | 4200 | Angular + SSR | proxy.conf.json |
| Kemi | 4201 | Angular + Electron | None / لا يوجد |
| Mihnati Web | 4202 | Angular | proxy.conf.json |
| Mihnati API | 4203 | Express + MongoDB | None / لا يوجد |
| Mushaf | 4204 | Angular | proxy.conf.json |
| Watin (Frontend) | 4205 | Angular | projects/watin/watin-proxy.conf.json |
| Watin (Backend) | 5050 | Python FastAPI | None / لا يوجد |
| Mohamed Saed | N/A | Electron Desktop | None / لا يوجد |
| Backend | 3000 | Express | None / لا يوجد |
| MongoDB | 27017 | Database | None / لا يوجد |

---

## Running Projects / تشغيل المشاريع

### Quick Start / البدء السريع

```bash
# Run Kenouz (Main Project) / تشغيل مشروع كنوز الرئيسي
npm start

# Run specific projects / تشغيل مشاريع محددة
npm run mushaf:serve          # تشغيل المصحف
npm run watin:serve          # تشغيل واتن
npm run mohamed-saed:desktop # تشغيل محمد سعيد (تطبيق سطح المكتب)
```

### Using Docker Compose (Recommended) / استخدام Docker Compose (موصى به)

```bash
# Run all services / تشغيل جميع الخدمات
docker-compose up

# Run specific service / تشغيل خدمة محددة
docker-compose up kenouz       # تشغيل كنوز
docker-compose up kemi         # تشغيل كيمي
docker-compose up mihnati-api  # تشغيل API مهناتي
docker-compose up mihnati-web  # تشغيل واجهة مهناتي
docker-compose up backend      # تشغيل الخادم الخلفي

# Build and run / البناء والتشغيل
docker-compose up --build

# Run in background / التشغيل في الخلفية
docker-compose up -d

# Stop all services / إيقاف جميع الخدمات
docker-compose down

# Stop and remove volumes / الإيقاف وحذف البيانات
docker-compose down -v
```

**Note**: Electron apps (Kemi, Mohamed Saed) cannot run in Docker. Use manual commands below.
**ملاحظة**: تطبيقات Electron (كيمي، محمد سعيد) لا يمكن تشغيلها في Docker. استخدم الأوامر اليدوية أدناه.

---

## Docker Commands / أوامر Docker

### Docker Compose Services / خدمات Docker Compose

All services are connected via `kenouz-network` bridge network.
جميع الخدمات متصلة عبر شبكة `kenouz-network`.

#### Available Services / الخدمات المتاحة:
- **kenouz**: Main Angular application (port 4200) / التطبيق الرئيسي Angular
- **kemi**: Kemi Angular application (port 4201) / تطبيق كيمي Angular
- **mihnati-web**: Mihnati frontend (port 4202) / واجهة مهناتي
- **mihnati-api**: Mihnati Express API (port 4203) / API مهناتي
- **mihnati-mongo**: MongoDB database (port 27017) / قاعدة بيانات MongoDB
- **backend**: Main Express backend (port 3000) / الخادم الخلفي الرئيسي

#### Docker Commands / أوامر Docker

```bash
# View logs / عرض السجلات
docker-compose logs kenouz          # عرض سجلات كنوز
docker-compose logs -f              # متابعة السجلات الحية

# Restart service / إعادة تشغيل الخدمة
docker-compose restart kenouz

# Rebuild service / إعادة بناء الخدمة
docker-compose up -d --build kenouz

# Check status / فحص الحالة
docker-compose ps

# Execute command in container / تنفيذ أمر داخل الحاوية
docker-compose exec kenouz npm test  # تشغيل الاختبارات داخل الحاوية
```

---

## Project-Specific Commands / أوامر خاصة بكل مشروع

### Kenouz (Main) / كنوز (الرئيسي)

#### Development / التطوير

```bash
# Start development server / تشغيل خادم التطوير
npm start                           # تشغيل على البورت 4200 مع البروكسي
# or / أو
npm run dev                         # تشغيل مع فتح المتصفح تلقائياً

# Start without SSR / تشغيل بدون Server-Side Rendering
npm run dev:no-ssr                  # أسرع للتطوير لكن بدون SSR

# Watch mode / وضع المراقبة (إعادة بناء تلقائية عند التغيير)
npm run watch
```

#### Building / البناء

```bash
# Build for production / البناء للإنتاج
npm run build                       # بناء عادي

# Build for production with mobile / البناء للإنتاج مع نسخة الموبايل
npm run build:prod                  # بناء + إنشاء ملف zip للموبايل

# Build Kenouz only / بناء كنوز فقط
npm run kenouz:build
```

#### Mobile (Capacitor) / الموبايل

```bash
# Sync Android / مزامنة أندرويد
npm run capacitor:sync              # مزامنة ملفات الويب مع مشروع أندرويد

# Open Android Studio / فتح Android Studio
npm run android:open                # فتح المشروع في Android Studio

# Run on Android device/emulator / التشغيل على جهاز أندرويد أو المحاكي
npm run android:run                 # بناء وتشغيل على أندرويد

# Sync iOS / مزامنة iOS
npm run capacitor:sync:ios          # مزامنة ملفات الويب مع مشروع iOS

# Open Xcode / فتح Xcode
npm run ios:open                    # فتح المشروع في Xcode

# Run on iOS simulator / التشغيل على محاكي iOS
npm run ios:run                     # بناء وتشغيل على iOS
```

---

### Mushaf / المصحف

#### Development / التطوير

```bash
# Start development server / تشغيل خادم التطوير
npm run mushaf:serve                # تشغيل على البورت 4204 مع البروكسي

# Start without SSR / تشغيل بدون Server-Side Rendering
npm run mushaf:dev:no-ssr           # أسرع للتطوير لكن بدون SSR
```

#### Building / البناء

```bash
# Build for production / البناء للإنتاج
npm run mushaf:build                # بناء عادي

# Build for production with zip / البناء للإنتاج مع إنشاء ملف zip
npm run mushaf:build:prod           # بناء + إنشاء ملف zip

# Create zip file / إنشاء ملف zip
npm run mushaf:zip                  # إنشاء ملف zip للنشر
```

#### Mobile (Capacitor) / الموبايل

```bash
# Sync Android / مزامنة أندرويد
npm run mushaf:android:sync         # مزامنة مع مشروع أندرويد في projects/mushaf/mushaf-wird-mobile

# Open Android Studio / فتح Android Studio
npm run mushaf:android:open         # فتح في Android Studio

# Run on Android device/emulator / التشغيل على أندرويد
npm run mushaf:android:run          # بناء وتشغيل على أندرويد

# Sync iOS / مزامنة iOS
npm run mushaf:ios:sync             # مزامنة مع مشروع iOS

# Open Xcode / فتح Xcode
npm run mushaf:ios:open             # فتح في Xcode

# Run on iOS simulator / التشغيل على iOS
npm run mushaf:ios:run              # بناء وتشغيل على iOS
```

---

### Watin / واتن

#### Development / التطوير

```bash
# Start development server / تشغيل خادم التطوير
npm run watin:serve                 # تشغيل على البورت 4205 مع البروكسي الخاص

# Start without SSR / تشغيل بدون Server-Side Rendering
npm run watin:dev:no-ssr            # أسرع للتطوير لكن بدون SSR
```

#### Building / البناء

```bash
# Build for production / البناء للإنتاج
npm run watin:build                 # بناء عادي

# Build for production with zip / البناء للإنتاج مع إنشاء ملف zip
npm run watin:build:prod            # بناء + إنشاء ملف zip

# Create zip file / إنشاء ملف zip
npm run watin:zip                   # إنشاء ملف zip للنشر
```

#### Mobile (Capacitor) / الموبايل

```bash
# Sync Android / مزامنة أندرويد
npm run watin:android:sync          # مزامنة مع مشروع أندرويد في projects/watin/watin-mobile

# Open Android Studio / فتح Android Studio
npm run watin:android:open          # فتح في Android Studio

# Run on Android device/emulator / التشغيل على أندرويد
npm run watin:android:run           # بناء وتشغيل على أندرويد

# Build APK / بناء ملف APK
npm run watin:android:build-apk     # بناء ملف APK للتثبيت اليدوي

# Build AAB (for Play Store) / بناء ملف AAB (لمتجر Play Store)
npm run watin:android:build-aab     # بناء ملف AAB للنشر على Play Store

# Sync iOS / مزامنة iOS
npm run watin:ios:sync              # مزامنة مع مشروع iOS

# Open Xcode / فتح Xcode
npm run watin:ios:open              # فتح في Xcode

# Run on iOS simulator / التشغيل على iOS
npm run watin:ios:run               # بناء وتشغيل على iOS
```

#### Backend (Python) / الخادم الخلفي (Python)

**⚠️ IMPORTANT: Python FastAPI Backend / مهم: خادم خلفي Python**
Watin has a Python backend for transcription services on port 5050.
واتن لديه خادم خلفي Python لخدمات التفريغ على البورت 5050.

**Project Location / موقع المشروع**: `projects/watin/watin-transcriber/`

```bash
# From root directory (Recommended) / من المجلد الرئيسي (موصى به)
npm run watin:backend               # تشغيل backend Watin (Python) - يعمل على جميع الأنظمة

# Or navigate to project / أو الانتقال للمشروع
cd projects/watin/watin-transcriber

# Windows CMD/PowerShell / Windows CMD/PowerShell
start.bat                            # سكريبت مخصص للنوافذ

# Git Bash/WSL/Linux / Git Bash/WSL/Linux
bash start.sh                        # سكريبت مخصص للأنظمة المثلية

# Manual method / الطريقة اليدوية
# Windows CMD/PowerShell:
venv\Scripts\activate && python server.py

# Git Bash/WSL/Linux:
source venv/bin/activate && python server.py
```

**Dependencies / المكتبات المطلوبة**:
```bash
# Install if needed / ثبت إذا لزم الأمر
python -m pip install fastapi uvicorn faster-whisper rapidfuzz python-multipart av
```

**What it does / ما يفعله**:
- Quran lecture transcription service / خدمة تفريغ الدروس القرآنية
- Uses Faster Whisper model / يستخدم نموذج Faster Whisper
- Processes audio files for transcription / يعالج ملفات الصوت للتفريغ
- Connected via proxy / متصل عبر البروكسي في projects/watin/watin-proxy.conf.json

---

### Kemi / كيمي

#### Project Location / موقع المشروع
`projects/kemi/`

#### Development / التطوير

```bash
# Navigate to project / الانتقال إلى المشروع
cd projects/kemi

# Start development server / تشغيل خادم التطوير
npm start                           # تشغيل على البورت 4201

# Build project / بناء المشروع
npm run build

# Watch mode / وضع المراقبة
npm run watch
```

#### Electron Desktop / تطبيق سطح المكتب

```bash
# Build Electron / بناء Electron
npm run build:electron              # بناء ملفات Electron

# Run Electron / تشغيل Electron
npm run electron                    # تشغيل التطبيق

# Run Electron in development mode / تشغيل Electron في وضع التطوير
npm run electron:dev                # تشغيل مع إعادة تحميل تلقائية
```

#### Distribution / التوزيع

```bash
# Build for macOS / البناء لـ macOS
npm run dist:mac                    # إنشاء ملف .zip لـ macOS

# Build for Windows / البناء لـ Windows
npm run dist:win                    # إنشاء ملف .zip لـ Windows

# Build for current platform / البناء للنظام الحالي
npm run dist                        # بناء لنظام التشغيل الحالي
```

---

### Mihnati / مهناتي

#### Project Location / موقع المشروع
`projects/mihnati/`

#### Development / التطوير

```bash
# Navigate to project / الانتقال إلى المشروع
cd projects/mihnati

# Install dependencies (if needed) / تثبيت المكتبات (إذا لزم الأمر)
pnpm install                        # استخدام pnpm بدلاً من npm

# Run API / تشغيل API
pnpm dev:api                        # تشغيل خادم API على البورت 4203

# Run Web / تشغيل الواجهة
pnpm dev:web                        # تشغيل الواجهة على البورت 4202
```

#### Building / البناء

```bash
# Build all packages and apps / بناء جميع الحزم والتطبيقات
pnpm build                          # بناء كل شيء في المشروع

# Type checking / فحص الأنواع
pnpm typecheck                      # فحص TypeScript

# Linting / فحص جودة الكود
pnpm lint                           # فحص الكود باستخدام ESLint
```

#### Database / قاعدة البيانات

```bash
# Run migrations / تشغيل الترحيلات
pnpm migrate                        # تطبيق تغييرات قاعدة البيانات
```

#### API Only / API فقط

```bash
# Navigate to API / الانتقال إلى API
cd projects/mihnati/apps/api

# Run in development / التشغيل في وضع التطوير
npm run dev                         # تشغيل مع إعادة تحميل تلقائية

# Build / البناء
npm run build                       # بناء TypeScript إلى JavaScript

# Start production / التشغيل في الإنتاج
npm run start                       # تشغيل النسخة المبنية

# Seed admin user / إنشاء مستخدم مدير
npm run seed:admin                  # إضافة مستخدم مدير للقاعدة

# Seed test users / إنشاء مستخدمين تجريبيين
npm run seed:users                  # إضافة مستخدمين للاختبار

# Type check / فحص الأنواع
npm run typecheck                   # فحص TypeScript
```

#### Web Only / الواجهة فقط

```bash
# Navigate to Web / الانتقال إلى الواجهة
cd projects/mihnati/apps/web

# Run in development / التشغيل في وضع التطوير
npm run dev                         # تشغيل على البورت 4202

# Build / البناء
npm run build                       # بناء Angular

# Type check / فحص الأنواع
npm run typecheck                   # فحص TypeScript
```

---

### Mohamed Saed / محمد سعيد

#### Project Location / موقع المشروع
`projects/mohamed-saed/`

#### **⚠️ IMPORTANT: Electron Desktop Application / مهم: تطبيق سطح مكتب**
This is a Windows Desktop application using Electron + SQLite. It does NOT run on a web port.
هذا تطبيق سطح مكتب Windows يستخدم Electron + SQLite. لا يعمل على بورت ويب.

#### Development / التطوير

```bash
# From root directory / من المجلد الرئيسي
npm run mohamed-saed:desktop        # تشغيل تطبيق سطح المكتب

# Or navigate to project / أو الانتقال إلى المشروع
cd projects/mohamed-saed

# Run desktop app (Electron) / تشغيل تطبيق سطح المكتب
npm start                           # تشغيل التطبيق
# or / أو
npm run dev                         # نفس الأمر

# Run web version (development) / تشغيل النسخة الويب (للتطوير)
npm run dev:web                     # تشغيل نسخة ويب للاختبار
```

#### Building / البناء

```bash
# Build desktop app / بناء تطبيق سطح المكتب
npm run build                       # بناء الملفات

# Create Windows installer (.exe) / إنشاء ملف التثبيت
npm run dist                        # إنشاء ملف .exe للتثبيت
```

#### Distribution / التوزيع

```bash
# Patch release / إصدار تصحيح (0.0.1 -> 0.0.2)
npm run release                     # زيادة رقم التصحيح

# Minor release / إصدار ثانوي (0.0.2 -> 0.1.0)
npm run release:minor               # زيادة الرقم الثانوي

# Major release / إصدار رئيسي (0.1.0 -> 1.0.0)
npm run release:major               # زيادة الرقم الرئيسي
```

**Note**: This app requires Windows to run. It uses SQLite for local database storage.
**ملاحظة**: هذا التطبيق يتطلب Windows للعمل. يستخدم SQLite لتخزين البيانات محلياً.

---

### Backend / الخادم الخلفي

#### Project Location / موقع المشروع
`Backend/`

#### Development / التطوير

```bash
# Navigate to Backend / الانتقال إلى الخادم الخلفي
cd Backend

# Start server / تشغيل الخادم
node app.js                         # تشغيل على البورت 3000

# Or using PM2 (production) / أو استخدام PM2 (للإنتاج)
pm2 start ecosystem.config.js       # تشغيل باستخدام PM2

# Deploy / النشر
./deploy.sh                         # سكريبت النشر
```

#### Environment / البيئة

```bash
# Copy example env file / نسخ ملف البيئة المثال
cp .env.example .env                # نسخ ملف البيئة

# Edit .env with your configuration / تعديل ملف البيئة بالتكوين الخاص بك
# افتح .env وأضف المفاتيح المطلوبة (MongoDB, API keys, etc.)
```

---

## Building for Production / البناء للإنتاج

### Kenouz / كنوز

```bash
npm run build:prod                  # بناء للإنتاج + إنشاء ملف zip للموبايل
```

### Kemi / كيمي

```bash
cd projects/kemi
npm run build                       # بناء Angular
npm run dist                        # إنشاء ملف التوزيع
```

### Mihnati / مهناتي

```bash
cd projects/mihnati
pnpm build                          # بناء API و Web
```

### Mohamed Saed / محمد سعيد

```bash
cd projects/mohamed-saed
npm run build                       # بناء التطبيق
npm run dist                        # إنشاء ملف .exe
```

### Backend / الخادم الخلفي

```bash
cd Backend
# Production setup uses PM2 or similar / الإنتاج يستخدم PM2 أو مشابه
pm2 start ecosystem.config.js       # تشغيل باستخدام PM2
```

---

## 📝 Adding a New Project / إضافة مشروع جديد

When adding a new project, follow this format:
عند إضافة مشروع جديد، اتبع هذا التنسيق:

### 1. Add to Port Configuration Table / إضافة لجدول البورتات

Add your project to the [Port Configuration](#port-configuration) table with:
أضف مشروعك لجدول [تكوين البورتات](#port-configuration) مع:
- Project name / اسم المشروع
- Port number (if applicable) / رقم البورت (إذا كان ينطبق)
- Type (Angular, Express, Electron, etc.) / النوع (Angular, Express, Electron, إلخ)
- Proxy file (if needed) / ملف البروكسي (إذا لزم الأمر)

### 2. Add Project-Specific Commands Section / إضافة قسم الأوامر الخاصة

Create a new section following this format:
أنشئ قسم جديد يتبع هذا التنسيق:

```markdown
### [Project Name] / [اسم المشروع]

#### Project Location / موقع المشروع
`projects/[project-name]/`

#### Development / التطوير

```bash
# Command 1 / الأمر 1
npm run [command]

# Command 2 / الأمر 2
npm run [command]
```

#### Building / البناء

```bash
# Build command / أمر البناء
npm run build
```

#### [Other Categories] / [فئات أخرى]

```bash
# Additional commands / أوامر إضافية
```
```

### 3. Add to Root package.json / إضافة لـ package.json الرئيسي

Add convenience scripts to root `package.json`:
أضف سكريبتات مريضة لـ `package.json` الرئيسي:

```json
"[project-name]:[command]": "cd projects/[project-name] && npm run [command]"
```

### 4. Update Docker Compose (if applicable) / تحديث Docker Compose (إذا لزم الأمر)

If the project can run in Docker, add it to `docker-compose.yml`.
إذا كان المشروع يمكن تشغيله في Docker، أضفه لـ `docker-compose.yml`.

### 5. Create Dockerfile (if applicable) / إنشاء Dockerfile (إذا لزم الأمر)

Create a `Dockerfile` in the project directory.
أنشئ `Dockerfile` في مجلد المشروع.

### 6. Update .dockerignore / تحديث .dockerignore

Add `.dockerignore` file to the project directory.
أضف ملف `.dockerignore` لمجلد المشروع.

---

## � Proxy Configuration / تكوين البروكسي

The projects use proxy configuration files to route API requests during development and production.
المشاريع تستخدم ملفات تكوين البروكسي لتوجيه طلبات API أثناء التطوير والإنتاج.

### Proxy Files / ملفات البروكسي

**Development (Development Mode) / التطوير**:
- `proxy.conf.dev.json` - Kenouz & Mushaf (connects to localhost:3000)
  - proxy.conf.dev.json - كنوز والمصحف (يتصل بـ localhost:3000)
- `projects/watin/watin-proxy.conf.dev.json` - Watin (connects to localhost:5050)
  - projects/watin/watin-proxy.conf.dev.json - واتن (يتصل بـ localhost:5050)

**Production (Production Mode) / الإنتاج**:
- `proxy.conf.prod.json` - Kenouz & Mushaf (connects to https://knoozbook.com)
  - proxy.conf.prod.json - كنوز والمصحف (يتصل بـ https://knoozbook.com)
- `projects/watin/watin-proxy.conf.json` - Watin (connects to production)
  - projects/watin/watin-proxy.conf.json - واتن (يتصل بالإنتاج)

### How it works / كيف يعمل

**Development / التطوير**:
- `/api` → `http://localhost:3000` (Main Backend / الخادم الخلفي الرئيسي)
- `/api/transcription` → `http://localhost:5050` (Watin Backend Python / خادم واتن Python)
- `/uploads` → `http://localhost:3000`
- `/socket.io` → `http://localhost:3000`
- `/admin` → `http://localhost:3000`

**Production / الإنتاج**:
- All requests → `https://knoozbook.com`
- جميع الطلبات → `https://knoozbook.com`

### Scripts Updated / السكريبتات المحدثة

All npm scripts now use `proxy.conf.dev.json` for development by default.
جميع سكريبتات npm تستخدم `proxy.conf.dev.json` للتطوير افتراضياً.

---

## �🚀 Quick Reference / مرجع سريع

### Start All Web Projects / تشغيل جميع مشاريع الويب

```bash
# Terminal 1 - Kenouz / محطة 1 - كنوز
npm start                           # http://localhost:4200

# Terminal 2 - Mushaf / محطة 2 - المصحف
npm run mushaf:serve                # http://localhost:4204

# Terminal 3 - Watin (Frontend) / محطة 3 - واجهة واتن
npm run watin:serve                 # http://localhost:4205

# Terminal 4 - Watin (Backend) / محطة 4 - خادم واتن (Python)
npm run watin:backend               # http://localhost:5050

# Terminal 5 - Mihnati API / محطة 5 - API مهناتي
cd projects/mihnati && pnpm dev:api  # http://localhost:4203

# Terminal 6 - Mihnati Web / محطة 6 - واجهة مهناتي
cd projects/mihnati && pnpm dev:web  # http://localhost:4202

# Terminal 7 - Backend (Main) / محطة 7 - الخادم الخلفي الرئيسي
cd Backend && node app.js            # http://localhost:3000

# ⚠️ IMPORTANT / مهم:
# Watin Frontend depends on Main Backend (port 3000) for data
# واجهة واتن تعتمد على الخادم الخلفي الرئيسي (البورت 3000) للبيانات
# Watin Backend (port 5050) is only for transcription service
# خادم واتن (البورت 5050) فقط لخدمة التفريغ
```

### Start Desktop Apps / تشغيل تطبيقات سطح المكتب

```bash
# Terminal 1 - Kemi / محطة 1 - كيمي
cd projects/kemi && npm run electron:dev

# Terminal 2 - Mohamed Saed / محطة 2 - محمد سعيد
cd projects/mohamed-saed && npm start
```

### Docker All-in-One / Docker الكل في واحد

```bash
docker-compose up                    # تشغيل كل شيء في Docker
```

---

## 📚 Additional Resources / موارد إضافية

- [Angular CLI Documentation](https://angular.io/cli) / وثائق Angular CLI
- [Electron Documentation](https://www.electronjs.org/docs) / وثائق Electron
- [Docker Compose Documentation](https://docs.docker.com/compose/) / وثائق Docker Compose
- [Capacitor Documentation](https://capacitorjs.com/docs) / وثائق Capacitor

---

**Last Updated**: 2026-11-14 / **آخر تحديث**: 2026-11-14
