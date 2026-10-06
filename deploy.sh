#!/bin/bash
# =============================================
# 🚀 Kenouz Deployment Script
# =============================================
# غيّر السطر التالي فقط حسب التطبيق المراد بناؤه:
#
# لبناء واتن:     BUILD_CMD="npm run watin:build:prod"
# لبناء كنوز:     BUILD_CMD="npm run build:prod"
# أو أي أمر آخر: BUILD_CMD="npm run myapp:build"
# =============================================

BUILD_CMD="npm run watin:build:prod"

# =============================================
# ⚙️ إعدادات (لا تغيّرها عادةً)
# =============================================
LOCAL_BACKEND="/Users/orabi/Downloads/kenouz/Backend/"
LOCAL_DIST="/Users/orabi/Downloads/kenouz/dist/"
REMOTE_SERVER="root@162.35.163.242"
REMOTE_PATH="/var/www/kenouz/"

EXCLUDES=(
  --exclude='node_modules'
  --exclude='uploads'
  --exclude='output.json'
  --exclude='output_raw.json'
  --exclude='requests.log'
  --exclude='*.log'
  --exclude='*.mp3'
  --exclude='*.png'
  --exclude='*.jpg'
  --exclude='.env'
  --exclude='.git'
  --exclude='.DS_Store'
)

# =============================================
# 🏗️ البناء
# =============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏗️  جاري البناء: $BUILD_CMD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
eval $BUILD_CMD || { echo "❌ فشل البناء!"; exit 1; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📤 جاري رفع Backend..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
rsync -avzc --progress "${EXCLUDES[@]}" \
  "$LOCAL_BACKEND" "$REMOTE_SERVER:$REMOTE_PATH" || { echo "❌ فشل رفع Backend!"; exit 1; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📤 جاري رفع dist..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
rsync -avzc --progress "${EXCLUDES[@]}" \
  "$LOCAL_DIST" "$REMOTE_SERVER:$REMOTE_PATH" || { echo "❌ فشل رفع dist!"; exit 1; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 جاري ضبط الصلاحيات وإعادة التشغيل..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh "$REMOTE_SERVER" "\
  chmod 755 $REMOTE_PATH && \
  chown -R www-data:www-data ${REMOTE_PATH}dist && \
  chmod -R 755 ${REMOTE_PATH}dist && \
  cd $REMOTE_PATH && \
  pm2 restart kenouz-backend && \
  nginx -s reload" || { echo "❌ فشل إعادة التشغيل!"; exit 1; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ تم النشر بنجاح! 🎉"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
