# CodeScope — Code Change Impact & Risk Analyzer

> An advanced developer tool to analyze JavaScript and TypeScript codebases, extract full-project dependency graphs, evaluate the ripple impact of code changes, compute transparent risk scores, prioritize test suites, inspect source code in an integrated workspace, and persist history using PostgreSQL and Prisma.

---

## 🌟 Key Capabilities (Stages 1 – 8)

1. **Safe Repository Ingestion (Stage 2)**:
   - Drag-and-drop `.zip` upload (up to 50MB) with strict Zip Slip validation, sanitization, and automated directory structure extraction.
2. **Comprehensive Static AST Dependency Extraction (Stage 3)**:
   - Multi-syntax parser powered by Babel AST for ES6 modules (`import`/`export`), CommonJS (`require`), dynamic imports (`import()`), template rendering (`res.render`), and CSS/asset references.
3. **Change Impact Analysis Engine (Stage 4)**:
   - High-performance recursive graph traversal with visited set memoization to trace direct dependents, indirect ripple effects, propagation paths, and circular dependency cycles.
4. **Interactive Force-Directed Graph Visualization (Stage 5)**:
   - Interactive HTML5 Canvas graph rendering with physics-based layout, zoom/pan navigation, impacted file highlighting, and seamless node selection.
5. **Transparent Change Risk Scoring & Test Recommender (Stage 6)**:
   - Deterministic 0–100 risk scoring with factor breakdown (Direct Callers, Ripple Impact, Depth Penalty, Blast Radius, Cycle Penalty).
   - Smart test detection associating changed modules with existing unit test suites and prioritizing actions (Critical, High, Medium, Low).
6. **Full-Workspace Source Code Viewer (Stage 7)**:
   - Resizable 95% desktop viewport with syntax highlighting, line numbers, quick search, copy-to-clipboard, and bidirectional dependency inspection drawer.
7. **Database Persistence & Analysis History (Stage 8)**:
   - Robust relational persistence with PostgreSQL & Prisma ORM.
   - Saved Repositories management (view, reopen, delete with cascade cleanup).
   - Complete Analysis History tracking every change impact evaluation across server restarts, with graceful offline fallback.

---

## 📁 Architecture & Project Structure

```
CodeScope/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma         # Prisma ORM schema (Repository, AnalysisHistory)
│   ├── src/
│   │   ├── analyzer/             # Dependency, Impact, Risk & Test Recommendation engines
│   │   ├── db/                   # Prisma database client & connectivity helpers
│   │   ├── routes/               # Express REST API routes (/api/repos, /api/health)
│   │   ├── services/             # Database persistence & repository service layer
│   │   ├── types/                # TypeScript interface definitions
│   │   ├── utils/                # Zip extractor & file scanner utilities
│   │   └── index.ts              # Express application entry point
│   ├── tests/                    # Automated Node.js test runner suites
│   ├── .env.example              # Environment variables template
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/           # React UI components (Explorer, Graph, CodeViewer, History)
│   │   ├── types/                # Shared frontend TypeScript interfaces
│   │   ├── utils/                # Formatting & tree helper utilities
│   │   ├── App.tsx               # Main application controller
│   │   └── App.css               # Full workspace responsive styling
│   └── vite.config.ts            # Vite bundler configuration with API proxy
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18+ (v20+ recommended)
- **PostgreSQL**: v14+ (v16 used in development)

### 1. Backend Setup
```bash
cd backend
npm install

# Copy environment template and configure your PostgreSQL database credentials
cp .env.example .env

# Sync database schema with PostgreSQL
npm run db:push

# Start backend server in development mode (port 5000)
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install

# Start Vite development server (port 5173)
npm run dev
```

Open your browser at `http://localhost:5173` to start using CodeScope.

---

## 🧪 Testing & Verification

CodeScope includes comprehensive automated unit, integration, and security test suites:

```bash
# Run all backend unit & security tests (26 passing tests across 5 test suites)
npm --prefix backend test

# Run Stage 7 source code viewer integration checkpoints
node backend/test-stage7.js

# Run Stage 8 PostgreSQL persistence & restart audit
node backend/test-stage8-audit.js

# Verify production builds
npm --prefix backend run build
npm --prefix frontend run build
```

---

## 🛡️ Security Highlights
- **Strict Path Traversal Protection**: All file viewing requests validate canonical paths strictly against the extracted repository root.
- **Binary Content Guards**: Safe inspection and extension validation prevent crashes on binary or large assets.
- **Zero Hardcoded Secrets**: All database and server configurations strictly use `.env` files and environment variables.

---

## 📄 License
ISC
