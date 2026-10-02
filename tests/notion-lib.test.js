const test = require('node:test');
const assert = require('node:assert/strict');

const { syncListingsToNotion } = require('../notion-lib');

test('syncListingsToNotion creates missing schema properties and inserts new listings', async (t) => {
  const originalFetch = global.fetch;
  const requests = [];

  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });

    if (url.endsWith('/v1/databases/db-1') && options.method === 'GET') {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            properties: {
              Name: { type: 'title' }
            }
          };
        }
      };
    }

    if (url.endsWith('/v1/databases/db-1') && options.method === 'PATCH') {
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true };
        }
      };
    }

    if (url.endsWith('/v1/databases/db-1/query')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { results: [] };
        }
      };
    }

    if (url.endsWith('/v1/pages') && options.method === 'POST') {
      return {
        ok: true,
        status: 200,
        async json() {
          return { id: 'page-123' };
        }
      };
    }

    throw new Error(`Unexpected fetch: ${options.method} ${url}`);
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await syncListingsToNotion({
    token: 'secret-token',
    databaseId: 'db-1',
    topic: 'וילות',
    listings: [
      {
        id: 'listing-1',
        title: 'Villa A',
        price: '₪ 1,000,000',
        location: 'Tel Aviv',
        agency: 'Broker',
        link: 'https://example.com/listing-1',
        image: 'https://example.com/image.jpg'
      }
    ]
  });

  assert.deepEqual(result, {
    synced: 1,
    created: 1,
    updated: 0,
    skipped: false
  });

  const schemaPatch = requests.find((request) => request.url.endsWith('/v1/databases/db-1') && request.options.method === 'PATCH');
  assert.ok(schemaPatch, 'expected schema patch request');

  const createPage = requests.find((request) => request.url.endsWith('/v1/pages'));
  assert.ok(createPage, 'expected create page request');
});
