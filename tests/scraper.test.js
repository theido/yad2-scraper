const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { extractCaptchaDigest, extractListingsFromHtml } = require('../scraper-lib');
const { pageLooksReady, readPageContentStable } = require('../yad2-browser-fetcher');
const scraper = require('../scraper');

test('assertHealthyListingResult rejects an unexpected empty result set', () => {
  assert.throws(
    () => scraper.assertHealthyListingResult([], [{ id: 'known-listing' }], 'וילות'),
    (error) => error.code === 'SUSPICIOUS_EMPTY_RESULTS'
      && /וילות/.test(error.message)
      && /1 previously saved/.test(error.message)
  );
});

test('assertHealthyListingResult allows an empty result when there is no history', () => {
  assert.doesNotThrow(() => scraper.assertHealthyListingResult([], [], 'new topic'));
});

test('extractListingsFromHtml falls back to __NEXT_DATA__ when no item anchors exist', () => {
  const html = `<!doctype html>
  <html>
    <head>
      <title>נדל"ן</title>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: {
          pageProps: {
            dehydratedState: {
              queries: [
                {
                  queryKey: ['realestate-forsale-feed', { region: '3' }],
                  state: {
                    data: {
                      private: [
                        {
                          token: 'abc123',
                          price: 6500000,
                          address: {
                            city: { text: 'רמת גן' },
                            neighborhood: { text: 'חרוזים' },
                            street: { text: 'רות' },
                            house: { number: 10 }
                          },
                          additionalDetails: {
                            property: { text: 'גג/ פנטהאוז' },
                            roomsCount: 6,
                            squareMeter: 194
                          },
                          metaData: {
                            coverImage: 'https://img.example.com/cover.jpg'
                          },
                          tags: [{ name: 'חניה' }, { name: 'ממ"ד' }]
                        }
                      ]
                    }
                  }
                },
                {
                  queryKey: ['cms-storage', 'regions-hero-carousel', '{"slug":["tel-aviv-area"]}'],
                  state: { data: {} }
                }
              ]
            }
          }
        }
      })}</script>
    </head>
    <body></body>
  </html>`;

  const listings = extractListingsFromHtml(html, 'https://www.yad2.co.il/realestate/forsale?foo=bar');

  assert.equal(listings.length, 1);
  assert.equal(listings[0].id, 'abc123');
  assert.equal(listings[0].price, '₪ 6,500,000');
  assert.equal(listings[0].link, 'https://www.yad2.co.il/realestate/item/tel-aviv-area/abc123');
  assert.match(listings[0].title, /גג\/ פנטהאוז/);
  assert.match(listings[0].title, /רות 10/);
});

test('extractListingsFromHtml returns an empty array when no listings can be found', () => {
  const html = `<!doctype html>
  <html>
    <head>
      <title>נדל"ן</title>
    </head>
    <body>
      <div>Search shell only</div>
    </body>
  </html>`;

  const listings = extractListingsFromHtml(html, 'https://www.yad2.co.il/realestate/forsale?foo=bar');

  assert.deepEqual(listings, []);
});

test('extractListingsFromHtml treats Radware interstitial as bot detection', () => {
  const html = `<!doctype html>
  <html>
    <head><title>Radware Page</title></head>
    <body><h1>Access denied</h1></body>
  </html>`;

  assert.throws(
    () => extractListingsFromHtml(html, 'https://www.yad2.co.il/realestate/forsale'),
    (error) => error.code === 'BOT_DETECTION' && /Radware Page/.test(error.message)
  );
});

test('extractCaptchaDigest reads Radware captcha digest from challenge page', () => {
  const html = `
    <div id="ref">
      Captcha Digest: <strong>5b892429-bhmf-4d63-9573-65ca0ee9357a</strong>
    </div>
  `;

  assert.equal(extractCaptchaDigest(html), '5b892429-bhmf-4d63-9573-65ca0ee9357a');
});

