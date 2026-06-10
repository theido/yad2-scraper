const test = require('node:test');
const assert = require('node:assert/strict');

const { extractListingsFromHtml } = require('../scraper-lib');

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
