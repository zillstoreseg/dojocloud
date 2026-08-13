#!/usr/bin/env bash
#
# One-time server setup for CoachMate. Run as root on a fresh Ubuntu 22.04 /
# 24.04 or Debian 12 box:
#
#   sudo DOMAIN=coachmate.app bash deploy/bootstrap.sh
#
# Safe to run more than once — every step checks before it acts, so a re-run
# repairs a half-finished install rather than duplicating it.
#
# No secret is written into this file. The database password is generated on
# the box; everything else goes into /srv/coachmate/shared/.env, which you fill
# in by hand afterwards.

set -Eeuo pipefail

# ── Settings ───────────────────────────────────────────────────────────────
APP_USER="${APP_USER:-coachmate}"
APP_DIR="${APP_DIR:-/srv/coachmate}"
APP_PORT="${APP_PORT:-3000}"
REPO_URL="${REPO_URL:-https://github.com/zillstoreseg/dojocloud.git}"
BRANCH="${BRANCH:-claude/trainer-trainee-web-app-a7n0r3}"
NODE_MAJOR="${NODE_MAJOR:-22}"
PG_VERSION="${PG_VERSION:-16}"
DB_NAME="${DB_NAME:-coachmate}"
DB_USER="${DB_USER:-coachmate}"
DOMAIN="${DOMAIN:-}"              # e.g. coachmate.app — empty skips nginx + TLS
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"

log()  { printf '\n\033[1;32m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash deploy/bootstrap.sh"
command -v apt-get >/dev/null \
  || die "This targets Debian/Ubuntu. On RHEL-family, swap apt-get for dnf and use the matching PostgreSQL repo."

export DEBIAN_FRONTEND=noninteractive

# ── Packages ───────────────────────────────────────────────────────────────
log "Base packages"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git ufw openssl rsync

# ── Node ───────────────────────────────────────────────────────────────────
if ! command -v node >/dev/null || [[ "$(node -v)" != v${NODE_MAJOR}.* ]]; then
  log "Node ${NODE_MAJOR}"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
# pnpm via npm rather than corepack: corepack caches per user, so priming it
# as root leaves the service (running as ${APP_USER}) trying to fetch pnpm on
# first boot. A global install is one binary on PATH for every user.
if ! command -v pnpm >/dev/null; then
  npm install -g pnpm@10
fi

# ── PostgreSQL ─────────────────────────────────────────────────────────────
if ! command -v psql >/dev/null; then
  log "PostgreSQL ${PG_VERSION}"
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y -qq "postgresql-${PG_VERSION}"
fi
systemctl enable --now postgresql

# ── Database role ──────────────────────────────────────────────────────────
#
# The role is created WITHOUT SUPERUSER and WITHOUT BYPASSRLS, deliberately.
# PostgreSQL exempts both from every row-level security policy silently — a
# deployment that connects as a superuser has all the policies installed and no
# tenant isolation whatsoever. /admin/system reports this, and the RLS test
# suite fails loudly on it.
DB_PASS_FILE="${APP_DIR}/shared/.dbpass"
install -d -m 700 "${APP_DIR}/shared"

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  log "Database role ${DB_USER} (not a superuser — this is what makes RLS real)"
  DB_PASS="$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)"
  printf '%s' "$DB_PASS" > "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
  sudo -u postgres psql -qc "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE;"
else
  warn "Role ${DB_USER} already exists — leaving its password alone"
  [[ -f "$DB_PASS_FILE" ]] || warn "No saved password at ${DB_PASS_FILE}; set DATABASE_URL by hand"
  DB_PASS="$(cat "$DB_PASS_FILE" 2>/dev/null || echo '')"
fi

# Belt and braces: if the role predates this script and was created as a
# superuser, strip it. Otherwise RLS is off and nothing says so.
if sudo -u postgres psql -tAc "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q t; then
  warn "Role ${DB_USER} could bypass RLS — removing those attributes"
  sudo -u postgres psql -qc "ALTER ROLE ${DB_USER} NOSUPERUSER NOBYPASSRLS;"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  log "Database ${DB_NAME}"
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
fi

# ── App user and directories ───────────────────────────────────────────────
#
#   repo/    the git checkout, replaced on every deploy
#   shared/  everything that must survive a deploy: .env, uploads
#
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  log "User ${APP_USER}"
  adduser --system --group --home "${APP_DIR}" --shell /bin/bash "${APP_USER}"
fi

install -d -o "${APP_USER}" -g "${APP_USER}" "${APP_DIR}" "${APP_DIR}/shared" "${APP_DIR}/shared/uploads"
chmod 750 "${APP_DIR}"

if [[ ! -d "${APP_DIR}/repo/.git" ]]; then
  log "Cloning ${BRANCH}"
  sudo -u "${APP_USER}" git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}/repo"
