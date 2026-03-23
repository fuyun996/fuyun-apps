#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET_ROOT="${1:-/usr/share/nginx}"
NGINX_CONF_SOURCE="$PROJECT_ROOT/weiqi/nginx-weiqi.conf"

echo "Deploying static files to: $TARGET_ROOT"

install -d "$TARGET_ROOT/portal"
install -d "$TARGET_ROOT/weiqi"
install -d "$TARGET_ROOT/xiangqi"

cp "$PROJECT_ROOT/portal/index.html" "$TARGET_ROOT/portal/index.html"
cp "$PROJECT_ROOT/weiqi/index.html" "$TARGET_ROOT/weiqi/index.html"
cp "$PROJECT_ROOT/weiqi/styles.css" "$TARGET_ROOT/weiqi/styles.css"
cp "$PROJECT_ROOT/weiqi/app.js" "$TARGET_ROOT/weiqi/app.js"
cp "$PROJECT_ROOT/xiangqi/index.html" "$TARGET_ROOT/xiangqi/index.html"
cp "$PROJECT_ROOT/xiangqi/styles.css" "$TARGET_ROOT/xiangqi/styles.css"
cp "$PROJECT_ROOT/xiangqi/app.js" "$TARGET_ROOT/xiangqi/app.js"

echo
echo "Static files deployed."
echo "Nginx config source:"
echo "  $NGINX_CONF_SOURCE"
echo
echo "Suggested next steps:"
echo "  1. Copy the config to your nginx site config path."
echo "  2. Run: nginx -t"
echo "  3. Reload: nginx -s reload"
