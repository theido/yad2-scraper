# Yad 2 Smart Scraper

Scrapes and notifies on new Yad2 items with a minimal setup.

---

Struggling to find a high demand product in Yad2? No problem!
The scraper will scan Yad2 and will find for you the relevant items. Once a new item has been uploaded, it will notify you with a Telegram message.

The scraper will be executed approximately once in every 15 minutes (between 08:00-21:00). The cronjob is handled by Github actions - so it is not guaranteed to be executed.

When new items are uploaded, the next Github actions run will push the items to a `json` file under `data` directory (it will be created automatically when needed) - so remember to `git pull` if you want to add scraping targets.

---

### Setup:

To start using the scraper simply:
1. Clone / fork the repository.
2. Set up a Telegram bot.
3. **For local development**: Copy `.env.example` to `.env` and add your credentials:
   ```bash
   cp .env.example .env
   # Edit .env with your actual API_TOKEN and CHAT_ID
   ```
4. **For GitHub Actions**: Add `API_TOKEN` and `CHAT_ID` as GitHub secrets (more secure - recommended).

### Configuration Options:

#### ⚙️ **Option 1: GitHub Variables (Recommended for GitHub Actions)**

**For Multiple Projects:**
1. **Automatic way**: Run `npm run github-vars:update` (requires GitHub CLI)
2. **Manual way**: Run `npm run github-vars` to generate the JSON, then:
   - Go to your repository Settings → Secrets and variables → Actions
   - Add this repository variable: `SCRAPER_PROJECTS`
   - Set the value to the generated JSON array of projects:
   ```json
   [
     {
       "topic": "סורנטו",
       "url": "https://www.yad2.co.il/vehicles/cars?manufacturer=48&model=10718&year=2023--1",
       "disabled": false
     },
     {
       "topic": "טויוטה",
       "url": "https://www.yad2.co.il/vehicles/cars?manufacturer=20&model=12345&year=2023--1",
       "disabled": false
     }
   ]
   ```

**For Single Project (Backward Compatible):**
- `SCRAPER_TOPIC`: Your topic name (e.g., "סורנטו")
- `SCRAPER_URL`: Your Yad2 search URL

**GitHub CLI Setup (for automatic updates):**
1. Install GitHub CLI: https://cli.github.com/
2. Authenticate: `gh auth login`
3. Use: `npm run github-vars:update`

#### 📝 **Option 2: Manual config.json**
Edit `config.json` directly:
```json
{
  "settings": {
    "defaultTelegramTarget": "telegram:-1001234567890",
    "defaultNotionDatabaseId": "",
    "notionTokenEnv": "NOTION_API_TOKEN"
  },
  "projects": [
    {
      "id": "sorento-main",
      "topic": "סורנטו",
      "url": "https://www.yad2.co.il/vehicles/cars?manufacturer=48&model=10718&year=2023--1",
      "disabled": false,
      "telegramTarget": "telegram:-1001234567890",
      "notionDatabaseId": ""
    }
  ]
}
```

- `defaultTelegramTarget` is the fallback Hermes send target if a topic does not define its own route.
- `telegramTarget` lets each topic route updates to a different Telegram chat.
- `notionDatabaseId` lets each topic sync new listings into a different Notion database.
- `notionTokenEnv` defaults to `NOTION_API_TOKEN`.

### Running:
- **Local**: `npm run scrape`
- **GitHub**: the scraper workflow requires a macOS `self-hosted` runner; GitHub-hosted datacenter runners are blocked by Yad2

#### Chrome browser-session mode

Yad2's Radware challenge requires a real, headful browser on a residential connection. Chrome mode opens one persistent session, primes Yad2, and performs subsequent requests through the page's signed `window.fetch`:

```bash
YAD2_FETCH_MODE=chrome YAD2_CHROME_HEADLESS=0 npm run scrape
```

Notes:
- the scraper uses `playwright-core` with the local Google Chrome app
- the reusable profile defaults to `~/.yad2-scraper/chrome-profile`; override it with `YAD2_CHROME_PROFILE_DIR`
- Chrome must run headful from a logged-in desktop session; headless mode is expected to receive a captcha
- the session retries JavaScript challenges with a fresh cookie state; visible CAPTCHAs are reported as failures
- topics are processed sequentially through the same browser session
- Radware responses fail the run instead of being reported as a successful empty scan