fi

# Uploads live outside the checkout and are symlinked in, so a deploy that
# replaces the working tree does not take every certificate, receipt and meal
# photo with it. (Set STORAGE_DRIVER=s3 in production and this stops mattering.)
sudo -u "${APP_USER}" mkdir -p "${APP_DIR}/repo/public"
if [[ ! -L "${APP_DIR}/repo/public/uploads" ]]; then
  rm -rf "${APP_DIR}/repo/public/uploads"
  sudo -u "${APP_USER}" ln -s "${APP_DIR}/shared/uploads" "${APP_DIR}/repo/public/uploads"
fi

# ── .env skeleton ──────────────────────────────────────────────────────────
ENV_FILE="${APP_DIR}/shared/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log "Writing ${ENV_FILE} (fill in the blanks before starting)"
  cat > "$ENV_FILE" <<EOF
# Generated by bootstrap.sh — edit the blanks, then: systemctl restart coachmate

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public"

# openssl rand -base64 32
AUTH_SECRET="$(openssl rand -base64 32)"
AUTH_TRUST_HOST=true

# openssl rand -hex 32   (exactly 64 hex characters)
SETTINGS_ENCRYPTION_KEY="$(openssl rand -hex 32)"

# Shared secret for POST /api/cron/subscriptions
CRON_SECRET="$(openssl rand -hex 24)"

NODE_ENV=production
PORT=${APP_PORT}
NEXT_PUBLIC_APP_URL="https://${DOMAIN:-example.com}"
NEXT_PUBLIC_APP_NAME="CoachMate"

# Local disk is lost on nothing here (uploads are symlinked to shared/), but S3
# is still the right answer once you have more than one box.
STORAGE_DRIVER=local
# STORAGE_DRIVER=s3
# S3_ENDPOINT=""
# S3_REGION=""
# S3_BUCKET=""
# S3_ACCESS_KEY_ID=""
# S3_SECRET_ACCESS_KEY=""
# S3_PUBLIC_URL=""
EOF
  chown "${APP_USER}:${APP_USER}" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  warn "${ENV_FILE} already exists — left untouched"
fi

# ── systemd ────────────────────────────────────────────────────────────────
log "systemd unit"
cat > /etc/systemd/system/coachmate.service <<EOF
[Unit]
Description=CoachMate
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}/repo
EnvironmentFile=${APP_DIR}/shared/.env
ExecStart=/usr/bin/env pnpm start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# The app needs to write only to its own uploads and to Next's cache.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable coachmate >/dev/null

# ── Restart permission ─────────────────────────────────────────────────────
#
# deploy.sh restarts the service, and it runs as ${APP_USER}. Two commands, no
# password, nothing else — without this the deploy builds fine and then fails
# on its last line.
log "sudoers rule for restarting the service"
cat > /etc/sudoers.d/coachmate <<EOF
${APP_USER} ALL=(root) NOPASSWD: /bin/systemctl restart coachmate, /bin/systemctl status coachmate, /usr/bin/systemctl restart coachmate, /usr/bin/systemctl status coachmate
EOF
chmod 440 /etc/sudoers.d/coachmate
visudo -cf /etc/sudoers.d/coachmate >/dev/null || die "Bad sudoers file — removed nothing, fix by hand"

