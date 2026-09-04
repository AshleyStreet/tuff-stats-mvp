# Lightsail — https://stats.playtuff.ca

The app runs on **its own Lightsail instance**, under the same domain as the league site: **`https://stats.playtuff.ca`**. `www.playtuff.ca` stays on WordPress. There is no `.onrender.com` URL. Caddy sits in front of the Node app and gets a Let’s Encrypt certificate once the DNS A record points here.

SportsPress data still comes from `www.playtuff.ca`. Only the stats app is on this box.

## What you need

1. Someone who can edit DNS for **playtuff.ca** (GoDaddy — nameservers `ns49` / `ns50.domaincontrol.com`)
2. A Lightsail **$7 / 1 GB** Ubuntu 24.04 instance (dual-stack, so you get IPv4)
3. A Lightsail **static IP** attached to that instance (free while attached)

## 1. Instance + static IP

In the [Lightsail console](https://lightsail.aws.amazon.com/):

1. **Create instance** → Linux → **OS only** → **Ubuntu 24.04 LTS**
2. Plan: **$7 / 1 GB** dual-stack (512 MB is too tight once seasons warm)
3. Region: **Canada (Central)** for Toronto, or Ohio / N. Virginia
4. Networking: allow **SSH (22)**, **HTTP (80)**, and **HTTPS (443)**
5. **Networking → IPv4 addresses → Create static IP** and attach it to this instance. Copy that IP — it goes in GoDaddy next. The default public IP can change if the box is stopped without a static IP.

Until DNS is live, the site is `http://<static-ip>/`.

## 2. DNS (GoDaddy — one extra record)

`stats.playtuff.ca` does not exist yet. Add **one** record. Do **not** change `@`, `www`, or nameservers (those keep WordPress up).

In [GoDaddy DNS](https://dcc.godaddy.com/) → **playtuff.ca** → **DNS**:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `stats` | the Lightsail static IP | 600 seconds |

Copy-paste ask for whoever has the GoDaddy login:

> Please add an A record: host `stats`, pointing at `<STATIC_IP>`, TTL 10 minutes. Do not change `www` or the apex. Goal: `https://stats.playtuff.ca` for the stats app; `https://www.playtuff.ca` stays as-is.

Wait until this returns the static IP before turning on HTTPS:

```bash
nslookup stats.playtuff.ca
```

Do not create a Lightsail DNS zone for `playtuff.ca` — that would steal `www` off WordPress.

## 3. First boot

SSH in (`ubuntu@<static-ip>`):

```bash
sudo -i
git clone --branch feat/lightsail https://github.com/AshleyStreet/tuff-stats-mvp.git /opt/tuff-stats
cd /opt/tuff-stats
bash deploy/lightsail/setup.sh
```

First load can take a minute while season caches warm.

```bash
nano /opt/tuff-stats/deploy/lightsail/.env
# set ADMIN_TOKEN=
# uncomment DOMAIN=stats.playtuff.ca  (only after nslookup matches the static IP)

cd /opt/tuff-stats && docker compose up -d
curl -sS http://127.0.0.1/api/health
```

After `DOMAIN=stats.playtuff.ca` is set and the A record points here, Caddy serves **https://stats.playtuff.ca**. Recreate Caddy if you add DOMAIN later:

```bash
docker compose up -d
```

## 4. Refresh data

```bash
curl -X POST http://127.0.0.1/api/admin/refresh \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"season":"2026"}'
```

## 5. Update

The instance **does not build the app** — 1 GB is not enough. A `docker compose
up -d --build` here exhausted memory badly enough that `sshd` could not fork a
new session and the Lightsail browser terminal returned `UPSTREAM_ERROR [515]`,
while the already-running containers kept serving normally. Reboot from the
Lightsail console to recover (volumes and the static IP survive it).

Images are built by the **Build image** workflow on every push to `main` and
published to `ghcr.io/ashleystreet/tuff-stats-mvp`. To ship one, run **Deploy
Lightsail** from GitHub Actions (`workflow_dispatch`) — it pulls and restarts,
no compiling. Requires repository secrets `LIGHTSAIL_HOST` (static IP or
`stats.playtuff.ca`), `LIGHTSAIL_USER` (`ubuntu`) and `LIGHTSAIL_SSH_KEY`, plus
repository *variables* `VITE_GA_MEASUREMENT_ID` (and the Plausible ones if used)
— those are baked into the client bundle at build time, so they now live in
GitHub rather than in this instance's `.env`.

By hand on the instance:

```bash
cd /opt/tuff-stats
sudo git pull --ff-only origin main
sudo docker compose --env-file deploy/lightsail/.env pull app
sudo docker compose --env-file deploy/lightsail/.env up -d
```

**Rollback** to any previously built commit — set the tag and restart, no build:

```bash
echo 'APP_IMAGE=ghcr.io/ashleystreet/tuff-stats-mvp:<commit-sha>' | sudo tee -a deploy/lightsail/.env
sudo docker compose --env-file deploy/lightsail/.env up -d
```

**Swap.** Add 2 GB regardless — 1 GB with no swap is tight once season caches
warm, and it is what turned a slow build into an unreachable box:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile \
  && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Render

Leave the Render service running until `https://stats.playtuff.ca` works, then delete it. `.onrender.com` goes away with that service.

## Notes

- **`afterwhistle.ca` / `www`** serve the Afterwhistle marketing homepage. League apps live on subdomains (e.g. **`tuff.afterwhistle.ca`** → TUFF). Keep those hostnames in `SITE_HOSTS` for HTTPS.
- No database. SportsPress is upstream; cache is the Docker volume `tuff-cache`.
- No keepalive cron — the instance stays up.
- ~$7/month for the box. Product demos can use `afterwhistle.ca`; TUFF production can also stay on `stats.playtuff.ca` when that DNS is set.
