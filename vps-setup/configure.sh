#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Shopify Builder: fill /etc/builder/.env by answering questions (run on the VPS, as root):
#   ssh -t shiptrack-vps 'bash /var/www/builder/vps-setup/configure.sh'
# Generates the random secrets itself, keeps values you already saved (press Enter to keep),
# never prints a secret back. Safe to run again any time; deploy afterwards.
# ═══════════════════════════════════════════════════════════════
set -e
ENV_DIR=/etc/builder
ENV_FILE=$ENV_DIR/.env
CRED=$ENV_DIR/db-credentials.txt
mkdir -p "$ENV_DIR"; chmod 700 "$ENV_DIR"
touch "$ENV_FILE"; chmod 600 "$ENV_FILE"

# Values are written in single quotes: Next.js reads the env file like dotenv, where an unquoted
# `$x` expands and `#` starts a comment, which silently broke a password. Single quotes keep the
# value exactly as typed (a single quote inside a value is dropped).
unquote() { local v="$1"; v="${v#\'}"; v="${v%\'}"; v="${v#\"}"; v="${v%\"}"; printf '%s' "$v"; }
get() { unquote "$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)"; }
set_kv() {
  local k="$1" v="$2"
  # Stray characters a terminal can add (a carriage return, a pasted quote, spaces round the ends) are dropped.
  v="${v//$'\r'/}"; v="${v//\'/}"; v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"
  grep -vE "^$k=" "$ENV_FILE" > "$ENV_FILE.tmp" 2>/dev/null || true
  printf "%s='%s'\n" "$k" "$v" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"; chmod 600 "$ENV_FILE"
}
ask() {  # ask KEY "question" [secret]
  local k="$1" q="$2" secret="$3" cur; cur=$(get "$k")
  local hint=""; [ -n "$cur" ] && hint=" [Enter = keep current]"
  if [ "$secret" = "secret" ]; then read -r -s -p "$q$hint: " v; echo; else read -r -p "$q$hint: " v; fi
  if [ -n "$v" ]; then set_kv "$k" "$v"; elif [ -z "$cur" ]; then echo "   (left empty)"; fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Shopify Builder settings  ($ENV_FILE)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Fixed values
set_kv NEXT_PUBLIC_BASE_URL "https://${DOMAIN:-merchantbuild.in}"
set_kv UPLOADS_DIR "/var/www/builder-uploads"
set_kv CODEX_URL "https://openrouter.ai/api"

# Database: from setup.sh's credentials file
# setup.sh copies .env.example first, whose DATABASE_URL carries the placeholder PASSWORD: treat that as empty.
case "$(get DATABASE_URL)" in ""|*":PASSWORD@"*) [ -f "$CRED" ] && set_kv DATABASE_URL "" ;; esac
if [ -z "$(get DATABASE_URL)" ] && [ -f "$CRED" ]; then
  set_kv DATABASE_URL "$(unquote "$(grep -E '^DATABASE_URL=' "$CRED" | cut -d= -f2-)")"
  echo "✓ Database connection taken from $CRED"
fi

# Random secrets, made once
[ -n "$(get AUTH_TOKEN_SECRET)" ] || { set_kv AUTH_TOKEN_SECRET "$(openssl rand -hex 32)"; echo "✓ AUTH_TOKEN_SECRET generated"; }
[ -n "$(get BUILDER_DATA_KEY)" ] || { set_kv BUILDER_DATA_KEY "$(openssl rand -base64 32)"; echo "✓ BUILDER_DATA_KEY generated (back up $ENV_FILE: it unlocks the saved store tokens)"; }

echo ""
echo "1) Your login for the tool"
ask ADMIN_USERNAME "   Username (e.g. jatin)"
ask ADMIN_PASSWORD "   Password (typing is hidden; 8+ characters)" secret

echo ""
echo "2) AI key (OpenRouter)"
if [ -z "$(get AI_API_KEY)" ] && [ -f /etc/tracker/.env ] && grep -qE '^AI_API_KEY=.+' /etc/tracker/.env; then
  read -r -p "   Use ShipTrack's AI key (same OpenRouter bill)? [Y/n]: " yn
  if [ -z "$yn" ] || [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
    set_kv AI_API_KEY "$(unquote "$(grep -E '^AI_API_KEY=' /etc/tracker/.env | head -1 | cut -d= -f2-)")"
    echo "   ✓ copied from ShipTrack (not shown)"
  fi
fi
[ -n "$(get AI_API_KEY)" ] || ask AI_API_KEY "   AI_API_KEY (sk-or-...)" secret

echo ""
echo "3) Shopify app (Dev Dashboard > your app > Settings: Client ID and Client secret)"
echo "   Press Enter to skip for now; a pasted store token still works without them."
ask SHOPIFY_CLIENT_ID "   SHOPIFY_CLIENT_ID"
ask SHOPIFY_CLIENT_SECRET "   SHOPIFY_CLIENT_SECRET" secret

echo ""
echo "Saved. What is set (values hidden):"
for k in DATABASE_URL NEXT_PUBLIC_BASE_URL ADMIN_USERNAME ADMIN_PASSWORD AUTH_TOKEN_SECRET BUILDER_DATA_KEY AI_API_KEY SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET UPLOADS_DIR; do
  if [ -n "$(get $k)" ]; then echo "   ✓ $k"; else echo "   ✗ $k  (empty)"; fi
done
echo ""
# Password hint: a wrong-password login is the usual first problem; confirm the length only.
pw=$(get ADMIN_PASSWORD); [ -n "$pw" ] && echo "Password saved: ${#pw} characters (not shown)."
if [ -d /var/www/builder ] && pm2 describe builder > /dev/null 2>&1; then
  read -r -p "Apply these settings to the running app now? [Y/n]: " yn
  if [ -z "$yn" ] || [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
    cp "$ENV_FILE" /var/www/builder/.env.production.local
    pm2 restart builder --update-env > /dev/null && echo "✓ App restarted with the new settings. Try logging in."
  fi
else
  echo "Next: cd /var/www/builder && bash vps-setup/deploy.sh"
fi
