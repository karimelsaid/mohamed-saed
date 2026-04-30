#!/bin/bash
# MongoDB Atlas Backup Script
# Usage: ./backup.sh
# Crontab: 0 3 * * * /path/to/Backend/scripts/backup.sh

BACKUP_DIR="$(dirname "$0")/../backups"
DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_PATH="$BACKUP_DIR/$DATE"

# Load env file if exists
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

MONGO_URI="${MONGO_URI:-mongodb+srv://localhost:27017/kenouz}"

echo "🔄 Starting MongoDB backup..."
echo "📁 Backup directory: $BACKUP_PATH"

mkdir -p "$BACKUP_PATH"

# Run mongodump
mongodump --uri="$MONGO_URI" --out="$BACKUP_PATH" --gzip 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Backup completed successfully: $BACKUP_PATH"
    
    # Remove backups older than 7 days
    find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null
    echo "🗑️ Old backups cleaned (keeping last 7 days)"
else
    echo "❌ Backup failed!"
    exit 1
fi
