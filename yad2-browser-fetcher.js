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

const valueContainsListing = (value) => {
  if (Array.isArray(value)) return value.some(valueContainsListing);
  if (!value || typeof value !== 'object') return false;

  const hasIdentity = Boolean(value.token || value.orderId || value.id);
  const hasListingDetails = value.price !== undefined
    || Boolean(value.address)
    || Boolean(value.additionalDetails)
    || Boolean(value.title);
  if (hasIdentity && hasListingDetails) return true;

  return Object.values(value).some(valueContainsListing);
};

const nextDataContainsListing = (html) => {
  const match = String(html || '').match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return false;

  try {
    return valueContainsListing(JSON.parse(match[1]));
  } catch {
    return false;
  }
};

const pageLooksReady = (html) => {
  if (!html) return false;

  const botReason = detectBotProtection(null, html);
  if (botReason) return false;

  if (/(?:href=["'][^"']*\/item\/|data-testid=["'][^"']*item)/i.test(html)) {
    return true;
  }

  return nextDataContainsListing(html);
};

const readPageContentStable = async (page, { attempts = 5, delayMs = 250 } = {}) => {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.content();
    } catch (error) {
      lastError = error;
      const isNavigationRace = /page is navigating|changing the content/i.test(error?.message || '');
      if (!isNavigationRace || attempt === attempts) throw error;
      await page.waitForTimeout(delayMs);
    }
  }

  throw lastError;
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
    let latestHtml = await readPageContentStable(page);

    while (Date.now() - startedAt < waitMs) {
      latestHtml = await readPageContentStable(page);
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
  nextDataContainsListing,
  pageLooksReady,
  readPageContentStable
};