#### GitHub self-hosted runner

Register this Mac as a repository runner in **Settings → Actions → Runners → New self-hosted runner**, with the custom label `yad2-browser`. Run the agent from the logged-in macOS user session so Chrome can open a window. The workflow targets `[self-hosted, macOS, yad2-browser]` and keeps its Chrome profile under `~/.yad2-scraper/chrome-profile` across runs.

The scheduled trigger remains commented out while this path is being validated. Start it manually with **Actions → Yad2 Scraper → Run workflow**.

If you want to disable a scraping topic, you can add a `"disabled": true` field in the `config.json` under a project in the projects list:
```
"projects": [
    {
      "topic": "...",
      "url": "...",
      "disabled": true
    }
  ]
```

---

## 🌐 Frontend Web App

A modern React-based web application for managing scraper projects via a mobile-friendly interface.

### Features

- ✅ GitHub OAuth authentication
- ✅ Add, edit, and delete projects
- ✅ Enable/disable projects with a toggle
- ✅ Mobile-responsive design (iPhone-friendly)
- ✅ Updates GitHub repository variables automatically

### Frontend Setup

#### 1. Install Dependencies

```bash
cd frontend
npm install
```

#### 2. Configure Environment Variables

Copy `.env.example` to `.env` in the `frontend/` directory:

```bash
cp frontend/.env.example frontend/.env
```

Fill in the required values:
- `VITE_GITHUB_CLIENT_ID`: Your GitHub OAuth App Client ID
- `GITHUB_CLIENT_SECRET`: Your GitHub OAuth App Client Secret
- `GITHUB_REPO_OWNER`: Your GitHub username or organization
- `GITHUB_REPO_NAME`: Your repository name (e.g., `yad2-scraper`)

#### 3. Create GitHub OAuth App

