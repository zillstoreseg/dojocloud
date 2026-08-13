# Deploying CoachMate

Ubuntu 22.04 / 24.04 or Debian 12, one box, app and database together. Good for
the first few hundred coaches; the split into separate database and app hosts
is a later problem and nothing here blocks it.

The end state: **you push to the branch, GitHub Actions runs the checks, and the
server pulls, builds and restarts itself.** If the new build does not come up
healthy, the server rolls back to the previous commit on its own.

---

## 1. Point the domain at the box

An `A` record for `coachmate.app` and another for `www`, both at the VPS IP.
Do this first — the TLS certificate in step 2 is issued by proving control of
the domain, and it cannot be issued before DNS resolves.

## 2. Bootstrap the server

SSH in as a user with sudo, then:

```bash
git clone https://github.com/zillstoreseg/dojocloud.git /tmp/coachmate
cd /tmp/coachmate
git checkout claude/trainer-trainee-web-app-a7n0r3

sudo DOMAIN=coachmate.app LETSENCRYPT_EMAIL=you@example.com \
     bash deploy/bootstrap.sh
```

It installs Node 22, pnpm, PostgreSQL 16, nginx and certbot; creates the
`coachmate` system user and database; writes a systemd unit, an nginx site and
the daily cron; and generates `/srv/coachmate/shared/.env` with real secrets
already filled in.

Re-running it is safe. Every step checks before it acts.

**The one thing it does that is easy to get wrong by hand:** the database role
is created `NOSUPERUSER NOBYPASSRLS`. PostgreSQL exempts both from every
row-level security policy *silently* — connect as `postgres` and the app has
all its isolation policies installed and none of them in force. The script also
strips those attributes off a pre-existing role, and `/admin/system` reports
the connecting role so you can check it at a glance.

## 3. Finish the environment file

```bash
sudo -u coachmate nano /srv/coachmate/shared/.env
```

`DATABASE_URL`, `AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY` and `CRON_SECRET` are
already generated. Set `NEXT_PUBLIC_APP_URL` to your real `https://` URL —
it is what emails, OG images and referral links are built from.

Leave `STORAGE_DRIVER=local` for now. Uploads live in
`/srv/coachmate/shared/uploads`, symlinked into the checkout, so they survive
every deploy. Move to S3 when you add a second box.

## 4. First deploy and seed

```bash
sudo -u coachmate bash /srv/coachmate/repo/deploy/deploy.sh

cd /srv/coachmate/repo
sudo -u coachmate --preserve-env pnpm db:seed
```

The seed creates the feature flags, the five plans, the exercise and food
libraries, the static pages, and the admin account
(`admin@coachmate.app` / `Admin@12345`).

**Change that password immediately** — sign in, then `/ar/dash/settings` is for
coaches, so for the admin use the reset flow at `/ar/forgot`, or update the row
directly. An untouched seed password on a public box is the shortest path to
losing the platform.

## 5. Push-to-deploy

On the server, as the app user, make a key GitHub will use:

```bash
sudo -u coachmate ssh-keygen -t ed25519 -f /srv/coachmate/shared/deploy_key -N "" -C "github-actions"
sudo -u coachmate bash -c 'cat /srv/coachmate/shared/deploy_key.pub >> ~/.ssh/authorized_keys'
sudo -u coachmate chmod 600 ~/.ssh/authorized_keys

# Print the private key — this is what goes into GitHub, and nowhere else.
sudo cat /srv/coachmate/shared/deploy_key
```

The deploy script also restarts the service, which needs exactly one sudo rule —
`systemctl restart coachmate` and nothing else. Bootstrap already wrote it to
`/etc/sudoers.d/coachmate` and validated it with `visudo -cf`, so there is
nothing to do here.

Then in the repository on GitHub, **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | the VPS IP or hostname |
| `DEPLOY_USER` | `coachmate` |
| `DEPLOY_SSH_KEY` | the whole private key, `-----BEGIN` line to `-----END` line |
| `DEPLOY_PORT` | only if SSH is not on 22 |

Delete the private key from the server once GitHub has it:

```bash
sudo shred -u /srv/coachmate/shared/deploy_key
```

The server keeps only the public half. From here, every push to
`claude/trainer-trainee-web-app-a7n0r3` runs typecheck, lint and the full test
suite, and deploys only if all three pass.

## 6. Work down the health screen

Sign in and open `/ar/admin/system`. It lists the things that fail without
producing an error anybody sees:

- **Database role** — must not be exempt from RLS. Bootstrap handles this.
- **AI key** — until it is set, meal scanning and program generation are off.
  Paste it at `/ar/admin/settings`; it is stored encrypted, never in `.env`.
- **Email** — `none` by default: notifications stay in-app and nothing is sent.
  Set a Resend key or SMTP details at `/ar/admin/settings`.
- **Cron secret** — set by bootstrap; the cron entry is already installed.
- **Storage** — `local` is fine on one box.

---

## Operating it

```bash
# Logs
sudo journalctl -u coachmate -f

# Restart
sudo systemctl restart coachmate

# Run the daily job by hand
set -a; . /srv/coachmate/shared/.env; set +a
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://127.0.0.1:3000/api/cron/subscriptions

# Deploy by hand
sudo -u coachmate bash /srv/coachmate/repo/deploy/deploy.sh

# Roll back one commit
sudo -u coachmate git -C /srv/coachmate/repo reset --hard HEAD~1
sudo -u coachmate bash -c 'cd /srv/coachmate/repo && pnpm install --frozen-lockfile && pnpm build'
sudo systemctl restart coachmate
```

### Backups

Nothing here backs the database up, and it should. The smallest thing that
works:

```bash
sudo -u postgres bash -c 'mkdir -p /var/backups/coachmate && \
  pg_dump -Fc coachmate > /var/backups/coachmate/$(date +%F).dump'
```

as a daily cron, with the dumps copied off the box. A backup that lives only on
the machine it is backing up is not a backup.

### What is not set up here

- **No staging environment.** Every push goes to production. Add a second box
  and a second workflow when that stops feeling acceptable.
- **No zero-downtime deploy.** `systemctl restart` drops connections for a few
  seconds while Next boots. Two app processes behind nginx would fix it; one
  box does not justify it yet.
- **No log shipping or uptime alerting.** `journalctl` on the box is all there
  is, and nobody is told when it stops responding.
