#!/usr/bin/env bash
#
# Deploy the current branch. Run as the app user, either by hand or by the
# GitHub Actions workflow in .github/workflows/deploy.yml:
#
#   sudo -u coachmate bash /srv/coachmate/repo/deploy/deploy.sh
#
# Rolls back to the previous commit if the new build fails to come up healthy.
# That is the whole point of the script: a deploy that leaves the site down is
# worse than one that never happened.

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/srv/coachmate}"
REPO_DIR="${REPO_DIR:-${APP_DIR}/repo}"
SERVICE="${SERVICE:-coachmate}"
APP_PORT="${APP_PORT:-3000}"
BRANCH="${BRANCH:-$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"

log()  { printf '\n\033[1;32m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$REPO_DIR" || die "No checkout at ${REPO_DIR} — run deploy/bootstrap.sh first"
[[ -f "${APP_DIR}/shared/.env" ]] || die "No ${APP_DIR}/shared/.env — fill it in first"

# The env is needed for `prisma migrate deploy`, which talks to the database
# directly rather than through the running service.
set -a; . "${APP_DIR}/shared/.env"; set +a

PREVIOUS="$(git rev-parse HEAD)"
log "Currently on ${PREVIOUS:0:8}"

# ── Fetch ──────────────────────────────────────────────────────────────────
log "Fetching ${BRANCH}"
git fetch --prune origin "$BRANCH"
TARGET="$(git rev-parse "origin/${BRANCH}")"

if [[ "$TARGET" == "$PREVIOUS" ]]; then
  log "Already up to date — nothing to deploy"
  exit 0
fi

# `reset --hard` rather than `pull`: the server's checkout is a mirror of the
# branch, never a place anybody edits, so a clean reset is the honest operation
# and it cannot stop on a conflict at 3am.
git reset --hard "$TARGET"
log "Deploying ${TARGET:0:8} — $(git log -1 --pretty=%s)"

# ── Build ──────────────────────────────────────────────────────────────────
build() {
  log "Installing dependencies"
  # Dev dependencies are needed: the build runs TypeScript and Tailwind.
  pnpm install --frozen-lockfile --prod=false

  log "Applying migrations"
  # `migrate deploy`, never `migrate dev` — deploy only applies what is already
  # committed and never tries to generate or reset anything.
  pnpm prisma migrate deploy

  log "Building"
  pnpm build
}

if ! build; then
  warn "Build failed — rolling back the working tree to ${PREVIOUS:0:8}"
  git reset --hard "$PREVIOUS"
  # The old build output is still on disk and the service is still serving it,
  # so the site never went down. Nothing to restart.
  die "Deploy aborted. The previous version is still running."
fi

# ── Restart ────────────────────────────────────────────────────────────────
log "Restarting ${SERVICE}"
sudo systemctl restart "$SERVICE"

# ── Health check ───────────────────────────────────────────────────────────
log "Waiting for a healthy response (up to ${HEALTH_TIMEOUT}s)"
healthy=0
for ((i = 0; i < HEALTH_TIMEOUT; i++)); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${APP_PORT}/ar" || true)"
  if [[ "$code" == "200" ]]; then healthy=1; break; fi
  sleep 1
done

if [[ "$healthy" -ne 1 ]]; then
  warn "No healthy response after ${HEALTH_TIMEOUT}s (last status: ${code:-none})"
  warn "Rolling back to ${PREVIOUS:0:8}"
  git reset --hard "$PREVIOUS"
  pnpm install --frozen-lockfile --prod=false
  pnpm build
  sudo systemctl restart "$SERVICE"
  die "Rolled back. Check: journalctl -u ${SERVICE} -n 100 --no-pager"
fi

log "Live on ${TARGET:0:8}"
git log -1 --pretty='  %h  %s%n  %an, %ar'
echo
