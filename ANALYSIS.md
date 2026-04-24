# Universal CI/CD Pipeline - Ecosystem Analysis & Architecture Plan

> **Status**: Analysis complete. Pipeline workflows written and ready for installation.
> See [INSTALL.md](./INSTALL.md) for step-by-step installation instructions.

## Table of Contents
1. [Ecosystem Overview](#ecosystem-overview)
2. [Repository Deep Dive](#repository-deep-dive)
3. [Inter-Service Communication Map](#inter-service-communication-map)
4. [Current Deployment State & Pain Points](#current-deployment-state--pain-points)
5. [CI/CD Architecture Plan](#cicd-architecture-plan)
6. [Implementation Roadmap](#implementation-roadmap)

---

## 1. Ecosystem Overview

You are running a **three-tier distributed system**:

```
[Users / Browser]
       │
       ▼
┌─────────────────────────┐
│  Mirror (Frontend)      │  React 19 + Vite + TailwindCSS 4
│  Served via Apache      │  Static SPA at /Mirror/
│  theundergroundrailroad  │  .htaccess rewrite for SPA routing
│  .world                 │
└─────────┬───────────────┘
          │ HTTPS (REST + WebSocket)
          ▼
┌─────────────────────────┐
│  mirror-server          │  Express 5 + TypeScript
│  (Backend API)          │  PM2: 5 processes
│  Port: $MIRRORPORT      │  MySQL + Redis (port 6380)
│                         │  JWT auth, Helmet, CORS
│  Processes:             │
│  ├── mirror-server      │  Main API + WSS gateway
│  ├── analysis-worker    │  Group analysis queue
│  ├── dina-chat-worker   │  @Dina chat queue
│  ├── truthstream-worker │  TruthStream queue
│  └── personal-analysis  │  Personal analysis queue
└─────────┬───────────────┘
          │ WebSocket (DUMP Protocol) + HTTPS
          ▼
┌─────────────────────────┐
│  dina-server            │  Express 4 + TypeScript
│  (AI/Intelligence)      │  PM2: 1 process
│  Port: 8445 (HTTPS)     │  MySQL + Redis + Ollama LLMs
│                         │  (qwen2.5:3b, mistral:7b)
│  Modules:               │
│  ├── Mirror Module ◄────│─── Entry point for ALL mirror comms
│  ├── LLM Manager        │
│  ├── DIGIM Module       │
│  └── DUMP Protocol      │
└─────────────────────────┘
```

### Key Architectural Facts
- **Production server**: Both servers run on the same VPS at `/var/www/mirror-server` and `/var/www/dina-server`
- **Currently editing directly on production** (this is what we're fixing!)
- **No CI/CD exists** — zero GitHub Actions, no Dockerfiles, no automated testing
- **No test suites** — `mirror-server` has `"test": "echo \"Error: no test specified\""`, `dina-server` has `"test": "jest"` but no test files
- **Deployment is manual**: `npm run deploy` = `tsc` + `pm2 reload`
- **No staging/dev environment** — everything is prod
- **SSL certificates** are loaded from env vars pointing to filesystem paths

---

## 2. Repository Deep Dive

### 2.1 Mirror (Frontend)

| Attribute | Value |
|-----------|-------|
| **Framework** | React 19.1 with SWC (fast compilation) |
| **Build Tool** | Vite 6.3 |
| **Language** | TypeScript 5.8 |
| **CSS** | TailwindCSS 4.1 + custom glass-morphism CSS |
| **State Mgmt** | Zustand 5.0 |
| **Routing** | react-router-dom 7.6 |
| **3D/Visual** | Three.js + @react-three/fiber + drei |
| **AI/ML** | TensorFlow.js + face-api.js (in-browser) |
| **Build Output** | `dist/` folder, served at `/Mirror/` base path |
| **Hosting** | Apache with `.htaccess` SPA rewrite |
| **Linting** | ESLint 9 with react-hooks + react-refresh |
| **Testing** | None |

**Key Frontend Services** (connecting to mirror-server):
- `api.ts` — Base REST client using `VITE_API_URL`
- `authApi.ts` — Registration, login, JWT token management
- `chatApi.ts` — Group chat REST endpoints
- `chatWebSocket.ts` — Real-time chat via WebSocket
- `dinaService.ts` — @Dina AI chat integration
- `dinaStreamingService.ts` — Streaming LLM responses
- `groupsApi.ts` — MirrorGroups CRUD
- `journalApi.ts` — Journal entries
- `truthStreamApi.ts` — TruthStream peer review system
- `subscriptionApi.ts` — PayPal paywall
- `mirrorDashboard.ts` — Personal analysis dashboard
- `groupsWebSocket.ts` — Group real-time features

**Component Architecture:**
```
src/
├── components/
│   ├── auth/          # Route protection
│   ├── chat/          # Real-time messaging
│   ├── dashboard/     # Global dashboard
│   ├── home/          # Main panels (MyMirror, MyJournal)
│   ├── mirrorgroups/  # Group features (chat, insights, voting)
│   ├── notifications/ # Real-time notification orb
│   ├── paywall/       # Subscription gates, upgrade modals
│   ├── three/         # 3D scenes (Zen Garden, Sakura Forest)
│   ├── truthstream/   # Peer review system
│   └── visualizers/   # Audio/visual orbs
├── hooks/             # useFaceApi
├── routers/           # AppRouter
├── services/          # API + WebSocket clients
├── styles/            # Glass-morphism CSS
└── utils/             # Token management, storage URLs
```

### 2.2 mirror-server (Backend API)

| Attribute | Value |
|-----------|-------|
| **Runtime** | Node.js |
| **Framework** | Express 5.1 |
| **Language** | TypeScript 5.8, compiled to ES2020 |
| **Database** | MySQL (via mysql2, pool of 30) |
| **Cache/Queue** | Redis (ioredis, port 6380) |
| **Auth** | JWT (jsonwebtoken + bcrypt) |
| **Security** | Helmet.js, strict CORS, body size limits |
| **Real-time** | WebSocket (ws + socket.io) |
| **Process Mgmt** | PM2 (5 processes) |
| **File Upload** | Multer |
| **Payment** | PayPal Subscriptions API |
| **Testing** | None |
| **Entry point** | `index.ts` (single 800+ line file) |

**Route Structure:**
```
/mirror/api/auth/*          — Authentication (register, login, refresh)
/mirror/api/user/*          — User profiles, data export
/mirror/api/storage/*       — Encrypted file storage
/mirror/api/intake/*        — Multi-modal data intake
/mirror/api/dashboard/*     — Dashboard aggregation
/mirror/api/journal/*       — Journal CRUD
/mirror/api/groups/*        — MirrorGroups CRUD + directory
/mirror/api/group-chat/*    — Real-time group chat
/mirror/api/group-insights/*— AI-generated group analysis
/mirror/api/group-votes/*   — Voting system
/mirror/api/truthstream/*   — Peer review (TruthStream)
/mirror/api/personal-analysis/* — Personal AI reports
/mirror/api/subscriptions/* — PayPal paywall
/mirror/api/health          — Health check
/mirror/api/debug/*         — Debug endpoints
```

**Worker Processes:**
1. `AnalysisQueueProcessor` — Group analysis jobs (MySQL queue with `SELECT FOR UPDATE SKIP LOCKED`)
2. `DinaChatQueueProcessor` — @Dina chat messages via WebSocket
3. `TruthStreamQueueProcessor` — TruthStream synthesis jobs
4. `PersonalAnalysisQueueProcessor` — Personal analysis reports

**Inter-service Communication:**
- `DinaWebSocketClient.ts` — Persistent WSS connection to dina-server using DUMP protocol
- `DINALLMConnector.ts` — HTTP fallback connector for LLM synthesis

### 2.3 dina-server (AI Intelligence Layer)

| Attribute | Value |
|-----------|-------|
| **Runtime** | Node.js |
| **Framework** | Express 4.18 |
| **Language** | TypeScript 5.3, compiled to ES2020 |
| **Database** | MySQL (via mysql2) |
| **Cache** | Redis (ioredis + redis + redis-om) |
| **Auth** | JWT + service-key auth (X-Service-Key header) |
| **Security** | Helmet.js, timing-safe service auth |
| **LLM** | Ollama (local) — qwen2.5:3b, mistral:7b |
| **Logging** | Winston |
| **Process Mgmt** | PM2 (1 process) |
| **Real-time** | WebSocket server for DUMP protocol |
| **Testing** | Jest configured but no test files |

**Module Architecture (clean separation of concerns):**
```
src/
├── core/
│   ├── orchestrator/     # DinaCore — central message router
│   └── protocol/         # DUMP (Dina Universal Message Protocol)
├── config/
│   ├── database/         # MySQL pool
│   ├── wss/              # WebSocket server
│   └── redis.ts          # Redis manager
├── api/
│   ├── routes/           # HTTP API endpoints
│   └── middleware/       # Security, CORS, service auth
├── modules/
│   ├── mirror/ ◄─────── # THE ENTRY POINT (all mirror-server comms)
│   │   ├── index.ts          # MirrorModule class (EventEmitter)
│   │   ├── processors/       # Data, chat, insight, TruthStream, personal analysis
│   │   ├── managers/         # Context, storage
│   │   ├── systems/          # Notifications
│   │   ├── types/            # Type definitions
│   │   ├── groupManager.ts   # Group operations
│   │   ├── groupRoutes.ts    # Group HTTP routes
│   │   ├── truthStreamManager.ts
│   │   ├── truthStreamRoutes.ts
│   │   └── personalAnalysisRoutes.ts
│   ├── llm/              # LLM manager + intelligence layer
│   └── digim/            # Digital Intelligence Module
└── types/                # Shared types
```

---

## 3. Inter-Service Communication Map

```
┌───────────────────────────────────────────────────────────────────────┐
│                        COMMUNICATION FLOWS                           │
│                                                                       │
│  Browser ──HTTPS──► mirror-server ──WSS(DUMP)──► dina-server         │
│                                                      │                │
│  Browser ──WSS───► mirror-server (chat, groups)      │                │
│                                                      │                │
│  mirror-server workers ──WSS(DUMP)──► dina-server    │                │
│                                                      ▼                │
│                                              Ollama LLMs              │
│                                              (localhost:11434)        │
│                                                                       │
│  ALL paths into dina-server funnel through:                           │
│    src/modules/mirror/index.ts (MirrorModule class)                   │
│    ↓                                                                  │
│    src/core/orchestrator/index.ts (DinaCore router)                   │
│                                                                       │
│  DUMP Protocol Message Types:                                         │
│    mirror_process_data      → Data processing                         │
│    mirror_chat              → @Dina chat (streaming)                  │
│    mirror_synthesize_insights → Group insight synthesis               │
│    mirror_truthstream_*     → TruthStream (classify, analyze, etc.)   │
│    mirror_personal_analysis → Personal analysis reports               │
│    mirror_validate_group    → Group validation                        │
└───────────────────────────────────────────────────────────────────────┘
```

**Environment Variables Required:**

| Service | Key Variables |
|---------|--------------|
| Mirror (frontend) | `VITE_API_URL` |
| mirror-server | `MIRRORPORT`, `JWT_KEY`, `REDIS_PASSWORD`, `SYSTEM_MASTER_KEY`, `DB_HOST/USER/PASSWORD/NAME`, `TUGRRPRIV/TUGRRCERT/TUGRRINTERCERT`, `MIRRORSTORAGE`, PayPal config |
| dina-server | `DINA_PORT`, `REDIS_URL`, `TUGRRPRIV/TUGRRCERT/TUGRRINTERCERT`, `DB_HOST/USER/PASSWORD/NAME`, Ollama config |

**Shared Infrastructure:**
- MySQL (same server, possibly same DB or separate DBs)
- Redis (port 6380 for mirror-server, default 6379 for dina-server)
- SSL certificates (same cert files on disk)
- PM2 process manager
- Apache (reverse proxy + static file serving)

---

## 4. Current Deployment State & Pain Points

### What You Have Now (The Problem)
```
Developer (you)
     │
     ├── SSH into production VPS
     ├── Edit .ts files directly on /var/www/*
     ├── Run `npm run deploy` (tsc + pm2 reload)
     └── Pray it compiles 🙏
```

### The Risks
1. **No rollback** — if a deploy breaks, you have to manually fix or `git checkout`
2. **No testing gate** — broken code goes straight to production
3. **No staging** — you can't preview changes before users see them
4. **No build validation** — TypeScript errors only caught at deploy time
5. **No version tracking** — hard to know what's actually running
6. **Single point of failure** — one bad edit = site down
7. **No dependency audit** — npm vulnerabilities not tracked
8. **No health monitoring post-deploy** — deploys can silently fail

### What You Need (The Solution)

```
Developer (local IDE)
     │
     ├── Write code in VS Code (local)
     ├── Commit & push to GitHub
     │
     ▼
GitHub Actions (automated)
     │
     ├── Lint → Type-check → Build → Test
     ├── Security audit (npm audit)
     ├── Build artifacts
     │
     ├── [on PR] → Run checks, block merge if failing
     └── [on push to master] → Deploy to production
           │
           ├── SSH to server
           ├── Pull latest code
           ├── Install dependencies
           ├── Build (tsc)
           ├── Run health check
           ├── PM2 reload (zero-downtime)
           └── Post-deploy verification
```

---

## 5. CI/CD Architecture Plan

### Philosophy: Per-Service Pipelines (Self-Contained)

You said it best: teams that start with a "universal pipeline" regret it later.
Each repo gets its own standalone `ci-cd.yml` — no shared reusable workflows
needed at this scale. Keeps each pipeline independent and easy to customize:

```
mirror-server/.github/workflows/ci-cd.yml    ← Backend API pipeline
dina-server/.github/workflows/ci-cd.yml      ← AI/LLM server pipeline
Mirror/.github/workflows/ci-cd.yml           ← React frontend pipeline (at repo root)
```

### IDE Recommendation: VS Code

| Feature | VS Code | Eclipse |
|---------|---------|---------|
| TypeScript support | Native, excellent | Requires plugin |
| React/JSX | First-class | Awkward |
| Git integration | Built-in | Requires EGit |
| Extensions ecosystem | Massive | Limited for web |
| Remote SSH editing | Built-in (Remote-SSH) | Not practical |
| GitHub Actions | Extension available | N/A |
| Terminal integration | Excellent | Basic |
| Tailwind IntelliSense | Official extension | N/A |
| Performance | Lightweight | Heavy |

**Verdict: VS Code, hands down.** Eclipse is for Java enterprise. Your stack is TypeScript/React/Node — VS Code is purpose-built for this.

### Pipeline Design: Mirror Frontend

```yaml
# Trigger: Push to master/develop, PRs to master/develop
# Quality Gates (run in client/ working directory):
1. Checkout code
2. Setup Node.js 22 + npm cache
3. npm ci (clean install)
4. ESLint (lint check)
5. TypeScript type-check (tsc -b --noEmit)
6. Vite production build (produces dist/)
7. Verify build output (index.html + .htaccess)
8. Bundle size analysis (warn >5MB, alert >10MB)
9. Security audit (npm audit)
10. Upload dist/ as artifact (master only)
# Deploy (master push or manual trigger):
   a. Download build artifact
   b. SSH + backup existing dist/
   c. SCP dist/ to server at SERVER_DIST_PATH
   d. Smoke test (curl /Mirror/ → 200)
   e. Auto rollback from backup on failure
   f. Git tag + GitHub Release
```

### Pipeline Design: mirror-server

```yaml
# Trigger: Push to master/develop, PRs to master/develop
# Quality Gates:
1. Checkout code
2. Setup Node.js 22 + npm cache
3. npm ci
4. TypeScript strict type-check (tsc --noEmit)
5. Build production artifacts (tsc → dist/)
6. Security audit (npm audit)
7. Secret scanning (grep for hardcoded credentials)
8. Verify build artifacts (dist/index.js)
# Deploy (master push or manual trigger):
   a. SSH to server as mirror_app
   b. Snapshot current commit for rollback
   c. git fetch origin master && git reset --hard origin/master
   d. npm ci --production
   e. npm run build
   f. sudo pm2 reload ecosystem.config.js
   g. Health check (/mirror/api/health → 200, 6 retries)
   h. Auto rollback to snapshot commit on failure
   i. Git tag + GitHub Release
```

### Pipeline Design: dina-server

```yaml
# Trigger: Push to master/develop, PRs to master/develop
# Quality Gates:
1. Checkout code
2. Setup Node.js 22 + npm cache
3. npm ci
4. TypeScript strict type-check (tsc --noEmit)
5. Build production artifacts (tsc → dist/)
6. Security audit (npm audit)
7. Secret scanning (grep for hardcoded credentials)
8. Verify build artifacts (dist/index.js + dist/modules/mirror/index.js)
# Deploy (master push or manual trigger):
   a. SSH to server as dina
   b. Snapshot current commit for rollback
   c. git fetch origin master && git reset --hard origin/master
   d. npm ci --production
   e. npm run build (verify mirror module builds)
   f. sudo pm2 reload ecosystem.config.js
   g. Health check (/dina/api/v1/health → 200, 6 retries)
   h. Auto rollback to snapshot commit on failure
   i. Git tag + GitHub Release
```

### Versioning Strategy

```
Semantic Versioning: MAJOR.MINOR.PATCH
  
  v1.0.0 — Current production state (baseline)
  v1.1.0 — New feature
  v1.1.1 — Bug fix
  v2.0.0 — Breaking changes

Git Tags → GitHub Releases → Automatic deployment
```

### Branching Strategy (Git Flow Simplified)

```
master (production)
  │
  ├── develop (staging/integration)
  │     │
  │     ├── feature/truthstream-improvements
  │     ├── feature/new-visualization
  │     └── fix/websocket-reconnect
  │
  └── hotfix/critical-security-patch (→ direct to master)
```

### Secrets Management

GitHub Secrets needed (repository-level):
```
SERVER_HOST         — Production server IP/hostname
SERVER_USER         — SSH user (mirror_app or dina)
SERVER_SSH_KEY      — Private ed25519 SSH key for deployment
SERVER_DEPLOY_PATH  — /var/www/mirror-server or /var/www/dina-server
SERVER_DIST_PATH    — /var/www/mirror-client/dist (frontend only)
```

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Complete)
- [x] Create GitHub Actions workflow files for all 3 services
- [x] Server setup script (sudoers for PM2, git safe directories)
- [x] GitHub Secrets configured in all 3 repos
- [x] SSH deploy keys created and installed
- [ ] Install workflow files in each repo and push to develop
- [ ] Set up branch protection rules on GitHub

### Phase 2: Local Development Setup
- [ ] VS Code workspace configuration
- [ ] Recommended extensions list
- [ ] Local development scripts (dev servers)
- [ ] Environment variable templates

### Phase 3: Testing Infrastructure
- [ ] Add Vitest to Mirror frontend
- [ ] Add Jest to mirror-server
- [ ] Verify Jest in dina-server
- [ ] Write smoke tests for critical paths

### Phase 4: Staging Environment
- [ ] Set up staging branch deployment
- [ ] Configure staging environment variables
- [ ] Add staging health checks

### Phase 5: Advanced Automation
- [ ] Automatic dependency updates (Dependabot)
- [ ] Release automation (semantic-release)
- [ ] Deployment notifications (Slack/Discord)
- [ ] Performance monitoring post-deploy

---

## Teaching Notes

### What is CI/CD?

**CI (Continuous Integration)** — Every time you push code, it automatically:
- Compiles your TypeScript
- Checks for lint errors
- Runs tests
- Reports pass/fail

**CD (Continuous Deployment/Delivery)** — When code passes CI:
- **Delivery**: Automatically prepares for deployment (you click "deploy")
- **Deployment**: Automatically deploys to production (no human needed)

### Why GitHub Actions?

- **Free for public repos**, generous free tier for private
- **Native to GitHub** — no separate service to manage
- **YAML-based** — version-controlled alongside your code
- **Marketplace** — thousands of pre-built actions
- **Matrix builds** — test across Node versions simultaneously
- **Secrets management** — built-in encrypted secrets

### Why Not Docker (Yet)?

Docker adds value when you need:
- Identical environments across dev/staging/prod
- Multiple services with different Node versions
- Horizontal scaling (Kubernetes)

For a single-VPS setup with 2 Node.js services, Docker adds complexity without proportional benefit. We can add it in Phase 5 if/when you scale to multiple servers.

### What Changes in Your Daily Workflow?

**Before (current):**
```
SSH → vim index.ts → :wq → npm run deploy → check if it works
```

**After (with CI/CD):**
```
VS Code (local) → write code → git commit → git push
→ GitHub runs checks automatically
→ If PR: shows green/red checks, blocks merge if failing
→ If merge to master: auto-deploys to production
→ You get notified if deploy succeeds or fails
```
