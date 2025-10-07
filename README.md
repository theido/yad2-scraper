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
  "projects": [
    {
      "topic": "סורנטו",
      "url": "https://www.yad2.co.il/vehicles/cars?manufacturer=48&model=10718&year=2023--1",
      "disabled": false
    }
  ]
}
```

### Running:
- **Local**: `npm run scrape`
- **GitHub**: Push and wait for the workflow to run

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