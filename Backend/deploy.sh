#!/bin/bash
chown -R www-data:www-data /var/www/kenouz/dist/
chmod -R 755 /var/www/kenouz/dist/
pm2 restart kenouz-backend
