# Deploying Sortopia

There are two targets:

1. **Web**: `https://games.mindgridlabs.org/sortopia/` on a Linux server running Nginx over HTTPS.
2. **YouTube Playables**: a zip of `dist/` uploaded through the Playables partner process.

Both use the same build:

```bash
npm ci
npm run verify      # typecheck + tests + build + Playables bundle check
# → dist/ (index.html at the root, all paths relative)
```

## 1. Web (Linux + Nginx + HTTPS)

### One-time server setup (Ubuntu/Debian)

```bash
sudo apt install nginx certbot
sudo adduser --disabled-password deploy
sudo mkdir -p /var/www/games.mindgridlabs.org/releases /var/www/letsencrypt
sudo chown -R deploy:deploy /var/www/games.mindgridlabs.org

# DNS: point games.mindgridlabs.org (A/AAAA) at this server first.
sudo cp deploy/nginx/games.mindgridlabs.org.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/games.mindgridlabs.org.conf /etc/nginx/sites-enabled/

# Get the certificate. Temporarily comment out the 443 server block until the cert exists,
# reload nginx, then:
sudo certbot certonly --webroot -w /var/www/letsencrypt -d games.mindgridlabs.org
sudo nginx -t && sudo systemctl reload nginx
```

Certbot installs a renewal timer. Check it with `sudo certbot renew --dry-run`.

### What the Nginx config does

- Redirects HTTP to HTTPS (and keeps `/.well-known/acme-challenge/` reachable for renewals).
- Uses TLS 1.2/1.3, HTTP/2 and HSTS.
- Serves the game at `/sortopia/`, and redirects `/` there.
- Caches hashed assets (`/sortopia/assets/*`) for a year as immutable, and serves `index.html` with `no-cache` so each release is picked up immediately.
- gzip compression.
- Sets a Content-Security-Policy that allows only same-origin code plus the official Playables SDK (`www.youtube.com/game_api/` and its redirect target `www.youtube.com/s/ytgame/`).

### Releases (atomic, with rollback)

Each release is uploaded to `releases/sortopia-<sha>/`, and the `sortopia` symlink is switched in a single `mv -T`, so visitors never see a half-uploaded build.

Manual deploy from a workstation:

```bash
SHA=$(git rev-parse --short HEAD)
ROOT=/var/www/games.mindgridlabs.org
rsync -az --delete dist/ deploy@games.mindgridlabs.org:$ROOT/releases/sortopia-$SHA/
ssh deploy@games.mindgridlabs.org "ln -sfn $ROOT/releases/sortopia-$SHA $ROOT/sortopia.next && mv -Tf $ROOT/sortopia.next $ROOT/sortopia"
```

To roll back, point the symlink at an earlier release:

```bash
ssh deploy@games.mindgridlabs.org 'ls -1dt /var/www/games.mindgridlabs.org/releases/sortopia-*'
ssh deploy@games.mindgridlabs.org "ln -sfn <older-release-dir> /var/www/games.mindgridlabs.org/sortopia.next && mv -Tf /var/www/games.mindgridlabs.org/sortopia.next /var/www/games.mindgridlabs.org/sortopia"
```

### GitLab CI/CD (`.gitlab-ci.yml`)

| Stage | Job | Runs |
|---|---|---|
| verify | `verify` | typecheck, unit tests, level validation |
| build | `build` | `vite build` + `bundle:check`; `dist/` kept as an artifact |
| build | `package_playables` | zips `dist/` as `sortopia-playables-<sha>.zip` for Playables upload |
| deploy | `deploy_production` | **manual**, default branch only: rsync release, switch symlink, keep the last 5, smoke check |

Set these in **Settings → CI/CD → Variables** (masked and protected):

| Variable | Example |
|---|---|
| `SSH_PRIVATE_KEY` | private key of the `deploy` user |
| `SSH_KNOWN_HOSTS` | output of `ssh-keyscan games.mindgridlabs.org` |
| `DEPLOY_HOST` | `games.mindgridlabs.org` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_ROOT` *(optional)* | `/var/www/games.mindgridlabs.org` |

### Post-deploy check

1. Open `https://games.mindgridlabs.org/sortopia/` and check that the splash and then the menu load with no console errors.
2. Play level 1 to completion, reload, and confirm the stars and coins persisted. On the web build this uses `localStorage`.
3. Check the headers with `curl -sI https://games.mindgridlabs.org/sortopia/`: `Cache-Control: no-cache`, HSTS and CSP should be present.

## 2. YouTube Playables

1. Run `npm run verify`. `bundle:check` must pass: index.html at the root, the SDK script before game code, relative paths only, valid file names, at most 8000 files, each file under 30 MiB.
2. Run the official **Playables SDK Test Suite** against a local server with gzip enabled:
   `npx vite preview --port 4173` (or any gzip-capable static server), then follow
   https://developers.google.com/youtube/gaming/playables/reference/test_suite_guide
   Confirm the following:
   - `firstFrameReady` fires during the splash, and `gameReady` fires only once the menu is interactive.
   - `loadData` completes before the first `saveData`, and progress restores after a reload.
   - `onPause` stops all motion and audio, and `onResume` resumes behind the Pause menu.
   - The YouTube mute silences everything, including Music and SFX volume changes.
   - `sendScore` sends the integer best-total score.
   - The initial bundle size reported is under 15 MiB (currently about 0.45 MiB).
3. Zip **the contents** of `dist/` (not the folder itself). The CI job `package_playables` does this.
4. Submit through your Playables Partner Manager, following the certification checklist:
   https://developers.google.com/youtube/gaming/playables/certification/requirements

> The SDK integration follows the official reference, but it has **not** yet been certified or run inside the YouTube environment. Treat step 2 as mandatory before any submission.

## Asset optimisation notes

- There are no image files: all art is rendered from code (Canvas 2D textures).
- Audio is 25 MP3 files in `audio/` (about 3.7 MB, CC0). Effects load after the first tap and music loads per screen, so none of it counts toward the initial download. The three music tracks are each over the 512 KiB SHOULD guideline (well under the 30 MiB limit).
- Fonts are self-hosted Fredoka woff2 subsets (about 16 KiB per weight). Only the subsets a page needs are downloaded.
- Phaser ships in its own long-cached chunk, so game updates don't invalidate it.
