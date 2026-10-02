const fs = require('fs');
const path = require('path');
const { detectBotProtection } = require('./scraper-lib');

const DEFAULT_CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEFAULT_WAIT_MS = 120000;
const POLL_INTERVAL_MS = 1000;

const getChromeExecutablePath = () => (
  process.env.YAD2_CHROME_EXECUTABLE
  || process.env.CHROME_EXECUTABLE_PATH
  || DEFAULT_CHROME_EXECUTABLE
);

const getChromeProfileDir = () => (
  process.env.YAD2_CHROME_PROFILE_DIR
  || path.join(process.cwd(), '.yad2-chrome-profile')
);

const isHeadlessEnabled = () => {
  const raw = String(process.env.YAD2_CHROME_HEADLESS || '').trim().toLowerCase();
  if (!raw) return false;
  return !['0', 'false', 'no'].includes(raw);
};

const getWaitTimeoutMs = () => {
  const value = Number(process.env.YAD2_CHROME_WAIT_MS || DEFAULT_WAIT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_WAIT_MS;
};

const ensureChromeProfileDir = (profileDir) => {
  fs.mkdirSync(profileDir, { recursive: true });
  return profileDir;
};

const pageLooksReady = (html) => {
  if (!html) return false;
  if (html.includes('__NEXT_DATA__')) return true;

  const botReason = detectBotProtection(null, html);
  if (botReason) return false;

  return /(?:href=["'][^"']*\/item\/|data-testid=["'][^"']*item)/i.test(html);
};

const fetchYad2ViaChrome = async (url) => {
  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch (error) {
    throw new Error(`playwright-core is required for chrome fetch mode: ${error.message}`);
  }

  const executablePath = getChromeExecutablePath();
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Chrome executable not found at ${executablePath}`);
  }

  const userDataDir = ensureChromeProfileDir(getChromeProfileDir());
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: isHeadlessEnabled(),
    args: ['--disable-blink-features=AutomationControlled'],
    locale: 'he-IL',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 1200 }
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const startedAt = Date.now();
    const waitMs = getWaitTimeoutMs();
    let latestHtml = await page.content();

    while (Date.now() - startedAt < waitMs) {
      latestHtml = await page.content();
      if (pageLooksReady(latestHtml)) {
        return latestHtml;
      }
      await page.waitForTimeout(POLL_INTERVAL_MS);
    }

    const error = new Error(`Yad2 page did not become ready within ${waitMs}ms`);
    error.code = 'YAD2_PAGE_NOT_READY';
    throw error;
  } finally {
    await context.close();
  }
};

module.exports = {
  fetchYad2ViaChrome,
  getChromeExecutablePath,
  getChromeProfileDir,
  isHeadlessEnabled,
  pageLooksReady
};
