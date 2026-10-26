# Orchestrated Agentic AI for Software Engineering

This is a beginner-friendly implementation of objectives 1, 2, and 3 from the Review-1 PDF. It coordinates six specialist stages: requirements analysis, system design, code generation, test planning, code review, and documentation. Each stage receives the original requirements and earlier outputs through LangGraph shared workflow state. PostgreSQL and Prisma store each workflow and update stage progress as the agents work.

The app returns suggested artifacts for a person to review. It does not write generated code to disk or run generated code. Without a Gemini API key it runs in clearly labeled demo mode; with a key it calls the Google Gen AI SDK. The API key stays on the backend. Local runs and outputs are stored in PostgreSQL and remain available after restarting the API.

## Requirements

- Node.js 22.18 or newer and npm
- Docker Desktop
- A Gemini API key for live AI output (optional; demo mode works without one)

## Run on Windows

Open PowerShell in this folder. Start PostgreSQL from the project root:

```powershell
docker compose up -d db
```

The database is bound to this computer only and uses a named Docker volume. The sample password is for local learning only; do not expose this database or reuse that password in a deployed system.

### Start the backend

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run db:push
```

For live Gemini output, open `backend\.env` and add your key:

```text
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash
```

Leave `GEMINI_API_KEY` blank to use demo mode. Start the API:

```powershell
npm run dev
```

The API runs at `http://127.0.0.1:4000`; its health check is `http://127.0.0.1:4000/api/health`.

`npm run db:push` creates the local tables from the Prisma schema and generates the Prisma client. Use `npm run db:studio` from `backend` to open Prisma Studio and inspect saved runs.

### Start the frontend

Open a second PowerShell window in this folder:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL Vite prints, usually `http://localhost:5173`.

## What is implemented

- Express API for creating, tracking, listing, and reopening saved workflow runs
- PostgreSQL storage for each run and stage output through Prisma
- LangGraph shared state connecting the six specialist stages in order
- Google Gen AI SDK integration with a configurable model and demo fallback
- React interface to submit requirements and inspect each stage's output
- Per-stage running/completed/failed status so progress is visible while agents work
- Input-size validation and backend-only API key handling

## Suggested next steps

1. Add authentication and per-user project access before hosting it for a team.
2. Add a human approval step after design and code review.
3. Add isolated build and test execution with strict time, disk, and network limits; show logs and outcomes rather than claiming success without execution.
4. Add repository import/export on a user-selected branch after confirming write access and showing a diff for review.
5. Add LangSmith tracing, retry policy, and usage tracking after runs are reliable.

## Workflow

1. Enter a project brief in the React page.
2. The Express API validates it, creates a PostgreSQL workflow record, and returns a run ID.
3. LangGraph starts the Requirements Analyst; each stage saves its output and status to PostgreSQL.
4. The Designer, Code Generator, Test Planner, Reviewer, and Documentation Writer receive the original brief plus relevant earlier stage outputs.
5. The React page polls the run, displays stage progress, and lets you reopen saved runs later.
6. A student reviews the architecture, draft code, and test plan. This prototype does not execute generated code or publish to GitHub.

This is a local learning prototype. Do not paste passwords, API keys, private source code, or sensitive data into requirements.