test('pageLooksReady stays false on captcha pages and true on listing pages', () => {
  const captchaHtml = `<!doctype html><html><head><title>Radware Bot Manager Captcha</title></head><body></body></html>`;
  const emptyNextDataHtml = `<!doctype html><html><head><title>Loading</title><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script></head><body></body></html>`;
  const listingHtml = `<!doctype html><html><head><title>Listings</title><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"listing":{"token":"abc","price":100}}}}</script></head><body></body></html>`;
  const loadingShellHtml = '<!doctype html><html><head><title>Yad2</title></head><body><div id="root"></div></body></html>';

  assert.equal(pageLooksReady(captchaHtml), false);
  assert.equal(pageLooksReady(emptyNextDataHtml), false);
  assert.equal(pageLooksReady(listingHtml), true);
  assert.equal(pageLooksReady(loadingShellHtml), false);
});

test('readPageContentStable retries while Chrome is navigating', async () => {
  let attempts = 0;
  const page = {
    async content() {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('Unable to retrieve content because the page is navigating and changing the content.');
      }
      return '<html>ready</html>';
    },
    async waitForTimeout() {}
  };

  assert.equal(await readPageContentStable(page, { attempts: 3, delayMs: 0 }), '<html>ready</html>');
  assert.equal(attempts, 3);
});

test('syncTopicToNotion fails when a database is configured without a token', async (t) => {
  const envNames = ['NOTION_TEST_TOKEN', 'NOTION_API_TOKEN', 'NOTION_API_KEY'];
  const originalValues = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  envNames.forEach((name) => delete process.env[name]);
  t.after(() => {
    envNames.forEach((name) => {
      if (originalValues[name] === undefined) delete process.env[name];
      else process.env[name] = originalValues[name];
    });
  });

  await assert.rejects(
    scraper.syncTopicToNotion(
      { topic: 'וילות', notionDatabaseId: 'db-1' },
      { notionTokenEnv: 'NOTION_TEST_TOKEN' },
      [{ id: 'listing-1' }]
    ),
    /Notion token/
  );
});

test('createTelegramClient uses the effective per-topic Telegram target', () => {
  const client = scraper.createTelegramClient(
    { telegramTarget: 'telegram:-12345' },
    { defaultTelegramTarget: 'telegram:-99999' },
    'test-token'
  );

  assert.equal(client.chatId, '-12345');
});

test('checkIfHasNewItems does not persist listings when pre-persist sync fails', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yad2-scraper-test-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const filePath = path.join(dataDir, 'topic.json');
  fs.writeFileSync(filePath, '[]');

  await assert.rejects(
    scraper.checkIfHasNewItems(
      [{ id: 'listing-1' }],
      'topic',
      {
        dataDir,
        beforePersist: async () => {
          throw new Error('Notion unavailable');
        }
      }
    ),
    /Notion unavailable/
  );

  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), []);
});

test('scrapeItemsAndExtractDetails retries bot-detected pages and then succeeds', async (t) => {
  const originalFetch = global.fetch;
  let attempts = 0;

  const validHtml = `<!doctype html>
  <html>
    <head><title>Valid Listings</title></head>
    <body>
      <a href="/item/abc123">
        <h2>Test listing</h2>
        <span data-testid="price">₪ 7,000,000</span>
      </a>
    </body>
  </html>`;

  global.fetch = async () => {
    attempts += 1;
    return {
      async text() {
        if (attempts < 3) {
          return '<html><head><title>Radware Page</title></head><body>blocked</body></html>';
        }
        return validHtml;
      }
    };
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const listings = await scraper.scrapeItemsAndExtractDetails('https://www.yad2.co.il/realestate/forsale');

  assert.equal(attempts, 3);
  assert.equal(listings.length, 1);
  assert.equal(listings[0].id, 'abc123');
  assert.equal(listings[0].title, 'Test listing');
});
