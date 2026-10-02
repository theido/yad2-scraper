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
- **GitHub**: Push and wait for the workflow to run

#### Optional: Chrome-assisted local mode

If Yad2 starts returning Radware / captcha pages, you can switch the local scraper to a real Chrome session:

```bash
YAD2_FETCH_MODE=chrome YAD2_CHROME_HEADLESS=0 npm run scrape
```

Notes:
- the scraper will use `playwright-core` with the local Google Chrome app
- a persistent Chrome profile is stored under `.yad2-chrome-profile/`
- if a captcha window opens, solve it in that Chrome session and rerun the scraper
- in chrome mode, topics are processed sequentially to avoid opening multiple browser windows at once

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

#### Telegram admin commands

If you want to manage `config.json` from your phone through the same Telegram bot token, run:

```bash
npm run telegram-admin
```

Required security configuration:
- `TELEGRAM_ADMIN_CHAT_IDS=-5464355735,123456789` lists the only chats allowed to run admin commands. The admin bot refuses to start without it.
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