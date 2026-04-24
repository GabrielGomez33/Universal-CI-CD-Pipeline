#!/bin/bash
# =============================================================================
# SERVER SETUP: Configure Deploy Permissions
# =============================================================================
# Run this ONCE on your production server as administrator (with sudo access).
#
# What it does:
#   1. Grants mirror_app passwordless sudo for PM2 only (not full sudo)
#   2. Grants dina passwordless sudo for PM2 only
#   3. Ensures git repos are configured for deploy (safe directory)
#   4. Verifies PM2 is accessible
#
# Usage:
#   sudo bash configure-deploy-permissions.sh
#
# Security notes:
#   - These users can ONLY run pm2 via sudo, nothing else
#   - This is required because PM2 was started as root and needs root to reload
#   - Alternative: run PM2 as the service user (requires re-setup of PM2)
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "=========================================="
echo "  CI/CD Deploy Permissions Setup"
echo "=========================================="
echo ""

# Check if running as root/sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}ERROR: This script must be run with sudo${NC}"
  echo "Usage: sudo bash configure-deploy-permissions.sh"
  exit 1
fi

# Find PM2 binary path
PM2_PATH=$(which pm2 2>/dev/null)
if [ -z "$PM2_PATH" ]; then
  PM2_PATH="/usr/local/bin/pm2"
  if [ ! -f "$PM2_PATH" ]; then
    PM2_PATH="/usr/bin/pm2"
  fi
fi

echo -e "${YELLOW}PM2 binary:${NC} $PM2_PATH"

# ============================================================================
# 1. Configure sudoers for mirror_app
# ============================================================================
echo ""
echo -e "${YELLOW}[1/4] Configuring sudo for mirror_app...${NC}"

MIRROR_SUDOERS="/etc/sudoers.d/mirror_app_pm2"
cat > "$MIRROR_SUDOERS" << EOF
# Allow mirror_app to run PM2 commands without password (CI/CD deployment)
mirror_app ALL=(ALL) NOPASSWD: $PM2_PATH
mirror_app ALL=(ALL) NOPASSWD: /usr/local/bin/pm2
mirror_app ALL=(ALL) NOPASSWD: /usr/bin/pm2
mirror_app ALL=(ALL) NOPASSWD: /usr/bin/env pm2 *
EOF

chmod 440 "$MIRROR_SUDOERS"

# Validate sudoers syntax
if visudo -cf "$MIRROR_SUDOERS" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ mirror_app sudoers configured${NC}"
else
  echo -e "${RED}ERROR: Invalid sudoers syntax! Removing...${NC}"
  rm -f "$MIRROR_SUDOERS"
  exit 1
fi

# ============================================================================
# 2. Configure sudoers for dina
# ============================================================================
echo -e "${YELLOW}[2/4] Configuring sudo for dina...${NC}"

DINA_SUDOERS="/etc/sudoers.d/dina_pm2"
cat > "$DINA_SUDOERS" << EOF
# Allow dina to run PM2 commands without password (CI/CD deployment)
dina ALL=(ALL) NOPASSWD: $PM2_PATH
dina ALL=(ALL) NOPASSWD: /usr/local/bin/pm2
dina ALL=(ALL) NOPASSWD: /usr/bin/pm2
dina ALL=(ALL) NOPASSWD: /usr/bin/env pm2 *
EOF

chmod 440 "$DINA_SUDOERS"

if visudo -cf "$DINA_SUDOERS" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ dina sudoers configured${NC}"
else
  echo -e "${RED}ERROR: Invalid sudoers syntax! Removing...${NC}"
  rm -f "$DINA_SUDOERS"
  exit 1
fi

# ============================================================================
# 3. Configure git safe directories
# ============================================================================
echo -e "${YELLOW}[3/4] Configuring git safe directories...${NC}"

# mirror_app needs git access to /var/www/mirror-server and /var/www/mirror-client
sudo -u mirror_app git config --global --add safe.directory /var/www/mirror-server
sudo -u mirror_app git config --global --add safe.directory /var/www/mirror-client

# dina needs git access to /var/www/dina-server
sudo -u dina git config --global --add safe.directory /var/www/dina-server

echo -e "${GREEN}✓ git safe directories configured${NC}"

# ============================================================================
# 4. Verify everything works
# ============================================================================
echo -e "${YELLOW}[4/4] Verifying configuration...${NC}"

echo ""
echo "Testing mirror_app sudo pm2..."
if sudo -u mirror_app sudo -n pm2 list > /dev/null 2>&1; then
  echo -e "${GREEN}✓ mirror_app can run sudo pm2 without password${NC}"
else
  echo -e "${RED}✗ mirror_app cannot run sudo pm2 — check sudoers config${NC}"
fi

echo ""
echo "Testing dina sudo pm2..."
if sudo -u dina sudo -n pm2 list > /dev/null 2>&1; then
  echo -e "${GREEN}✓ dina can run sudo pm2 without password${NC}"
else
  echo -e "${RED}✗ dina cannot run sudo pm2 — check sudoers config${NC}"
fi

echo ""
echo "Testing mirror_app git access..."
if sudo -u mirror_app git -C /var/www/mirror-server status > /dev/null 2>&1; then
  echo -e "${GREEN}✓ mirror_app can access mirror-server git repo${NC}"
else
  echo -e "${RED}✗ mirror_app cannot access mirror-server git repo${NC}"
fi

if sudo -u mirror_app git -C /var/www/mirror-client status > /dev/null 2>&1; then
  echo -e "${GREEN}✓ mirror_app can access mirror-client git repo${NC}"
else
  echo -e "${RED}✗ mirror_app cannot access mirror-client git repo${NC}"
fi

echo ""
echo "Testing dina git access..."
if sudo -u dina git -C /var/www/dina-server status > /dev/null 2>&1; then
  echo -e "${GREEN}✓ dina can access dina-server git repo${NC}"
else
  echo -e "${RED}✗ dina cannot access dina-server git repo${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  Setup complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Copy the CI/CD workflow files to each repo"
echo "  2. Push to GitHub to trigger the first pipeline run"
echo "  3. Watch the Actions tab on GitHub"
echo ""
