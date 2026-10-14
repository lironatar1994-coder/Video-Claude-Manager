#!/usr/bin/env bash
# Activates an uploaded release of the video library at https://lawebs.co.il/videos/
# Usage: deploy-linux.sh <release-id>   (archive at /opt/video-library/incoming/<id>.tar.gz)
set -Eeuo pipefail
release_id=${1:?release id required}
[[ "$release_id" =~ ^[0-9]{8}-[0-9]{6}$ ]] || { echo 'bad release id' >&2; exit 1; }

base=/opt/video-library
archive="$base/incoming/$release_id.tar.gz"
release="$base/releases/$release_id"
config=/etc/nginx/sites-available/lawebs.co.il.conf
snippet=/etc/nginx/snippets/video-library.conf
site=https://lawebs.co.il/videos
state=/var/lib/video-library          # client feedback + team key; never replaced by a release
api_port=3192

# One deploy at a time (a CLI publish and the app's auto-publish can overlap).
exec 9>"$base.lock"
flock -w 900 9

test -f "$archive"
test -f "$config"
test ! -e "$release"
mkdir -p "$release" "$base/www" "$base/media" "$base/backups"
tar -xzf "$archive" -C "$release"
test -f "$release/index.html"
test -f "$release/data.json"
test -f "$release/media.txt"
test -f "$release/_api/server.mjs"
# The API source ships inside the archive but must not be served as a static file.
rm -rf "$base/api.next"
mv "$release/_api" "$base/api.next"

# Media uploaded this round lands in incoming/media first so a broken upload never
# shadows a good file; move it into place now.
if compgen -G "$base/incoming/media/*" >/dev/null; then mv -f "$base/incoming/media/"* "$base/media/"; fi
missing=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [[ "$f" =~ ^[0-9a-f]{12}(\.light)?\.(mp4|webm|mov|m4v|mkv)$ ]] || { echo "bad media name: $f" >&2; exit 1; }
  if [ ! -s "$base/media/$f" ]; then echo "missing media: $f" >&2; missing=1; fi
done < "$release/media.txt"
[ "$missing" = 0 ]

backup="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)-$release_id"
mkdir -p "$backup"
cp -a "$config" "$backup/nginx.conf"
if test -f "$snippet"; then cp -a "$snippet" "$backup/snippet.conf"; fi
swapped=0
rollback() {
  cp -a "$backup/nginx.conf" "$config"
  if test -f "$backup/snippet.conf"; then cp -a "$backup/snippet.conf" "$snippet"; else rm -f "$snippet"; fi
  if test "$swapped" = 1; then
    mv "$base/www/current" "$release.failed"
    if test -d "$backup/current"; then mv "$backup/current" "$base/www/current"; fi
  fi
  nginx -t && systemctl reload nginx || true
}
trap rollback ERR

cat > "$snippet" <<'NGINX'
# Video library (read-only snapshot) — deployed from Videoslocalapp/deploy.ps1
location = /videos { return 308 /videos/; }
location ^~ /videos/media/ {
    alias /opt/video-library/media/;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Content-Type-Options nosniff always;
}
location ^~ /videos/api/ {
    proxy_pass http://127.0.0.1:3192;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 16k;
    add_header Cache-Control "no-store" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
}
location ^~ /videos/ {
    alias /opt/video-library/www/current/;
    index index.html;
    add_header Cache-Control "no-cache" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}
NGINX

python3 - "$config" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
s = p.read_text()
marker = '    include /etc/nginx/snippets/video-library.conf;'
if marker not in s:
    anchor = '    location / {'
    if s.count(anchor) != 1:
        raise SystemExit('Ambiguous nginx insertion point')
    p.write_text(s.replace(anchor, marker + '\n\n' + anchor, 1))
PY
nginx -t

chown -R www-data:www-data "$release" "$base/media"
chmod -R u=rwX,go=rX "$release" "$base/media"
if test -d "$base/www/current"; then mv "$base/www/current" "$backup/current"; fi
mv "$release" "$base/www/current"
swapped=1
systemctl reload nginx
sleep 1

page=$(curl --fail --silent --show-error --retry 4 --retry-all-errors --retry-delay 1 --max-time 15 "$site/")
[[ "$page" == *'data-mode="static"'* ]]
curl --fail --silent --show-error --retry 4 --retry-all-errors --retry-delay 1 --max-time 15 "$site/data.json" >/dev/null
first=$(head -n1 "$base/www/current/media.txt")
if [ -n "$first" ]; then
  curl --fail --silent --show-error --max-time 15 -r 0-1023 -o /dev/null "$site/media/$first"
fi
token=$(ls -1 "$base/www/current/p" 2>/dev/null | head -n1 || true)
if [ -n "$token" ]; then
  curl --fail --silent --show-error --max-time 15 -o /dev/null "$site/p/$token/"
fi
trap - ERR

# ---- review API (pm2). A broken API must not take the library down, so it only warns. ----
install -d -m 700 "$state"
if [ ! -s "$state/team.key" ]; then
  (umask 077; openssl rand -hex 24 > "$state/team.key")
fi
rm -rf "$base/api"
mv "$base/api.next" "$base/api"
export PORT=$api_port VL_DATA=$state VL_WWW=$base/www/current
if pm2 describe video-library-api >/dev/null 2>&1; then
  pm2 restart video-library-api --update-env >/dev/null
else
  pm2 start "$base/api/server.mjs" --name video-library-api --time --max-memory-restart 200M >/dev/null
fi
pm2 save --force >/dev/null
api_ok=0
for i in $(seq 1 15); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$api_port/videos/api/health" >/dev/null 2>&1; then api_ok=1; break; fi
  sleep 1
done
if [ "$api_ok" = 1 ]; then echo "Review API healthy on :$api_port"; else
  echo "[WARN] review API did not answer on :$api_port" >&2
  pm2 logs video-library-api --lines 30 --nostream >&2 || true
fi

# Keep 5 backups, then drop media that neither the live release nor a backup uses.
rm -f "$archive"
ls -1dt "$base"/backups/*/ 2>/dev/null | tail -n +6 | xargs -r rm -rf --
keep=$(cat "$base/www/current/media.txt" "$base"/backups/*/current/media.txt 2>/dev/null | sort -u || true)
cd "$base/media"
for f in *; do
  [ -e "$f" ] || continue
  grep -qxF -- "$f" <<<"$keep" || rm -f -- "$f"
done
rm -rf "$base"/releases/*

echo "Live $site/ release $release_id"
echo "Rollback backup: $backup"
