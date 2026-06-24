#!/bin/bash

# ============================================
# n8n Auto-Installation Script for Ubuntu
# Target Server: 162.35.163.242
# Domain: n8n.knoozbook.com
# ============================================

set -e

echo "🚀 Starting n8n Installation Process..."
echo "📍 Target: n8n.knoozbook.com (162.35.163.242)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="n8n.knoozbook.com"
N8N_PORT=5678
N8N_USER="n8n"
N8N_PASSWORD=$(openssl rand -base64 16)
N8N_ENCRYPTION_KEY=$(openssl rand -base64 32)

echo "🔧 Step 1: Updating system..."
apt update && apt upgrade -y

echo "🔧 Step 2: Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs npm

echo "🔧 Step 3: Installing required packages..."
apt install -y nginx git redis-server certbot python3-certbot-nginx ufw

echo "🔧 Step 4: Creating n8n user..."
if id "$N8N_USER" &>/dev/null; then
    echo "✅ User $N8N_USER already exists"
else
    useradd -r -s /bin/false $N8N_USER
    echo "✅ User $N8N_USER created"
fi

echo "🔧 Step 5: Creating data directory..."
mkdir -p /var/lib/n8n
chown $N8N_USER:$N8N_USER /var/lib/n8n

echo "🔧 Step 6: Installing n8n globally..."
npm install -g n8n

echo "🔧 Step 7: Setting up SSL with Let's Encrypt..."
echo "⚠️  Make sure you have pointed $DOMAIN to this server IP"
read -p "Press Enter to continue with SSL setup..."

certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@knoozbook.com

echo "🔧 Step 8: Configuring Nginx..."
cat > /etc/nginx/sites-available/$DOMAIN <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://127.0.0.1:$N8N_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /webhook {
        proxy_pass http://127.0.0.1:$N8N_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl restart nginx

echo "🔧 Step 9: Configuring Redis..."
systemctl start redis-server
systemctl enable redis-server

echo "🔧 Step 10: Creating n8n systemd service..."
cat > /etc/systemd/system/n8n.service <<EOF
[Unit]
Description=n8n workflow automation
After=network.target

[Service]
Type=simple
User=$N8N_USER
Environment=NODE_ENV=production
Environment=WEBHOOK_URL=https://$DOMAIN/
Environment=N8N_PORT=$N8N_PORT
Environment=N8N_PROTOCOL=https
Environment=N8N_HOST=0.0.0.0
Environment=N8N_PATH=/
Environment=EXECUTIONS_MODE=queue
Environment=QUEUE_BULL_REDIS_HOST=localhost
Environment=QUEUE_BULL_REDIS_PORT=6379
Environment=BASIC_AUTH_ACTIVE=true
Environment=BASIC_AUTH_USER=admin
Environment=BASIC_AUTH_PASSWORD=$N8N_PASSWORD
Environment=N8N_ENCRYPTION_KEY=$N8N_ENCRYPTION_KEY
WorkingDirectory=/var/lib/n8n
ExecStart=/usr/bin/n8n start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo "🔧 Step 11: Configuring Firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "🔧 Step 12: Starting n8n..."
systemctl start n8n
systemctl enable n8n

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Installation Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📍 n8n URL: https://$DOMAIN"
echo "👤 Username: admin"
echo "🔑 Password: $N8N_PASSWORD"
echo "🔐 Encryption Key: $N8N_ENCRYPTION_KEY"
echo ""
echo "⚠️  SAVE THESE CREDENTIALS SECURELY!"
echo ""
echo "📊 Check n8n status:"
echo "   systemctl status n8n"
echo ""
echo "📋 View logs:"
echo "   journalctl -u n8n -f"
echo ""
echo "═══════════════════════════════════════════════════════════"

# Save credentials to file
cat > /root/n8n-credentials.txt <<EOF
n8n Credentials
===============
URL: https://$DOMAIN
Username: admin
Password: $N8N_PASSWORD
Encryption Key: $N8N_ENCRYPTION_KEY

Generated on: $(date)
EOF

chmod 600 /root/n8n-credentials.txt
echo "📁 Credentials saved to: /root/n8n-credentials.txt"
