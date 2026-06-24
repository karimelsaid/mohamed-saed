# 🔧 إصلاح مشكلة SSL Certificate على n8n.knoozbook.com

## المشكلة
- الخطأ: `net::ERR_CERT_COMMON_NAME_INVALID`
- السبب: SSL Certificate لا يتطابق مع domain name بعد تغيير السيرفر

## الحل - تثبيت n8n مع SSL صحيح على السيرفر الجديد (162.35.163.242)

### الخطوة 1: الاتصال بالسيرفر

```bash
ssh root@162.35.163.242
```

### الخطوة 2: تحديث النظام وتثبيت المتطلبات

```bash
# تحديث النظام
apt update && apt upgrade -y

# تثبي_t Node.js (الإصدار 18 أو 20)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# تثبيت npm و git
apt install -y npm git nginx

# التحقق من التثبيت
node --version
npm --version
```

### الخطوة 3: تثبيت n8n

```bash
# تثبيت n8n عالمياً
npm install -g n8n

# إنشاء مستخدم n8n (لأسباب أمنية)
useradd -r -s /bin/false n8n

# إنشاء مجلد للبيانات
mkdir -p /var/lib/n8n
chown n8n:n8n /var/lib/n8n
```

### الخطوة 4: إعداد SSL Certificate باستخدام Let's Encrypt

```bash
# تثبيت certbot
apt install -y certbot python3-certbot-nginx

# الحصول على شهادة SSL
certbot --nginx -d n8n.knoozbook.com

# سيطلب منك:
# 1. إدخال email
# 2. الموافقة على الشروط
# 3. اختيار redirect to HTTPS (اختر 2)
```

### الخطوة 5: إعداد n8n كخدمة (Systemd Service)

```bash
# إنشاء ملف الخدمة
nano /etc/systemd/system/n8n.service
```

**أضف المحتوى التالي:**

```ini
[Unit]
Description=n8n workflow automation
After=network.target

[Service]
Type=simple
User=n8n
Environment=NODE_ENV=production
Environment=WEBHOOK_URL=https://n8n.knoozbook.com/
Environment=N8N_PORT=5678
Environment=N8N_PROTOCOL=https
Environment=N8N_HOST=0.0.0.0
Environment=N8N_PATH=/
Environment=EXECUTIONS_MODE=queue
Environment=QUEUE_BULL_REDIS_HOST=localhost
Environment=QUEUE_BULL_REDIS_PORT=6379
Environment=BASIC_AUTH_ACTIVE=true
Environment=BASIC_AUTH_USER=admin
Environment=BASIC_AUTH_PASSWORD=your_secure_password_here
Environment=N8N_ENCRYPTION_KEY=your_32_char_encryption_key_here
WorkingDirectory=/var/lib/n8n
ExecStart=/usr/bin/n8n start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**ملاحظة هامة:** قم بتغيير:
- `your_secure_password_here` بكلمة مرور قوية
- `your_32_char_encryption_key_here` بمفتاح تشفير 32 حرف

### الخطوة 6: إعداد Nginx كReverse Proxy

```bash
# إنشاء تكوين nginx
nano /etc/nginx/sites-available/n8n.knoozbook.com
```

**أضف المحتوى التالي:**

```nginx
server {
    listen 80;
    server_name n8n.knoozbook.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name n8n.knoozbook.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/n8n.knoozbook.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8n.knoozbook.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy to n8n
    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Webhook URL (إذا كنت تستخدم webhooks)
    location /webhook {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**تفعيل الموقع:**

```bash
# إنشاء رابط
ln -s /etc/nginx/sites-available/n8n.knoozbook.com /etc/nginx/sites-enabled/

# اختبار التكوين
nginx -t

# إعادة تشغيل nginx
systemctl restart nginx
```

### الخطوة 7: تثبيت Redis (لـ queue mode)

```bash
# تثبيت Redis
apt install -y redis-server

# تشغيل Redis
systemctl start redis-server
systemctl enable redis-server
```

### الخطوة 8: تشغيل n8n

```bash
# إعادة تحميل systemd
systemctl daemon-reload

# تشغيل n8n
systemctl start n8n

# تفعيل التشغيل التلقائي
systemctl enable n8n

# التحقق من الحالة
systemctl status n8n

# عرض logs
journalctl -u n8n -f
```

### الخطوة 9: فتح Firewall

```bash
# السماح بـ HTTP و HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# السماح بـ SSH (إذا لم يكن مسموحاً)
ufw allow 22/tcp

# تفعيل firewall
ufw enable
```

### الخطوة 10: التحقق من العمل

افتح المتصفح على:
```
https://n8n.knoozbook.com
```

- يجب أن يفتح بدون تحذيرات SSL
- أدخل username: `admin`
- أدخل password: الذي ضبطته في الخطوة 5

---

## 🔧 حل بديل إذا فشل Let's Encrypt

إذا لم يعمل Let's Encrypt، استخدم شهادة SSL مخصصة:

### إنشاء شهادة SSL مخصصة

```bash
# إنشاء مجلد للشهادات
mkdir -p /etc/nginx/ssl

# إنشاء private key
openssl genrsa -out /etc/nginx/ssl/n8n.key 2048

# إنشاء CSR
openssl req -new -key /etc/nginx/ssl/n8n.key -out /etc/nginx/ssl/n8n.csr

# عند السؤال عن Common Name، أدخل: n8n.knoozbook.com

# إنشاء self-signed certificate (للاختبار فقط)
openssl x509 -req -days 365 -in /etc/nginx/ssl/n8n.csr -signkey /etc/nginx/ssl/n8n.key -out /etc/nginx/ssl/n8n.crt
```

**تحديث nginx config لاستخدام الشهادة المخصصة:**

```nginx
ssl_certificate /etc/nginx/ssl/n8n.crt;
ssl_certificate_key /etc/nginx/ssl/n8n.key;
```

---

## 🔄 استيراد Workflows القديمة

إذا كان لديك workflows على السيرفر القديم:

```bash
# من السيرفر القديم
# تصدير workflows من n8n UI أو استخدام API

# على السيرفر الجديد
# استخدم script الاستيراد الذي أنشأناه:
cd /path/to/kenouz/Backend
N8N_API_KEY=your_new_api_key node scripts/import-n8n-workflows.js
```

---

## 📊 مراقبة n8n

```bash
# عرض logs
journalctl -u n8n -f

# إعادة تشغيل
systemctl restart n8n

# إيقاف
systemctl stop n8n

# عرض status
systemctl status n8n
```

---

## ⚠️ استكشاف الأخطاء

### المشكلة: n8n لا يعمل

```bash
# عرض logs
journalctl -u n8n -n 50

# التحقق من المنفذ
netstat -tlnp | grep 5678

# التحقق من nginx
nginx -t
systemctl status nginx
```

### المشكلة: SSL لا يعمل

```bash
# التحقق من الشهادة
certbot certificates

# تجديد الشهادة
certbot renew --dry-run

# إعادة تحميل nginx
systemctl reload nginx
```

### المشكلة: Webhooks لا تعمل

تأكد من:
1. `WEBHOOK_URL` في systemd service مضبوط على `https://n8n.knoozbook.com/`
2. nginx config يحتوي على `/webhook` location
3. firewall يسمح بالاتصال

---

## 📞 الدعم

إذا استمرت المشكلة:
1. تأكد من أن DNS `n8n.knoozbook.com` يشير إلى `162.35.163.242`
2. تحقق من أن المنفذ 443 مفتوح على السيرفر
3. تأكد من أن nginx يعمل: `systemctl status nginx`