1. Go to [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: `Yad2 Scraper Config Manager`
   - **Homepage URL**: `https://your-domain.com` (your deployment URL)
   - **Authorization callback URL**: `https://your-domain.com/api/auth/callback`
4. Copy the **Client ID** and generate a **Client Secret**
5. Add these to your `.env` file

**Important**: The OAuth app needs the following scopes:
- `read:user` - To read user information
- `repo` - To read and write repository variables

#### 4. Local Development

```bash
cd frontend
npm run dev
```

The app will be available at `http://localhost:3000`

#### Local admin page for the local scraper

If you want to manage the on-disk `config.json` that the local Hermes cron reads, run:

```bash
npm run admin
```

Then open `http://127.0.0.1:4312`. This local admin page can:
- edit topics in `config.json`
- assign a `telegramTarget` per topic
- assign a `notionDatabaseId` per topic
- browse accessible Notion databases using the current `NOTION_API_TOKEN`

#### Tailnet-only admin with GitHub synchronization

Sync is **opt-in** (`ADMIN_GITHUB_SYNC=1`), and the server binds to `127.0.0.1:4312` by default. It only updates **theido/yad2-scraper → SCRAPER_PROJECTS**, never a repository supplied by a browser. Install/authenticate `gh` on the server with permission to edit repository Actions variables. Credentials and Notion tokens remain in the server environment / gh credential store; never put tokens in config or browser fields. Repository variables are not secret storage.

Example (replace `your-mac.your-tailnet.ts.net` with this machine's exact Tailscale HTTPS name):

```bash
ADMIN_GITHUB_SYNC=1 \
ADMIN_CONFIG_PATH=/Users/idoz/workspace/yad2-scraper/config.json \
ADMIN_ALLOWED_HOSTS='127.0.0.1:4312,localhost:4312,your-mac.your-tailnet.ts.net:9446' \
ADMIN_ALLOWED_ORIGINS='http://127.0.0.1:4312,http://localhost:4312,https://your-mac.your-tailnet.ts.net:9446' \
npm run admin
```

In a separate terminal:

```bash
tailscale serve --bg --https=9446 http://127.0.0.1:4312
```

Open `https://your-mac.your-tailnet.ts.net:9446`. Use **Serve**, not Funnel: do not expose this unauthenticated app to the public internet. Tailnet ACLs/grants should restrict port 9446 to trusted admin users/devices; any permitted user has full admin access. Keep the backend loopback-only. Host/Origin entries are exact, comma-separated allowlists including non-default ports; do not use wildcards. Forwarded headers are not trusted. No wildcard CORS is enabled; mutating requests require an allowed Origin and JSON, with a 48 KiB body limit.

With sync enabled, GitHub is the source on every refresh. Starting the admin does **not** upload local config or overwrite local files. On GitHub read failure, the UI explicitly displays a local fallback and disables Save. A save writes the complete normalized settings and projects (including default/per-topic Telegram and Notion routing), reads the exact variable back, verifies its value, then persists locally to `ADMIN_CONFIG_PATH` (default: this checkout's `config.json`). GitHub requests use `execFile` with JSON on stdin, 15-second process timeouts, and bounded output; no config is shell-interpolated. An uncertain write/read-back failure leaves local config untouched; refresh before retrying. A local persistence error after a verified GitHub write explicitly reports the partial success.

The API requires the version returned by GET for PUT and serializes saves within one server process. Stale tabs receive 409 and must refresh. **Limitation:** GitHub variables provide no atomic compare-and-swap, so another process or direct GitHub editor can still race between the pre-write read and PATCH. Run only one admin process and avoid concurrent external variable edits.

This changes the variable used by the **next** workflow run, not the workflow YAML. It does **not** register/start a self-hosted runner, dispatch an Action, enable the commented schedule, or alter the local cron. Runner/schedule activation remains a separate explicit step. `ADMIN_CONFIG_PATH` points at an existing local scraper config without changing the original code/worktree; successful explicit saves will update that file.

Verification: `npm ci && npm test`. Admin integration tests use an injected fake gh and in-memory local storage; they do not write real GitHub variables or the original scraper config.

#### Telegram admin commands

If you want to manage `config.json` from your phone through the same Telegram bot token, run:

```bash
npm run telegram-admin
```

Required security configuration:
- `TELEGRAM_ADMIN_CHAT_IDS=-1001234567890,123456789` lists the only chats allowed to run admin commands. The admin bot refuses to start without it.
- `TELEGRAM_ADMIN_POLL_TIMEOUT=30` to control long-poll timeout seconds

Supported commands:

```text
/topics
/topic add <topic> | <url>
/topic remove <topic>
/topic enable <topic>
/topic disable <topic>
/topic set-url <topic> | <url>
/topic set-telegram <topic> | <telegramTarget>
/topic set-notion <topic> | <databaseId>
/topic help
```

Examples:

```text
/topics
/topic add קאמפר | https://www.yad2.co.il/vehicles/cars?manufacturer=4
/topic disable וילות
/topic remove קאמפר
/topic enable סורנטו
/topic set-url אקספלורר | https://www.yad2.co.il/vehicles/cars?manufacturer=43&model=10593
/topic set-telegram אקספלורר | telegram:-1001234567890
```

#### 5. Deploy to Vercel (Recommended)

1. Install Vercel CLI: `npm i -g vercel`
2. Navigate to the project root: `cd ..`
3. Run `vercel` and follow the prompts
4. Add environment variables in Vercel dashboard:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `GITHUB_REPO_OWNER`
   - `GITHUB_REPO_NAME`
   - `VITE_GITHUB_CLIENT_ID` (same as `GITHUB_CLIENT_ID`)

**Note**: Update your GitHub OAuth App's callback URL to match your Vercel deployment URL.

#### 6. Deploy to Netlify (Alternative)

1. Install Netlify CLI: `npm i -g netlify-cli`
2. Navigate to the project root: `cd ..`
3. Run `netlify deploy --prod`
4. Add environment variables in Netlify dashboard:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `GITHUB_REPO_OWNER`
   - `GITHUB_REPO_NAME`
   - `VITE_GITHUB_CLIENT_ID` (same as `GITHUB_CLIENT_ID`)

**Note**: Update your GitHub OAuth App's callback URL to match your Netlify deployment URL.

### Using the Web App

1. Visit your deployed frontend URL
2. Click "Sign in with GitHub"
3. Authorize the application with the required permissions
4. Add, edit, or delete projects as needed
5. Changes are automatically saved to GitHub repository variables (`SCRAPER_PROJECTS`)

The web app directly updates the GitHub repository variable, so your GitHub Actions will use the updated configuration on the next run.