# ── Daily cron ─────────────────────────────────────────────────────────────
#
# Expires subscriptions, sends 7/3/1-day reminders to coaches and trainees,
# releases matured wallet holds, and prunes rate-limit rows. Without it nothing
# expires and no coach's money ever becomes withdrawable.
log "Daily cron"
cat > /etc/cron.d/coachmate <<EOF
# CoachMate daily maintenance — 03:15 server time
SHELL=/bin/bash
15 3 * * * ${APP_USER} set -a; . ${APP_DIR}/shared/.env; set +a; curl -fsS -X POST -H "Authorization: Bearer \$CRON_SECRET" http://127.0.0.1:${APP_PORT}/api/cron/subscriptions >/dev/null 2>&1
EOF
chmod 644 /etc/cron.d/coachmate

# ── nginx + TLS ────────────────────────────────────────────────────────────
if [[ -n "$DOMAIN" ]]; then
  command -v nginx >/dev/null || { log "nginx"; apt-get install -y -qq nginx; }

  log "nginx site for ${DOMAIN}"
  cat > /etc/nginx/sites-available/coachmate <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    # certbot rewrites this block to redirect to HTTPS once a certificate exists.
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        # The app reads the caller's address from this header for rate limiting,
        # so getting it wrong means every visitor shares one bucket.
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Meal photos come off a phone camera at several megabytes.
    client_max_body_size 15m;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
EOF
  ln -sf /etc/nginx/sites-available/coachmate /etc/nginx/sites-enabled/coachmate
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx

  if [[ -n "$LETSENCRYPT_EMAIL" ]]; then
    command -v certbot >/dev/null || apt-get install -y -qq certbot python3-certbot-nginx
    log "TLS certificate"
    certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" \
      --non-interactive --agree-tos -m "${LETSENCRYPT_EMAIL}" --redirect || \
      warn "certbot failed — check that ${DOMAIN} already points at this server's IP, then rerun: certbot --nginx -d ${DOMAIN}"
  else
    warn "LETSENCRYPT_EMAIL not set — skipping TLS. Run: certbot --nginx -d ${DOMAIN}"
  fi
else
  warn "DOMAIN not set — skipped nginx and TLS. The app will listen on 127.0.0.1:${APP_PORT} only."
fi

# ── Firewall ───────────────────────────────────────────────────────────────
log "Firewall"
ufw allow OpenSSH >/dev/null 2>&1 || true
if [[ -n "$DOMAIN" ]]; then ufw allow 'Nginx Full' >/dev/null 2>&1 || true; fi
ufw --force enable >/dev/null 2>&1 || warn "Could not enable ufw — check it by hand"

# ── Done ───────────────────────────────────────────────────────────────────
cat <<EOF

$(printf '\033[1;32m')Server is ready.$(printf '\033[0m')

Next, in order:

  1. Fill in ${ENV_FILE}
     — NEXT_PUBLIC_APP_URL must be your real https URL
     — everything else already has a generated value

  2. First deploy:
       sudo -u ${APP_USER} bash ${APP_DIR}/repo/deploy/deploy.sh

  3. Seed the database (first time only):
       cd ${APP_DIR}/repo
       sudo -u ${APP_USER} --preserve-env pnpm db:seed

  4. Set up push-to-deploy — see deploy/README.md

  5. Sign in at https://${DOMAIN:-your-domain} as the seeded admin and open
     /ar/admin/system. It reports the things that fail silently: the database
     role's RLS exemption, the AI key, the email provider, storage, and the
     cron secret. Work down that screen until nothing is red.

EOF
