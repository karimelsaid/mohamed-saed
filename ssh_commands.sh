# ===============================================
# أوامر للتنفيذ في SSH session على السيرفر الجديد
# 162.35.163.242
# ===============================================

# 1. فحص ملفات الكتب الإلكترونية على السيرفر الجديد
ls /var/www/kenouz/Backend/uploads/ebooks/ 2>/dev/null | wc -l

# 2. فحص مسار التطبيق (مكان الملفات)
find / -name "*.epub" 2>/dev/null | head -20

# 3. فحص المسارات المحتملة للتطبيق
ls /var/www/ 2>/dev/null
ls /home/ 2>/dev/null
ls /root/ 2>/dev/null
ls /opt/ 2>/dev/null

# 4. ابحث عن pm2 أو node processes
pm2 list 2>/dev/null
ps aux | grep node

# 5. لو وجدت المسار - افحص محتوى uploads
# مثال: ls /var/www/kenouz/Backend/uploads/ebooks/ | head -30

# ===============================================
# لو الملفات موجودة على السيرفر الجديد، اعمل هذا
# من جهازك المحلي (مش من داخل SSH):
# ===============================================

# نقل الملفات من السيرفر الجديد لجهازك المحلي:
# rsync -avz root@162.35.163.242:/PATH_TO_UPLOADS/ebooks/ /Users/orabi/Downloads/kenouz/Backend/uploads/ebooks/
# rsync -avz root@162.35.163.242:/PATH_TO_UPLOADS/products/ /Users/orabi/Downloads/kenouz/Backend/uploads/products/
# rsync -avz root@162.35.163.242:/PATH_TO_UPLOADS/books/ /Users/orabi/Downloads/kenouz/Backend/uploads/books/
