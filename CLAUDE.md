# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**yad2-scraper** is a full-stack application for scraping Yad2 (Israeli online classifieds) listings and notifying users via Telegram. It consists of:

1. **Backend Scraper** (Node.js): Scheduled scraping of Yad2 listings, change detection, and Telegram notifications
2. **Frontend Web App** (React): UI for managing scraper projects with GitHub OAuth authentication and automatic GitHub variables updates

---

## Repository Structure

```
.
├── scraper.js                    # Main scraping logic (cheerio-based HTML parsing)
├── generate-github-vars.js       # CLI tool for GitHub variables management
├── config.json                   # Local project configuration (fallback)
├── package.json                  # Backend dependencies
├── .github/
│   └── workflows/
│       └── scraper.yaml          # GitHub Actions scheduled job (9 AM & 5 PM UTC)
├── data/                         # Generated JSON files with historical listings (git-tracked)
├── frontend/                     # React/TypeScript web application
│   ├── src/
│   │   ├── components/           # React UI components
│   │   ├── lib/                  # Utilities (auth, API helpers)
│   │   └── types.ts              # Shared TypeScript types
│   ├── api/                      # Vercel serverless functions (API routes)
│   │   └── auth/                 # OAuth callback and auth endpoints
│   ├── vite.config.ts            # Vite build configuration
│   └── tailwind.config.js        # Tailwind CSS configuration
└── README.md                     # User-facing documentation
```

---

## Architecture & Key Design Patterns

### Backend Scraper Flow

1. **Configuration Loading** (`scraper.js:302-348`): 
   - Tries `SCRAPER_PROJECTS` (GitHub Actions environment variable) first
   - Falls back to `SCRAPER_TOPIC`/`SCRAPER_URL` environment variables
   - Final fallback: `config.json` for local development
   - Filters out projects with `disabled: true`

2. **Scraping Pipeline** (for each project):
   - Fetch HTML with browser-like User-Agent headers to avoid bot detection
   - Parse with cheerio, extract car/property details using multiple CSS selectors (defensive parsing for HTML variability)
   - Compare against `data/{topic}.json` to detect new items
   - Send Telegram notifications for new items (max 5 detailed messages per batch)

3. **Change Detection & Persistence**:
   - JSON files in `data/` directory store all historical listings
   - Each file is named after the project topic (e.g., `data/וילות.json`)
   - On new items, creates `push_me` flag file for GitHub Actions to detect changes and push

4. **GitHub Actions Integration** (`.github/workflows/scraper.yaml`):
   - Scheduled: 9 AM & 5 PM UTC daily
   - Receives API_TOKEN and CHAT_ID from GitHub secrets
   - Detects `push_me` file and commits updated data files

### Frontend Architecture

- **Framework**: React 18 with TypeScript, Vite bundler
- **Styling**: Tailwind CSS with Radix UI components
- **Authentication**: GitHub OAuth (user must own/have write access to the repo)
- **Data Flow**: User edits projects → frontend updates GitHub repository variable `SCRAPER_PROJECTS` → workflow reads updated config on next run
- **Deployment**: Vercel or Netlify (serverless functions for OAuth callback)

### Configuration Hierarchy (Runtime)

```
1. GitHub Actions env vars (SCRAPER_PROJECTS or SCRAPER_TOPIC/SCRAPER_URL)
2. Local environment variables (.env file)
3. config.json fallback
```

For **frontend**, configuration is environment-based:
- `VITE_GITHUB_CLIENT_ID` (public, used in browser)
- `GITHUB_CLIENT_SECRET` (private, server-only)
- `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME`

---

## Common Commands

### Backend (Root Directory)

```bash
# Install dependencies
npm install

# Run scraper locally (uses .env or config.json)
npm run scrape

# Generate GitHub variables JSON for manual copying to GitHub
npm run github-vars

# Auto-update GitHub repository variables (requires GitHub CLI + authentication)
npm run github-vars:update
```

### Frontend (frontend/ directory)

```bash
cd frontend

# Install dependencies
npm install

# Local development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Lint TypeScript and JSX
npm run lint
```

---

## Setup & Development Workflow

### Local Development

1. **Backend**:
   ```bash
   cp .env.example .env
   # Add API_TOKEN and CHAT_ID to .env
   npm install
   npm run scrape
   ```

2. **Frontend**:
   ```bash
   cd frontend
   cp .env.example .env
   # Add GitHub OAuth credentials to frontend/.env
   npm install
   npm run dev
   ```

### Production Deployment

- **Frontend**: Deploy to Vercel or Netlify with environment variables configured in deployment dashboard
- **Backend**: Relies on GitHub Actions; configuration via `SCRAPER_PROJECTS` GitHub repository variable

### GitHub OAuth Setup

1. Create OAuth App in GitHub Settings → Developer settings → OAuth Apps
2. Set Authorization callback URL to `{frontend-url}/api/auth/callback`
3. Add Client ID to `VITE_GITHUB_CLIENT_ID`
4. Add Client Secret to `GITHUB_CLIENT_SECRET`
5. Scopes needed: `read:user`, `repo` (for reading/writing repository variables)

---

## Key Implementation Details

### HTML Parsing Strategy (`scraper.js:36-176`)

- Uses multiple CSS selectors per field (defensive approach) because Yad2's HTML structure is subject to change
- Handles two link formats: `/item/` and `item/` (relative paths)
- Falls back to container queries if insufficient listings found
- Deduplicates results using `Set` based on item IDs

### Telegram Notification Throttling

- 2-second delay between HTTP requests to Yad2
- 1-second delay between Telegram messages to avoid rate limits
- Limits detailed messages to 5 items per run to prevent spam

### Frontend Authentication Flow

- `frontend/api/auth/me.ts`: Returns authenticated user info (validates GitHub session)
- `frontend/api/auth/callback.ts`: OAuth callback, exchanges code for token
- `frontend/api/projects.ts`: Updates GitHub repository variable via GitHub REST API
- Protected routes check session before rendering

---

## Important Quirks & Gotchas

1. **data/ Directory**: Git-tracked JSON files. New items detected by comparing against saved listings.
2. **push_me Flag**: GitHub Actions checks for this file to decide whether to commit. Created by scraper on data changes.
3. **Topic Names**: Must be URL-safe for data files (Hebrew is fine, used as-is for filenames).
4. **GitHub Variables**: `SCRAPER_PROJECTS` is a repository variable (not a secret), contains JSON array.
5. **Bot Detection**: Yad2 returns "ShieldSquare Captcha" page if User-Agent is missing/suspicious.
6. **Relative vs. Absolute Links**: Listings have mixed link formats; code normalizes to absolute URLs.

---

## Testing & Debugging

- **Local Scrape**: Run `npm run scrape` to test without GitHub Actions
- **Check Configuration**: Look at `config.json` or `console.log` messages in scraper output
- **Telegram Debugging**: Messages include URLs and counts to verify scraper found listings
- **HTML Changes**: If scraper stops finding items, Yad2's HTML structure likely changed—update CSS selectors in `scraper.js:36-176`
