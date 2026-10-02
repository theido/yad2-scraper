require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { loadConfig, getEffectiveNotionDatabaseId } = require('../config-lib');
const { syncListingsToNotion } = require('../notion-lib');

const sanitizeTopicFileName = (topic) => String(topic || '').replace(/[\\/:*?"<>|]/g, '_');

const getNotionToken = (settings = {}) => {
  const envName = settings.notionTokenEnv || 'NOTION_API_TOKEN';
  return process.env[envName] || process.env.NOTION_API_TOKEN || process.env.NOTION_API_KEY || '';
};

const readTopicListings = (topic) => {
  const filePath = path.join(__dirname, '..', 'data', `${sanitizeTopicFileName(topic)}.json`);
  if (!fs.existsSync(filePath)) {
    return { filePath, listings: [] };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    filePath,
    listings: Array.isArray(parsed) ? parsed : []
  };
};

const main = async () => {
  const config = loadConfig();
  const notionToken = getNotionToken(config.settings);
  const requestedTopics = new Set(process.argv.slice(2).filter(Boolean));

  if (!notionToken) {
    throw new Error('No Notion token available');
  }

  const results = [];

  for (const project of config.projects) {
    if (requestedTopics.size > 0 && !requestedTopics.has(project.topic)) {
      continue;
    }
    const databaseId = getEffectiveNotionDatabaseId(project, config.settings);
    const { filePath, listings } = readTopicListings(project.topic);

    if (!databaseId) {
      results.push({
        topic: project.topic,
        databaseId: '',
        filePath,
        listings: listings.length,
        skipped: true,
        reason: 'no_database'
      });
      continue;
    }

    const syncResult = await syncListingsToNotion({
      token: notionToken,
      databaseId,
      topic: project.topic,
      listings,
      onProgress: (progress) => {
        console.log(`BACKFILL_PROGRESS ${JSON.stringify({ topic: project.topic, ...progress })}`);
      }
    });

    results.push({
      topic: project.topic,
      databaseId,
      filePath,
      listings: listings.length,
      ...syncResult
    });
  }

  console.log(JSON.stringify({ results }, null, 2));
};

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
