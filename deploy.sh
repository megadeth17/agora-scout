#!/usr/bin/env bash
# Agora Scout — one-shot VPS deploy script
# Run from project root: bash deploy.sh
set -e

VPS="root@178.104.36.180"
REMOTE_DIR="/root/agora-scout"

echo "==> Syncing files to VPS..."
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='__pycache__' \
  --exclude='*.pyc' --exclude='*.db' --exclude='data/' --exclude='.env' \
  --exclude='frontend/dist' \
  -e "ssh -i ~/.ssh/id_ed25519" \
  ./ "$VPS:$REMOTE_DIR/"

echo "==> Uploading .env..."
scp -i ~/.ssh/id_ed25519 .env "$VPS:$REMOTE_DIR/.env"

echo "==> Starting containers on VPS..."
ssh -i ~/.ssh/id_ed25519 "$VPS" "
  cd $REMOTE_DIR
  mkdir -p data
  docker compose down --remove-orphans 2>/dev/null || true
  docker compose build --no-cache backend
  docker compose up -d
  echo '==> Containers started:'
  docker compose ps
"

echo ""
echo "==> Deploy complete!"
echo "    Dashboard : http://178.104.36.180:3003"
echo "    API       : http://178.104.36.180:8000"
echo "    Health    : http://178.104.36.180:8000/health"
