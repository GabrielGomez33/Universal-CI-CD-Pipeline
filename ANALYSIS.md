# Universal CI/CD Pipeline - Ecosystem Analysis & Architecture Plan

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
     ├── [on merge to main] → Deploy to staging
     └── [on release tag] → Deploy to production
           │
           ├── SSH to VPS
           ├── Pull latest code
           ├── Install dependencies
           ├── Build (tsc)
           ├── Run health check
           ├── PM2 reload (zero-downtime)
           └── Post-deploy verification
```

---

## 5. CI/CD Architecture Plan

### Philosophy: Per-Service Pipelines + Shared Reusable Workflows

You said it best: teams that start with a "universal pipeline" regret it later.
So here's the architecture:

```
.github/
├── workflows/
│   ├── mirror-frontend.yml      # Mirror React app pipeline
│   ├── mirror-server.yml        # mirror-server pipeline
│   ├── dina-server.yml          # dina-server pipeline
│   └── reusable/
│       ├── node-setup.yml       # Shared: Node.js + npm ci + cache
│       ├── typescript-check.yml # Shared: tsc --noEmit
│       ├── security-audit.yml   # Shared: npm audit + dependency check
│       ├── ssh-deploy.yml       # Shared: SSH + deploy + PM2 reload
│       └── health-check.yml     # Shared: Post-deploy verification
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
# Trigger: Push to main, PRs
# Steps:
1. Checkout code
2. Setup Node.js 20 LTS + npm cache
3. npm ci (clean install)
4. ESLint (lint check)
5. TypeScript type-check (tsc -b --noEmit)
6. Vite build (produces dist/)
7. [Future] Run tests (Vitest)
8. [On main] Deploy:
   a. SCP dist/ to VPS:/var/www/html/Mirror/
   b. Verify .htaccess is in place
   c. Smoke test (curl the URL)
```

### Pipeline Design: mirror-server

```yaml
# Trigger: Push to main, PRs
# Steps:
1. Checkout code
2. Setup Node.js 20 LTS + npm cache
3. npm ci
4. TypeScript strict type-check (tsc --noEmit)
5. npm audit (security)
6. Build (tsc → dist/)
7. [Future] Run tests
8. [On main] Deploy:
   a. SSH to VPS
   b. cd /var/www/mirror-server
   c. git pull origin main
   d. npm ci --production
   e. npm run build
   f. pm2 reload ecosystem.config.js
   g. Health check (curl /mirror/api/health)
   h. If health check fails → pm2 reload previous version
```

### Pipeline Design: dina-server

```yaml
# Trigger: Push to main, PRs  
# Steps:
1. Checkout code
2. Setup Node.js 20 LTS + npm cache
3. npm ci
4. TypeScript strict type-check (tsc --noEmit)
5. npm audit (security)
6. Build (tsc → dist/)
7. [Future] Run tests (Jest)
8. [On main] Deploy:
   a. SSH to VPS
   b. cd /var/www/dina-server
   c. git pull origin main
   d. npm ci --production
   e. npm run build
   f. sudo pm2 reload ecosystem.config.js
   g. Health check (verify DINA responds on port 8445)
   h. If health check fails → rollback
```

### Shared Reusable Workflows (DRY principle)

Instead of duplicating steps, we extract common patterns:

1. **node-setup** — Install Node.js, restore npm cache, run `npm ci`
2. **typescript-check** — Run `tsc --noEmit` for type safety
3. **security-audit** — `npm audit --audit-level=high`
4. **ssh-deploy** — Connect via SSH, pull, build, restart PM2
5. **health-check** — Post-deploy verification with automatic rollback

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
main (production)
  │
  ├── develop (staging/integration)
  │     │
  │     ├── feature/truthstream-improvements
  │     ├── feature/new-visualization
  │     └── fix/websocket-reconnect
  │
  └── hotfix/critical-security-patch (→ direct to main)
```

### Secrets Management

GitHub Secrets needed (repository-level):
```
VPS_HOST          — Production server IP/hostname
VPS_USER          — SSH user (mirror_app or dina)
VPS_SSH_KEY       — Private SSH key for deployment
VPS_DEPLOY_PATH   — /var/www/mirror-server or /var/www/dina-server
```

---

## 6. Implementation Roadmap

### Phase 1: Foundation (This Session)
- [ ] Create GitHub Actions workflow files for all 3 services
- [ ] Create reusable workflow templates
- [ ] Set up branch protection rules
- [ ] Create `.env.example` files for documentation

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

### What's a "Reusable Workflow"?

Think of it like a function in code. Instead of copy-pasting the same 20 lines of YAML into 3 pipeline files, you write it once and call it:

```yaml
# In mirror-server.yml:
jobs:
  typecheck:
    uses: ./.github/workflows/reusable/typescript-check.yml
    with:
      node-version: '20'
      working-directory: '.'
```

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
→ If merge to main: auto-deploys to production
→ You get notified if deploy succeeds or fails
```
