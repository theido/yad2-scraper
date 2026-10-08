const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectBotProtection } = require('./scraper-lib');

const DEFAULT_CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEFAULT_PRIME_SETTLE_MS = 4000;
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
const DEFAULT_RETRY_DELAY_MS = 3000;
const DEFAULT_RETRIES = 3;

const getChromeExecutablePath = () => (
  process.env.YAD2_CHROME_EXECUTABLE
  || process.env.CHROME_EXECUTABLE_PATH
  || DEFAULT_CHROME_EXECUTABLE
);

const getChromeProfileDir = () => (
  process.env.YAD2_CHROME_PROFILE_DIR
  || path.join(os.homedir(), '.yad2-scraper', 'chrome-profile')
);

const isHeadlessEnabled = () => {
  const raw = String(process.env.YAD2_CHROME_HEADLESS || '').trim().toLowerCase();
  if (!raw) return false;
  return !['0', 'false', 'no'].includes(raw);
};

const getPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

const hasNextDataPagePayload = (html) => {
  const match = String(html || '').match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return false;

  try {
    const data = JSON.parse(match[1]);
    return Boolean(data?.props?.pageProps && typeof data.props.pageProps === 'object');
  } catch {
    return false;
  }
};

const responseLooksUsable = (html) => {
  if (!html || detectBotProtection(null, html)) return false;
  return pageLooksReady(html) || hasNextDataPagePayload(html);
};

const getPrimeUrl = (targetUrl) => {
  try {
    const url = new URL(targetUrl);
    const match = url.pathname.match(/^\/realestate\/(forsale|rent)/);
    const deal = match?.[1] || 'forsale';
    return `https://www.yad2.co.il/realestate/${deal}`;
  } catch {
    return 'https://www.yad2.co.il/realestate/forsale';
  }
};

class Yad2BrowserSession {
  constructor(options = {}) {
    this.chromium = options.chromium;
    this.executablePath = options.executablePath || getChromeExecutablePath();
    this.profileDir = options.profileDir || getChromeProfileDir();
    this.headless = options.headless ?? isHeadlessEnabled();
    this.retries = getPositiveNumber(options.retries, DEFAULT_RETRIES);
    this.requestTimeoutMs = getPositiveNumber(
      options.requestTimeoutMs ?? process.env.YAD2_BROWSER_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS
    );
    this.retryDelayMs = getPositiveNumber(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
    this.primeSettleMs = getPositiveNumber(options.primeSettleMs, DEFAULT_PRIME_SETTLE_MS);
    this.context = null;
    this.page = null;
    this.primeUrl = '';
  }

  async getChromium() {
    if (this.chromium) return this.chromium;
    try {
      ({ chromium: this.chromium } = require('playwright-core'));
      return this.chromium;
    } catch (error) {
      throw new Error(`playwright-core is required for chrome fetch mode: ${error.message}`);
    }
  }

  async open() {
    if (this.context && this.page) return;
    if (!fs.existsSync(this.executablePath)) {
      throw new Error(`Chrome executable not found at ${this.executablePath}`);
    }

    const chromium = await this.getChromium();
    const userDataDir = ensureChromeProfileDir(this.profileDir);
    this.context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: this.executablePath,
      headless: this.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-position=-2400,0'
      ],
      locale: 'he-IL',
      viewport: { width: 1440, height: 900 }
    });
    this.page = this.context.pages()[0] || await this.context.newPage();
  }

  async prime(targetUrl, { force = false } = {}) {
    await this.open();
    const nextPrimeUrl = getPrimeUrl(targetUrl);
    if (!force && this.primeUrl === nextPrimeUrl) return;

    await this.page.goto(nextPrimeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await this.page.waitForTimeout(this.primeSettleMs);
    this.primeUrl = nextPrimeUrl;
  }

  async signedFetch(url) {
    return this.page.evaluate(async ({ target, timeoutMs }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(target, {
          credentials: 'include',
          signal: controller.signal,
          headers: {
            accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
          }
        });
        return {
          status: response.status,
          contentType: response.headers.get('content-type') || '',
          body: await response.text()
        };
      } catch (error) {
        return {
          status: -1,
          contentType: '',
          body: '',
          error: String(error?.message || error)
        };
      } finally {
        clearTimeout(timeout);
      }
    }, { target: url, timeoutMs: this.requestTimeoutMs });
  }

  async reset(targetUrl) {
    await this.context.clearCookies();
    this.primeUrl = '';
    await this.prime(targetUrl, { force: true });
  }

  async fetch(url) {
    await this.prime(url);
    let lastReason = '';
    let lastCode = 'YAD2_PAGE_NOT_READY';

    for (let attempt = 1; attempt <= this.retries; attempt += 1) {
      const result = await this.signedFetch(url);
      const botReason = detectBotProtection(null, result.body);

      if (result.status >= 200 && result.status < 300 && !botReason && responseLooksUsable(result.body)) {
        return result.body;
      }

      if (botReason) {
        lastCode = 'BOT_DETECTION';
        lastReason = botReason;
      } else if (result.status === -1) {
        lastReason = result.error || 'browser fetch failed';
      } else {
        lastReason = `HTTP ${result.status}; content-type=${result.contentType || 'unknown'}`;
      }

      if (attempt < this.retries) {
        console.warn(`Signed Yad2 fetch blocked/not ready on attempt ${attempt}: ${lastReason}`);
        await this.page.waitForTimeout(this.retryDelayMs);
        await this.reset(url);
      }
    }

    const error = new Error(`Yad2 signed browser fetch failed after ${this.retries} attempts: ${lastReason}`);
    error.code = lastCode;
    throw error;
  }

  async close() {
    const context = this.context;
    this.context = null;
    this.page = null;
    this.primeUrl = '';
    if (context) await context.close();
  }
}

let sharedSession = null;

const getSharedSession = () => {
  if (!sharedSession) sharedSession = new Yad2BrowserSession();
  return sharedSession;
};

const fetchYad2ViaChrome = async (url) => getSharedSession().fetch(url);

const closeYad2Browser = async () => {
  const session = sharedSession;
  sharedSession = null;
  if (session) await session.close();
};

module.exports = {
  Yad2BrowserSession,
  closeYad2Browser,
  fetchYad2ViaChrome,
  getChromeExecutablePath,
  getChromeProfileDir,
  getPrimeUrl,
  isHeadlessEnabled,
  nextDataContainsListing,
  pageLooksReady,
  responseLooksUsable
};
