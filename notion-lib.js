const NOTION_VERSION = '2022-06-28';

const DEFAULT_PROPERTY_NAMES = {
  title: 'Name',
  listingId: 'Listing ID',
  topic: 'Topic',
  price: 'Price',
  location: 'Location',
  agency: 'Agency',
  link: 'Link',
  image: 'Image',
  firstSeen: 'First Seen',
  status: 'Status'
};

const databaseCache = new Map();

const buildHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Notion-Version': NOTION_VERSION,
  'Content-Type': 'application/json'
});

const notionRequest = async (token, method, path, body) => {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: buildHeaders(token),
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion API ${method} ${path} failed: ${response.status} ${errorText}`);
  }

  return response.status === 204 ? null : response.json();
};

const findTitlePropertyName = (properties = {}) => {
  for (const [name, value] of Object.entries(properties)) {
    if (value?.type === 'title') return name;
  }
  return DEFAULT_PROPERTY_NAMES.title;
};

const ensureDatabaseSchema = async (token, databaseId) => {
  const cacheKey = `${token.slice(-6)}:${databaseId}`;
  if (databaseCache.has(cacheKey)) {
    return databaseCache.get(cacheKey);
  }

  const database = await notionRequest(token, 'GET', `/databases/${databaseId}`);
  const existingProperties = database.properties || {};
  const titlePropertyName = findTitlePropertyName(existingProperties);

  const desiredProperties = {
    [DEFAULT_PROPERTY_NAMES.listingId]: { rich_text: {} },
    [DEFAULT_PROPERTY_NAMES.topic]: { rich_text: {} },
    [DEFAULT_PROPERTY_NAMES.price]: { rich_text: {} },
    [DEFAULT_PROPERTY_NAMES.location]: { rich_text: {} },
    [DEFAULT_PROPERTY_NAMES.agency]: { rich_text: {} },
    [DEFAULT_PROPERTY_NAMES.link]: { url: {} },
    [DEFAULT_PROPERTY_NAMES.image]: { url: {} },
    [DEFAULT_PROPERTY_NAMES.firstSeen]: { date: {} },
    [DEFAULT_PROPERTY_NAMES.status]: {
      select: {
        options: [
          { name: 'New', color: 'green' },
          { name: 'Seen', color: 'blue' },
          { name: 'Archived', color: 'gray' }
        ]
      }
    }
  };

  const missingProperties = {};
  for (const [name, schema] of Object.entries(desiredProperties)) {
    if (!existingProperties[name]) {
      missingProperties[name] = schema;
    }
  }

  if (Object.keys(missingProperties).length > 0) {
    await notionRequest(token, 'PATCH', `/databases/${databaseId}`, {
      properties: missingProperties
    });
  }

  const schemaInfo = {
    titlePropertyName,
    propertyNames: {
      ...DEFAULT_PROPERTY_NAMES,
      title: titlePropertyName
    }
  };

  databaseCache.set(cacheKey, schemaInfo);
  return schemaInfo;
};

const makeRichText = (value) => [{
  type: 'text',
  text: { content: String(value || '') }
}];

const buildPageProperties = (listing, topic, schemaInfo) => {
  const names = schemaInfo.propertyNames;
  return {
    [names.title]: {
      title: makeRichText(listing.title || listing.id || 'Listing')
    },
    [names.listingId]: {
      rich_text: makeRichText(listing.id || '')
    },
    [names.topic]: {
      rich_text: makeRichText(topic || '')
    },
    [names.price]: {
      rich_text: makeRichText(listing.price || '')
    },
    [names.location]: {
      rich_text: makeRichText(listing.location || '')
    },
    [names.agency]: {
      rich_text: makeRichText(listing.agency || '')
    },
    [names.link]: {
      url: listing.link || null
    },
    [names.image]: {
      url: listing.image || null
    },
    [names.firstSeen]: {
      date: { start: new Date().toISOString() }
    },
    [names.status]: {
      select: { name: 'New' }
    }
  };
};

const findExistingPage = async (token, databaseId, listingId, schemaInfo) => {
  const names = schemaInfo.propertyNames;
  const result = await notionRequest(token, 'POST', `/databases/${databaseId}/query`, {
    filter: {
      property: names.listingId,
      rich_text: {
        equals: String(listingId || '')
      }
    },
    page_size: 1
  });
  return result.results?.[0] || null;
};

const listExistingPagesByListingId = async (token, databaseId, schemaInfo) => {
  const names = schemaInfo.propertyNames;
  const pagesByListingId = new Map();
  let startCursor = undefined;

  do {
    const result = await notionRequest(token, 'POST', `/databases/${databaseId}/query`, {
      page_size: 100,
      start_cursor: startCursor
    });

    for (const page of result.results || []) {
      const richText = page?.properties?.[names.listingId]?.rich_text || [];
      const listingId = richText.map((part) => part.plain_text || '').join('').trim();
      if (listingId) {
        pagesByListingId.set(listingId, page.id);
      }
    }

    startCursor = result.has_more ? result.next_cursor : undefined;
  } while (startCursor);

  return pagesByListingId;
};

const upsertListingToNotion = async (token, databaseId, topic, listing) => {
  const schemaInfo = await ensureDatabaseSchema(token, databaseId);
  const properties = buildPageProperties(listing, topic, schemaInfo);
  const existingPage = await findExistingPage(token, databaseId, listing.id, schemaInfo);

  if (existingPage) {
    await notionRequest(token, 'PATCH', `/pages/${existingPage.id}`, { properties });
    return { action: 'updated', pageId: existingPage.id };
  }

  const created = await notionRequest(token, 'POST', '/pages', {
    parent: { database_id: databaseId },
    properties
  });
  return { action: 'created', pageId: created.id };
};

const syncListingsToNotion = async ({ token, databaseId, topic, listings, onProgress }) => {
  if (!token || !databaseId || !Array.isArray(listings) || listings.length === 0) {
    return { synced: 0, created: 0, updated: 0, skipped: true };
  }

  const schemaInfo = await ensureDatabaseSchema(token, databaseId);
  const existingPagesByListingId = await listExistingPagesByListingId(token, databaseId, schemaInfo);
  let created = 0;
  let updated = 0;

  for (let index = 0; index < listings.length; index += 1) {
    const listing = listings[index];
    const properties = buildPageProperties(listing, topic, schemaInfo);
    const existingPageId = existingPagesByListingId.get(String(listing.id || ''));

    if (existingPageId) {
      await notionRequest(token, 'PATCH', `/pages/${existingPageId}`, { properties });
      updated += 1;
    } else {
      const createdPage = await notionRequest(token, 'POST', '/pages', {
        parent: { database_id: databaseId },
        properties
      });

      created += 1;
      if (listing.id) {
        existingPagesByListingId.set(String(listing.id), createdPage.id);
      }
    }

    if (typeof onProgress === 'function' && ((index + 1) % 25 === 0 || index === listings.length - 1)) {
      onProgress({
        processed: index + 1,
        total: listings.length,
        created,
        updated
      });
    }
  }

  return {
    synced: listings.length,
    created,
    updated,
    skipped: false
  };
};

const listAccessibleNotionDatabases = async (token, query = '') => {
  const payload = {
    filter: { property: 'object', value: 'database' },
    page_size: 50
  };
  if (query) payload.query = query;

  const data = await notionRequest(token, 'POST', '/search', payload);
  return (data.results || []).map((database) => ({
    id: database.id,
    title: (database.title || []).map((part) => part.plain_text || '').join('') || '(Untitled)',
    url: database.url
  }));
};

module.exports = {
  DEFAULT_PROPERTY_NAMES,
  ensureDatabaseSchema,
  listAccessibleNotionDatabases,
  syncListingsToNotion
};
