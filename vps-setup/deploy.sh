#!/bin/bash
# Deploy Shopify Builder (run on the VPS): git pull, env copy, npm ci, SQL files, build, PM2 reload.
#   ssh shiptrack-vps 'cd /var/www/builder && bash vps-setup/deploy.sh'
set -e
APP_DIR=/var/www/builder
ENV_FILE=/etc/builder/.env
[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE not found (run vps-setup/setup.sh first)"; exit 1; }
cd "$APP_DIR"
echo "[1/6] git pull"; git pull origin main
echo "[2/6] env";      cp "$ENV_FILE" .env.production.local
echo "[3/6] npm ci";   npm ci --production=false
echo "[4/6] SQL (additive, safe to run twice)"
for f in sql/*.sql; do sudo -u postgres psql -d builder -v ON_ERROR_STOP=1 -q -f "$f"; done
echo "[5/6] build";    NODE_ENV=production npm run build
echo "[6/6] pm2"
if pm2 describe builder > /dev/null 2>&1; then pm2 reload builder --update-env; else pm2 start ecosystem.config.js --env production; fi
pm2 save
echo "Live: $(git log -1 --oneline)"
