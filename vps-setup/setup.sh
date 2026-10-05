#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Shopify Builder: first-time setup on the SAME VPS as ShipTrack. Run ONCE as root:
#   ssh shiptrack-vps 'bash -s' < vps-setup/setup.sh        (or copy it over and run it there)
# It touches ONLY: /var/www/builder, /var/www/builder-uploads, /etc/builder, the PM2 app `builder`,
# the nginx site `builder` and the database `builder`. ShipTrack (`tracker`, port 3000) is untouched.
# Assumes Node 20+, PM2, nginx, certbot and PostgreSQL are already there (ShipTrack's 1-server-setup.sh).
# ═══════════════════════════════════════════════════════════════
set -e
DOMAIN="${DOMAIN:-merchantbuild.in}"
REPO="${REPO:-https://github.com/AadityaAggarwal2007/shopify-builder.git}"
APP_DIR=/var/www/builder
UPLOADS=/var/www/builder-uploads
ENV_DIR=/etc/builder

echo "[1/6] Folders"
mkdir -p "$APP_DIR" "$UPLOADS" "$ENV_DIR"
chmod 700 "$ENV_DIR"

echo "[2/6] Database builder + role builder_user (password printed ONCE below, put it in $ENV_DIR/.env)"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='builder_user'" | grep -q 1; then
  DB_PASS=$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE USER builder_user WITH PASSWORD '$DB_PASS';"
  echo "DATABASE_URL=postgresql://builder_user:$DB_PASS@localhost:5432/builder" > "$ENV_DIR/db-credentials.txt"
  chmod 600 "$ENV_DIR/db-credentials.txt"
  echo "    -> saved to $ENV_DIR/db-credentials.txt"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='builder'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE builder OWNER builder_user;"
fi

echo "[3/6] Code"
if [ ! -d "$APP_DIR/.git" ]; then git clone "$REPO" "$APP_DIR"; fi

echo "[4/6] Env file"
if [ ! -f "$ENV_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$ENV_DIR/.env"
  chmod 600 "$ENV_DIR/.env"
  echo "    -> $ENV_DIR/.env created from .env.example: fill it in (nano $ENV_DIR/.env), then run deploy.sh"
fi

echo "[5/6] nginx site $DOMAIN -> 127.0.0.1:3001 (+ /uploads/ from $UPLOADS)"
cat > /etc/nginx/sites-available/builder <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location /uploads/ {
        alias $UPLOADS/;
        expires 7d;
        access_log off;
        add_header Cache-Control "public";
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        client_max_body_size 200m;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/builder /etc/nginx/sites-enabled/builder
nginx -t && systemctl reload nginx

echo "[6/6] SSL (needs the DNS A record for $DOMAIN to point here already)"
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email "admin@merchantbuild.in" --redirect || echo "    certbot failed (DNS not ready?). Run later: certbot --nginx -d $DOMAIN --redirect"

echo ""
echo "Done. Next: fill $ENV_DIR/.env, then: cd $APP_DIR && bash vps-setup/deploy.sh"
