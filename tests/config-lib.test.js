const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getEffectiveNotionDatabaseId,
  getEffectiveTelegramTarget,
  normalizeConfig
} = require('../config-lib');

test('normalizeConfig migrates legacy project arrays into settings + project metadata', () => {
  const config = normalizeConfig({
    chatId: '-12345',
    projects: [
      {
        topic: 'וילות',
        url: 'https://example.com',
        disabled: false
      }
    ]
  });

  assert.equal(config.settings.defaultTelegramTarget, 'telegram:-12345');
  assert.equal(config.settings.notionTokenEnv, 'NOTION_API_TOKEN');
  assert.equal(config.projects.length, 1);
  assert.ok(config.projects[0].id);
  assert.equal(config.projects[0].telegramTarget, 'telegram:-12345');
  assert.equal(config.projects[0].notionDatabaseId, '');
});

test('effective project routing falls back to defaults when per-topic values are empty', () => {
  const config = normalizeConfig({
    settings: {
      defaultTelegramTarget: 'telegram:-999',
      defaultNotionDatabaseId: 'db-123',
      notionTokenEnv: 'NOTION_TOKEN'
    },
    projects: [
      {
        topic: 'פנטהאוזים',
        url: 'https://example.com',
        telegramTarget: '',
        notionDatabaseId: ''
      }
    ]
  });

  const [project] = config.projects;
  assert.equal(getEffectiveTelegramTarget(project, config.settings), 'telegram:-999');
  assert.equal(getEffectiveNotionDatabaseId(project, config.settings), 'db-123');
});
