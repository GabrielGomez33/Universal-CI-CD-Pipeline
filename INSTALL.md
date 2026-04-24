# Installation Guide — CI/CD Pipeline Workflows

## What's In This Repo

```
Universal-CI-CD-Pipeline/
├── mirror-server/.github/workflows/ci-cd.yml   ← Copy to mirror-server repo
├── mirror-client/.github/workflows/ci-cd.yml   ← Copy to Mirror (frontend) repo
├── dina-server/.github/workflows/ci-cd.yml     ← Copy to dina-server repo
├── server-setup/configure-deploy-permissions.sh ← Run once on production server
├── ANALYSIS.md                                  ← Full ecosystem analysis
└── INSTALL.md                                   ← You are here
```

## Prerequisites (Must Be Complete Before Installation)

- [x] VS Code installed on Windows dev machine
- [x] Git for Windows installed
- [x] Node.js 22 installed on Windows
- [x] SSH deploy keys created (github-deploy-mirror, github-deploy-dina)
- [x] Deploy keys installed on server (authorized_keys for mirror_app and dina)
- [x] Deploy keys verified (SSH test from PowerShell)
- [x] GitHub Secrets configured in all 3 repos
- [x] Repos cloned locally on Windows

## Step 1: Run Server Setup Script (One Time)

SSH into your server as administrator and run:

```bash
# Download or copy the script to your server, then:
sudo bash configure-deploy-permissions.sh
```

This grants mirror_app and dina passwordless sudo access to PM2 only
(required for automated deployment, locked down to PM2 commands only).

## Step 2: Install Workflow Files

### mirror-server

From your local Windows machine (PowerShell):

```powershell
cd "$HOME\projects\mirror-server"
mkdir -p .github\workflows

# Copy the workflow file from this repo
# (or copy-paste the contents into VS Code)
```

Copy the file `mirror-server/.github/workflows/ci-cd.yml` from this repo
into your local `mirror-server/.github/workflows/ci-cd.yml`.

Then:

```powershell
cd "$HOME\projects\mirror-server"
git checkout -b develop
git add .github/workflows/ci-cd.yml
git commit -m "Add CI/CD pipeline with quality gates, auto-deploy, health checks, and rollback"
git push -u origin develop
```

### dina-server

```powershell
cd "$HOME\projects\dina-server"
mkdir -p .github\workflows
```

Copy `dina-server/.github/workflows/ci-cd.yml` into your local
`dina-server/.github/workflows/ci-cd.yml`.

```powershell
cd "$HOME\projects\dina-server"
git checkout -b develop
git add .github/workflows/ci-cd.yml
git commit -m "Add CI/CD pipeline with quality gates, auto-deploy, health checks, and rollback"
git push -u origin develop
```

### Mirror (frontend)

```powershell
cd "$HOME\projects\Mirror"
mkdir -p client\.github\workflows
```

Note: The Mirror repo has source in `client/` but the workflow file goes
at the REPO ROOT: `.github/workflows/ci-cd.yml` (not inside client/).

Copy `mirror-client/.github/workflows/ci-cd.yml` into your local
`Mirror/.github/workflows/ci-cd.yml` (at the repo root, NOT in client/).

```powershell
cd "$HOME\projects\Mirror"
mkdir -p .github\workflows
# Copy the file here
git checkout -b develop
git add .github/workflows/ci-cd.yml
git commit -m "Add CI/CD pipeline with quality gates, auto-deploy, smoke tests, and rollback"
git push -u origin develop
```

## Step 3: Verify on GitHub

After pushing, go to each repo on GitHub and click the **Actions** tab.
You should see your workflow running.

## Step 4: Configure Branch Protection

For each repo on GitHub:

1. Settings → Branches → Add branch protection rule
2. Branch name pattern: `main`
3. Enable:
   - Require a pull request before merging
   - Require status checks to pass before merging
   - Select the "Quality Gates" check
   - Do not allow bypassing the above settings
4. Save changes

## How It Works After Installation

```
You edit code in VS Code (local)
  → git commit → git push to develop
  → GitHub Actions runs quality gates
  → You open PR: develop → main
  → Quality gates must pass (green checks)
  → You click "Merge"
  → GitHub Actions auto-deploys to your server
  → Health check runs
  → If healthy: release tagged
  → If unhealthy: automatic rollback
```
